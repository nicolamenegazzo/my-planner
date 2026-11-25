import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { LabelBadge, Modal, PageHeader } from '../components';
import { useData } from '../data';
import { PROJECT_COLORS } from '../labels';
import { toastError } from '../toast';
import type { FieldDefinition, FieldType, Label, LabelKind } from '../types';

const FIELD_TYPES: Record<FieldType, string> = {
  TEXT: 'Testo',
  NUMBER: 'Numero',
  DATE: 'Data',
  LABEL: 'Etichette',
};

export function SettingsPage() {
  const { isAdmin } = useAuth();
  const { statuses, priorities } = useData();
  if (!isAdmin) return <Navigate to="/board" replace />;
  return (
    <div className="page">
      <PageHeader title="Impostazioni" />
      <div className="settings-grid">
        <section className="settings-card">
          <h3>Stati</h3>
          <p className="muted small">
            L'ordine è quello delle colonne del kanban. Gli stati "completato" chiudono il task (sprint, calendario,
            filtri).
          </p>
          <LabelsEditor kind="STATUS" labels={statuses} />
        </section>
        <section className="settings-card">
          <h3>Priorità</h3>
          <LabelsEditor kind="PRIORITY" labels={priorities} />
        </section>
      </div>
      <section className="settings-card">
        <h3>Campi personalizzati</h3>
        <p className="muted small">
          Colonne aggiuntive dei task (es. Type, Epic, Rif. Ticket importati da monday). "In board" le mostra come
          colonne nella tabella; nel dettaglio del task sono sempre visibili.
        </p>
        <FieldsEditor />
      </section>
    </div>
  );
}

function LabelsEditor({ kind, labels }: { kind: LabelKind; labels: Label[] }) {
  const { reload } = useData();
  const [name, setName] = useState('');
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const [replacing, setReplacing] = useState<{ label: Label; message: string } | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await reload();
    } catch (e) {
      toastError(e);
    }
  };

  const save = (l: Label, changes: Partial<Label>) =>
    run(() => api.labels.update(l.id, { kind, name: l.name, color: l.color, done: l.done, ...changes }));

  const move = (index: number, delta: number) => {
    const ids = labels.map((l) => l.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    run(() => api.labels.reorder(kind, ids));
  };

  const remove = async (l: Label) => {
    if (!confirm(`Eliminare "${l.name}"?`)) return;
    try {
      await api.labels.remove(l.id);
      await reload();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setReplacing({ label: l, message: e.message });
      else toastError(e);
    }
  };

  return (
    <>
      <ul className="label-list">
        {labels.map((l, i) => (
          <li key={l.id}>
            <ColorInput value={l.color} onCommit={(color) => save(l, { color })} />
            <BlurInput value={l.name} onCommit={(v) => v.trim() && save(l, { name: v.trim() })} />
            {kind === 'STATUS' && (
              <label className="check small" title="Lo stato chiude il task">
                <input type="checkbox" checked={l.done} onChange={(e) => save(l, { done: e.target.checked })} /> completato
              </label>
            )}
            <button className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} title="Sposta su">
              ↑
            </button>
            <button className="icon-btn" disabled={i === labels.length - 1} onClick={() => move(i, 1)} title="Sposta giù">
              ↓
            </button>
            <button className="icon-btn" onClick={() => remove(l)} title="Elimina">
              ✕
            </button>
          </li>
        ))}
      </ul>
      <form
        className="row add-label"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          run(() => api.labels.create({ kind, name: name.trim(), color, done: false })).then(() => setName(''));
        }}
      >
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        <input placeholder={kind === 'STATUS' ? 'Nuovo stato' : 'Nuova priorità'} value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-small" disabled={!name.trim()}>
          Aggiungi
        </button>
      </form>

      {replacing && (
        <ReplaceLabelModal
          label={replacing.label}
          message={replacing.message}
          candidates={labels.filter((l) => l.id !== replacing.label.id)}
          allowNone={kind === 'PRIORITY'}
          onClose={() => setReplacing(null)}
          onConfirm={(replacement) =>
            run(() => api.labels.remove(replacing.label.id, replacement)).then(() => setReplacing(null))
          }
        />
      )}
    </>
  );
}

