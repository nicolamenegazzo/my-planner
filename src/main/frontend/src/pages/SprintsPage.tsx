import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { Modal, PageHeader, StatusBar } from '../components';
import { useData } from '../data';
import { useTasks } from '../hooks';
import { formatDate, isoDate, SPRINT_STATUS } from '../labels';
import { toastError } from '../toast';
import type { Sprint } from '../types';

type SprintForm = Pick<Sprint, 'name' | 'goal' | 'startDate' | 'endDate'>;

function addDays(iso: string, days: number) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

function nextMonday() {
  const d = new Date();
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return isoDate(d);
}

export function SprintsPage() {
  const { sprints, reload, isDone } = useData();
  const { tasks, reload: reloadTasks } = useTasks();
  const [editing, setEditing] = useState<{ id: string | null; form: SprintForm } | null>(null);
  const [closing, setClosing] = useState<Sprint | null>(null);

  const openNew = () => {
    const last = [...sprints].sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
    const start = last ? addDays(last.endDate, 1) : nextMonday();
    setEditing({
      id: null,
      form: { name: `Sprint ${sprints.length + 1}`, goal: '', startDate: start, endDate: addDays(start, 13) },
    });
  };

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await Promise.all([reload(), reloadTasks()]);
    } catch (e) {
      toastError(e);
    }
  };

  const order = { ACTIVE: 0, PLANNED: 1, CLOSED: 2 } as const;
  const sorted = [...sprints].sort(
    (a, b) => order[a.status] - order[b.status] || (a.status === 'CLOSED' ? b.startDate.localeCompare(a.startDate) : a.startDate.localeCompare(b.startDate)),
  );

  return (
    <div className="page">
      <PageHeader title="Sprint">
        <button className="btn btn-primary" onClick={openNew}>
          + Nuovo sprint
        </button>
      </PageHeader>

      {sorted.length === 0 && <div className="empty-state">Nessuno sprint. Creane uno per pianificare il lavoro a iterazioni.</div>}

      <div className="sprint-list">
        {sorted.map((s) => {
          const st = tasks.filter((t) => t.sprintId === s.id);
          const done = st.filter(isDone).length;
          const hours = st.reduce((sum, t) => sum + (t.estimateHours ?? 0), 0);
          return (
            <div key={s.id} className={`sprint-card sprint-${s.status.toLowerCase()}`}>
              <div className="sprint-card-head">
                <span className="mini-pill" style={{ background: SPRINT_STATUS[s.status].color }}>
                  {SPRINT_STATUS[s.status].label}
                </span>
                <h3>{s.name}</h3>
                <span className="muted">
                  {formatDate(s.startDate)} – {formatDate(s.endDate)}
                </span>
              </div>
              {s.goal && <p className="sprint-goal">🎯 {s.goal}</p>}
              <div className="sprint-card-stats">
                <span>
                  {done}/{st.length} completati
                </span>
                <span>{hours} h stimate</span>
                <div className="grow">
                  <StatusBar tasks={st} />
                </div>
              </div>
              <div className="sprint-card-actions">
                {s.status === 'PLANNED' && (
                  <button className="btn btn-primary" onClick={() => run(() => api.sprints.start(s.id))}>
                    Avvia sprint
                  </button>
                )}
                {s.status === 'ACTIVE' && (
                  <button className="btn btn-primary" onClick={() => setClosing(s)}>
                    Chiudi sprint
                  </button>
                )}
                {s.status !== 'CLOSED' && (
                  <button
                    className="btn"
                    onClick={() => setEditing({ id: s.id, form: { name: s.name, goal: s.goal ?? '', startDate: s.startDate, endDate: s.endDate } })}
                  >
                    Modifica
                  </button>
                )}
                <button
                  className="btn btn-danger-ghost"
                  onClick={() =>
                    confirm(`Eliminare "${s.name}"? I suoi task torneranno nel backlog.`) && run(() => api.sprints.remove(s.id))
                  }
                >
                  Elimina
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <SprintFormModal
          initial={editing.form}
          title={editing.id ? 'Modifica sprint' : 'Nuovo sprint'}
          onClose={() => setEditing(null)}
          onSubmit={(form) =>
            run(async () => {
              await (editing.id ? api.sprints.update(editing.id, form) : api.sprints.create(form));
              setEditing(null);
            })
          }
        />
      )}

      {closing && (
        <CloseSprintModal
          sprint={closing}
          candidates={sprints.filter((s) => s.status === 'PLANNED')}
          unfinished={tasks.filter((t) => t.sprintId === closing.id && !isDone(t)).length}
          onClose={() => setClosing(null)}
          onConfirm={(target) =>
            run(async () => {
              await api.sprints.close(closing.id, target);
              setClosing(null);
            })
          }
        />
      )}
    </div>
  );
}

function SprintFormModal({
  initial,
  title,
  onClose,
  onSubmit,
}: {
  initial: SprintForm;
  title: string;
  onClose: () => void;
  onSubmit: (f: SprintForm) => void;
}) {
  const [form, setForm] = useState(initial);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };
  return (
    <Modal title={title} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>
          Nome
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label>
          Obiettivo
          <textarea rows={2} value={form.goal ?? ''} onChange={(e) => setForm({ ...form, goal: e.target.value })} />
        </label>
        <div className="form-row">
          <label>
            Inizio
            <input type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </label>
          <label>
            Fine
            <input type="date" required value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Annulla
          </button>
          <button className="btn btn-primary">Salva</button>
        </div>
      </form>
    </Modal>
  );
}

function CloseSprintModal({
  sprint,
  candidates,
  unfinished,
  onClose,
  onConfirm,
}: {
  sprint: Sprint;
  candidates: Sprint[];
  unfinished: number;
  onClose: () => void;
  onConfirm: (target: string | null) => void;
}) {
  const [target, setTarget] = useState(candidates[0]?.id ?? '');
  return (
    <Modal title={`Chiudi ${sprint.name}`} onClose={onClose}>
      <div className="form">
        {unfinished > 0 ? (
          <label>
            {unfinished} task non completati: dove spostarli?
            <select className="plain-select" value={target} onChange={(e) => setTarget(e.target.value)}>
              {candidates.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({formatDate(s.startDate)})
                </option>
              ))}
              <option value="">Backlog</option>
            </select>
          </label>
        ) : (
          <p>Tutti i task dello sprint sono completati. 🎉</p>
        )}
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Annulla
          </button>
          <button className="btn btn-primary" onClick={() => onConfirm(target || null)}>
            Chiudi sprint
          </button>
        </div>
      </div>
    </Modal>
  );
}
