import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useData } from './data';
import { NEUTRAL_COLOR, textColorOn } from './labels';
import type { CustomValue, FieldDefinition, Label, Task, User } from './types';

const AVATAR_COLORS = ['#e2445c', '#00c875', '#579bfc', '#fdab3d', '#a25ddc', '#037f4c', '#ff642e', '#784bd1'];

export function Avatar({ user, size = 26 }: { user?: User | null; size?: number }) {
  if (!user) {
    return (
      <span className="avatar avatar-empty" style={{ width: size, height: size }} title="Non assegnato">
        ?
      </span>
    );
  }
  const initials = user.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
  let hash = 0;
  for (const ch of user.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.42, background: AVATAR_COLORS[hash % AVATAR_COLORS.length] }}
      title={user.displayName}
    >
      {initials}
    </span>
  );
}

/** Avatar sovrapposti di più persone. */
export function AvatarStack({ userIds, size = 24, max = 3 }: { userIds: string[]; size?: number; max?: number }) {
  const { userById } = useData();
  if (userIds.length === 0) return <Avatar size={size} />;
  const shown = userIds.slice(0, max);
  return (
    <span className="avatar-stack" title={userIds.map((id) => userById.get(id)?.displayName ?? '?').join(', ')}>
      {shown.map((id) => (
        <Avatar key={id} user={userById.get(id)} size={size} />
      ))}
      {userIds.length > max && (
        <span className="avatar avatar-more" style={{ width: size, height: size, fontSize: size * 0.4 }}>
          +{userIds.length - max}
        </span>
      )}
    </span>
  );
}

/** Selezione multipla delle persone assegnate, con menu a tendina. */
export function AssigneesPicker({ value, onChange, size = 24 }: { value: string[]; onChange: (ids: string[]) => void; size?: number }) {
  const { users } = useData();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  const options = users.filter((u) => u.active || value.includes(u.id));

  return (
    <span className="picker" ref={ref}>
      <button type="button" className="picker-trigger" onClick={() => setOpen((o) => !o)}>
        <AvatarStack userIds={value} size={size} />
      </button>
      {open && (
        <div className="picker-menu">
          {options.map((u) => (
            <label key={u.id} className="picker-option">
              <input type="checkbox" checked={value.includes(u.id)} onChange={() => toggle(u.id)} />
              <Avatar user={u} size={20} />
              <span>{u.displayName}</span>
              {!u.active && <small className="muted">(disattivato)</small>}
            </label>
          ))}
          {options.length === 0 && <div className="muted small">Nessun utente</div>}
        </div>
      )}
    </span>
  );
}

/** Pillola colorata in stile monday per scegliere un'etichetta. */
export function LabelSelect({
  labels,
  value,
  onChange,
  allowEmpty = false,
  emptyLabel = '',
}: {
  labels: { id?: string; name: string; color?: string | null }[];
  value?: string | null;
  onChange: (value: string | null) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  const key = (l: { id?: string; name: string }) => l.id ?? l.name;
  const current = labels.find((l) => key(l) === value);
  const bg = current?.color ?? NEUTRAL_COLOR;
  return (
    <select
      // senza valore: pillola tenue (stile del tema) invece del grigio pieno
      className={current ? 'pill' : 'pill pill-empty'}
      style={current ? { background: bg, color: textColorOn(bg) } : undefined}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
    >
      {(allowEmpty || !current) && <option value="">{emptyLabel}</option>}
      {labels.map((l) => (
        <option key={key(l)} value={key(l)}>
          {l.name}
        </option>
      ))}
    </select>
  );
}

export function StatusSelect({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  const { statuses } = useData();
  return <LabelSelect labels={statuses} value={value} onChange={(v) => v && onChange(v)} />;
}

export function PrioritySelect({ value, onChange }: { value?: string | null; onChange: (p: string | null) => void }) {
  const { priorities } = useData();
  return <LabelSelect labels={priorities} value={value} onChange={onChange} allowEmpty />;
}

export function LabelBadge({ label }: { label?: Label | { name: string; color?: string | null } | null }) {
  if (!label) return null;
  const bg = label.color ?? NEUTRAL_COLOR;
  return (
    <span className="mini-pill" style={{ background: bg, color: textColorOn(bg) }}>
      {label.name}
    </span>
  );
}

export function UserSelect({
  users,
  value,
  onChange,
  emptyLabel = 'Non assegnato',
  className = 'plain-select',
}: {
  users: User[];
  value?: string | null;
  onChange: (id: string | null) => void;
  emptyLabel?: string;
  className?: string;
}) {
  return (
    <select className={className} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{emptyLabel}</option>
      {users
        .filter((u) => u.active || u.id === value)
        .map((u) => (
          <option key={u.id} value={u.id}>
            {u.displayName}
          </option>
        ))}
    </select>
  );
}

/** Editor del valore di un campo personalizzato, secondo il tipo. */
export function FieldInput({
  field,
  value,
  onChange,
  compact = false,
}: {
  field: FieldDefinition;
  value: CustomValue | undefined;
  onChange: (v: CustomValue | null) => void;
  compact?: boolean;
}) {
  const [text, setText] = useState(value != null ? String(value) : '');
  useEffect(() => setText(value != null ? String(value) : ''), [value]);
  const commit = () => {
    const current = value != null ? String(value) : '';
    if (text === current) return;
    if (field.type === 'NUMBER') {
      const n = text.trim() === '' ? null : Number(text.replace(',', '.'));
      if (n === null || Number.isFinite(n)) onChange(n);
      else setText(current);
    } else {
      onChange(text.trim() === '' ? null : text);
    }
  };

  switch (field.type) {
    case 'LABEL':
      return (
        <LabelSelect labels={field.options} value={value != null ? String(value) : null} onChange={onChange} allowEmpty />
      );
    case 'DATE':
      return (
        <input
          type="date"
          className={compact ? 'date-input' : ''}
          value={value != null ? String(value) : ''}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );
    default:
      return (
        <input
          className={compact ? `inline-input ${field.type === 'NUMBER' ? 'num' : ''}` : ''}
          inputMode={field.type === 'NUMBER' ? 'decimal' : undefined}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      );
  }
}

/** Barra di distribuzione degli stati, come il "battery" di monday.com. */
export function StatusBar({ tasks }: { tasks: Pick<Task, 'status'>[] }) {
  const { statuses } = useData();
  if (tasks.length === 0) return <div className="status-bar status-bar-empty" />;
  return (
    <div className="status-bar">
      {statuses.map((s) => {
        const n = tasks.filter((t) => t.status === s.id).length;
        if (n === 0) return null;
        return (
          <span
            key={s.id}
            style={{ flexGrow: n, background: s.color }}
            title={`${s.name}: ${n}/${tasks.length} (${Math.round((n / tasks.length) * 100)}%)`}
          />
        );
      })}
    </div>
  );
}

export function Modal({ title, onClose, children, width = 480 }: { title: string; onClose: () => void; children: ReactNode; width?: number }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width }}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Chiudi">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="page-header">
      <h1>{title}</h1>
      <div className="page-actions">{children}</div>
    </div>
  );
}