function ReplaceLabelModal({
  label,
  message,
  candidates,
  allowNone,
  onClose,
  onConfirm,
}: {
  label: Label;
  message: string;
  candidates: Label[];
  allowNone: boolean;
  onClose: () => void;
  onConfirm: (replacement: string) => void;
}) {
  const [target, setTarget] = useState(candidates[0]?.id ?? '');
  return (
    <Modal title={`Elimina "${label.name}"`} onClose={onClose}>
      <div className="form">
        <p>{message}</p>
        <label>
          Sostituisci con
          <select className="plain-select" value={target} onChange={(e) => setTarget(e.target.value)}>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            {allowNone && <option value="">Nessuna priorità</option>}
          </select>
        </label>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Annulla
          </button>
          <button className="btn btn-primary" disabled={!allowNone && !target} onClick={() => onConfirm(target)}>
            Sostituisci ed elimina
          </button>
        </div>
      </div>
    </Modal>
  );
}

function FieldsEditor() {
  const { fields, reload } = useData();
  const [name, setName] = useState('');
  const [type, setType] = useState<FieldType>('TEXT');

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await reload();
    } catch (e) {
      toastError(e);
    }
  };

  const save = (f: FieldDefinition, changes: Partial<FieldDefinition>) => {
    const next = { ...f, ...changes };
    return run(() =>
      api.fields.update(f.id, { name: next.name, type: next.type, options: next.options, position: next.position, showInBoard: next.showInBoard }),
    );
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= fields.length) return;
    const a = fields[index]!;
    const b = fields[target]!;
    run(async () => {
      await api.fields.update(a.id, { ...a, position: target });
      await api.fields.update(b.id, { ...b, position: index });
    });
  };

  return (
    <>
      {fields.length === 0 && <p className="muted">Nessun campo personalizzato.</p>}
      <ul className="field-list">
        {fields.map((f, i) => (
          <li key={f.id}>
            <div className="row">
              <BlurInput value={f.name} onCommit={(v) => v.trim() && save(f, { name: v.trim() })} />
              <span className="badge">{FIELD_TYPES[f.type]}</span>
              <label className="check small">
                <input type="checkbox" checked={f.showInBoard} onChange={(e) => save(f, { showInBoard: e.target.checked })} /> in board
              </label>
              <span className="spacer" />
              <button className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} title="Sposta su">
                ↑
              </button>
              <button className="icon-btn" disabled={i === fields.length - 1} onClick={() => move(i, 1)} title="Sposta giù">
                ↓
              </button>
              <button
                className="icon-btn"
                title="Elimina"
                onClick={() => confirm(`Eliminare il campo "${f.name}" e i suoi valori in tutti i task?`) && run(() => api.fields.remove(f.id))}
              >
                ✕
              </button>
            </div>
            {f.type === 'LABEL' && <OptionsEditor field={f} onSave={(options) => save(f, { options })} />}
          </li>
        ))}
      </ul>
      <form
        className="row add-label"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          run(() => api.fields.create({ name: name.trim(), type, options: [], showInBoard: true })).then(() => setName(''));
        }}
      >
        <input placeholder="Nuovo campo" value={name} onChange={(e) => setName(e.target.value)} />
        <select className="plain-select" value={type} onChange={(e) => setType(e.target.value as FieldType)}>
          {(Object.keys(FIELD_TYPES) as FieldType[]).map((t) => (
            <option key={t} value={t}>
              {FIELD_TYPES[t]}
            </option>
          ))}
        </select>
        <button className="btn btn-small" disabled={!name.trim()}>
          Aggiungi
        </button>
      </form>
    </>
  );
}

function OptionsEditor({ field, onSave }: { field: FieldDefinition; onSave: (options: FieldDefinition['options']) => void }) {
  const [name, setName] = useState('');
  return (
    <div className="options-editor">
      {field.options.map((o, i) => (
        <span key={o.name} className="option-chip">
          <ColorInput
            value={o.color ?? '#c4c4c4'}
            onCommit={(color) => onSave(field.options.map((x, j) => (j === i ? { ...x, color } : x)))}
          />
          <LabelBadge label={o} />
          <button className="icon-btn" onClick={() => onSave(field.options.filter((_, j) => j !== i))}>
            ✕
          </button>
        </span>
      ))}
      <input
        className="option-add"
        placeholder="+ opzione (Invio)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.trim()) {
            onSave([...field.options, { name: name.trim(), color: '#c4c4c4' }]);
            setName('');
          }
        }}
      />
    </div>
  );
}

function BlurInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input
      className="inline-input"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== value && onCommit(text)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

/** Il selettore nativo emette un evento a ogni movimento: il colore viene salvato solo alla chiusura. */
function ColorInput({ value, onCommit }: { value: string; onCommit: (color: string) => void }) {
  const [color, setColor] = useState(value);
  useEffect(() => setColor(value), [value]);
  return (
    <input
      type="color"
      title="Colore"
      value={color}
      onChange={(e) => setColor(e.target.value)}
      onBlur={() => color !== value && onCommit(color)}
    />
  );
}
