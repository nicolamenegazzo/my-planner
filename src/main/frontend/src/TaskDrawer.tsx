import { useEffect, useRef, useState } from 'react';
import { api, downloadFile, toRequest } from './api';
import { AssigneesPicker, Avatar, FieldInput, LabelSelect, PrioritySelect, StatusSelect, UserSelect } from './components';
import { useData } from './data';
import { formatDate, formatSize } from './labels';
import { toastError } from './toast';
import type { Attachment, Comment, Task, TimeSlot } from './types';

interface Props {
  taskId: string;
  onClose: () => void;
  onSaved: (task: Task) => void;
  onDeleted: (id: string) => void;
}

/** Pannello laterale di dettaglio del task (l'equivalente dell'item view di monday.com). */
export function TaskDrawer({ taskId, onClose, onSaved, onDeleted }: Props) {
  const { projects, sprints, users, userById, statuses, labelById, fields } = useData();
  const [task, setTask] = useState<Task | null>(null);
  const [draft, setDraft] = useState<Task | null>(null);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [newSubtask, setNewSubtask] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([api.tasks.get(taskId), api.slots.byTask(taskId)])
      .then(([t, s]) => {
        setTask(t);
        setDraft(t);
        setSlots(s);
      })
      .catch(toastError);
  }, [taskId]);

  const dirty = !!task && !!draft && JSON.stringify(toRequest(task)) !== JSON.stringify(toRequest(draft));

  const close = () => {
    if (dirty && !confirm('Ci sono modifiche non salvate. Chiudere comunque?')) return;
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!draft || !task) {
    return (
      <div className="overlay overlay-drawer" onMouseDown={onClose}>
        <div className="drawer" onMouseDown={(e) => e.stopPropagation()}>
          Caricamento…
        </div>
      </div>
    );
  }

  const set = (changes: Partial<Task>) => setDraft({ ...draft, ...changes });

  /** Aggiorna il task dopo un'azione salvata subito (commento, allegato) senza perdere le modifiche in corso. */
  const mergeServer = (saved: Task) => {
    setTask(saved);
    setDraft({ ...draft, comments: saved.comments, attachments: saved.attachments, updatedAt: saved.updatedAt });
    onSaved(saved);
  };

  const save = async () => {
    if (!draft.title.trim()) return toastError(new Error('Il titolo è obbligatorio'));
    setSaving(true);
    try {
      const saved = await api.tasks.update(draft.id, toRequest(draft));
      setTask(saved);
      setDraft(saved);
      onSaved(saved);
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Eliminare il task "${task.title}" con commenti e allegati?`)) return;
    try {
      await api.tasks.remove(task.id);
      onDeleted(task.id);
      onClose();
    } catch (e) {
      toastError(e);
    }
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      let saved = task;
      for (const file of Array.from(files)) saved = await api.tasks.upload(task.id, file);
      mergeServer(saved);
    } catch (e) {
      toastError(e);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const removeAttachment = async (a: Attachment) => {
    if (!confirm(`Eliminare l'allegato "${a.name}"?`)) return;
    try {
      mergeServer(await api.tasks.removeAttachment(task.id, a.fileId));
    } catch (e) {
      toastError(e);
    }
  };

  const updateSubtask = (index: number, changes: Partial<Task['subtasks'][number]>) =>
    set({ subtasks: draft.subtasks.map((s, i) => (i === index ? { ...s, ...changes } : s)) });

  const addSubtask = () => {
    if (!newSubtask.trim()) return;
    set({ subtasks: [...draft.subtasks, { title: newSubtask.trim(), done: false }] });
    setNewSubtask('');
  };

  const setCustom = (fieldId: string, value: string | number | null) => {
    const next = { ...draft.customFields };
    if (value === null) delete next[fieldId];
    else next[fieldId] = value;
    set({ customFields: next });
  };

  const doneSubtasks = draft.subtasks.filter((s) => s.done).length;
  const plannedHours = slots.reduce((sum, s) => sum + (new Date(s.end).getTime() - new Date(s.start).getTime()) / 3_600_000, 0);
  const looseAttachments = task.attachments.filter((a) => !a.commentId);

  return (
    <div className="overlay overlay-drawer" onMouseDown={close}>
      <div className="drawer" onMouseDown={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <input className="drawer-title" value={draft.title} onChange={(e) => set({ title: e.target.value })} />
          <button className="icon-btn" onClick={close} aria-label="Chiudi">
            ✕
          </button>
        </div>
        {task.mondayId && <p className="muted small drawer-origin">Importato da monday.com (elemento {task.mondayId})</p>}

        <div className="field-grid">
          <label>Stato</label>
          <StatusSelect value={draft.status} onChange={(status) => set({ status })} />
          <label>Priorità</label>
          <PrioritySelect value={draft.priority} onChange={(priority) => set({ priority })} />
          <label>Persone</label>
          <div className="row">
            <AssigneesPicker value={draft.assigneeIds} onChange={(assigneeIds) => set({ assigneeIds })} size={26} />
            <span className="muted small">{draft.assigneeIds.map((id) => userById.get(id)?.displayName ?? '?').join(', ')}</span>
          </div>
          <label>Progetto</label>
          <select className="plain-select" value={draft.projectId} onChange={(e) => set({ projectId: e.target.value })}>
            {projects
              .filter((p) => !p.archived || p.id === draft.projectId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
          <label>Sprint</label>
          <select className="plain-select" value={draft.sprintId ?? ''} onChange={(e) => set({ sprintId: e.target.value || null })}>
            <option value="">Backlog</option>
            {sprints
              .filter((s) => s.status !== 'CLOSED' || s.id === draft.sprintId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
          <label>Timeline</label>
          <div className="row">
            <input type="date" value={draft.startDate ?? ''} onChange={(e) => set({ startDate: e.target.value || null })} />
            <span className="muted">→</span>
            <input type="date" value={draft.dueDate ?? ''} onChange={(e) => set({ dueDate: e.target.value || null })} />
          </div>
          <label>Ore</label>
          <div className="row">
            <input
              type="number"
              min={0}
              step={0.5}
              placeholder="stima"
              value={draft.estimateHours ?? ''}
              onChange={(e) => set({ estimateHours: e.target.value === '' ? null : Number(e.target.value) })}
            />
            <input
              type="number"
              min={0}
              step={0.5}
              placeholder="effettive"
              value={draft.actualHours ?? ''}
              onChange={(e) => set({ actualHours: e.target.value === '' ? null : Number(e.target.value) })}
            />
          </div>
          {fields.map((f) => (
            <FieldRow key={f.id} label={f.name}>
              <FieldInput field={f} value={draft.customFields[f.id]} onChange={(v) => setCustom(f.id, v)} />
            </FieldRow>
          ))}
        </div>

        <h4>Descrizione</h4>
        <textarea
          rows={4}
          value={draft.description ?? ''}
          placeholder="Aggiungi una descrizione…"
          onChange={(e) => set({ description: e.target.value })}
        />

        <h4>
          Sottotask{' '}
          {draft.subtasks.length > 0 && (
            <small>
              {doneSubtasks}/{draft.subtasks.length}
            </small>
          )}
        </h4>
        <div className="subtasks">
          {draft.subtasks.map((s, i) => (
            <div key={s.id ?? `new-${i}`} className="subtask-row">
              <input type="checkbox" checked={s.done} onChange={() => updateSubtask(i, { done: !s.done })} />
              <input
                className={`inline-input ${s.done ? 'done' : ''}`}
                value={s.title}
                onChange={(e) => updateSubtask(i, { title: e.target.value })}
              />
              <LabelSelect
                labels={statuses}
                value={s.status}
                allowEmpty
                onChange={(status) => updateSubtask(i, { status, done: status ? !!labelById.get(status)?.done : s.done })}
              />
              <UserSelect users={users} value={s.assigneeId} onChange={(assigneeId) => updateSubtask(i, { assigneeId })} emptyLabel="—" />
              <input type="date" className="date-input" value={s.dueDate ?? ''} onChange={(e) => updateSubtask(i, { dueDate: e.target.value || null })} />
              <input
                className="inline-input num"
                placeholder="h"
                value={s.estimateHours ?? ''}
                onChange={(e) => updateSubtask(i, { estimateHours: e.target.value === '' ? null : Number(e.target.value) || 0 })}
              />
              <button className="icon-btn" onClick={() => set({ subtasks: draft.subtasks.filter((_, j) => j !== i) })}>
                ✕
              </button>
            </div>
          ))}
        </div>
        <input
          className="add-input"
          placeholder="+ Aggiungi sottotask (Invio)"
          value={newSubtask}
          onChange={(e) => setNewSubtask(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addSubtask()}
        />

        <div className="drawer-actions">
          <button className="btn btn-primary" disabled={!dirty || saving} onClick={save}>
            {saving ? 'Salvataggio…' : 'Salva modifiche'}
          </button>
          <button className="btn btn-danger-ghost" onClick={remove}>
            Elimina task
          </button>
        </div>

        <h4>
          Allegati <small>{task.attachments.length > 0 ? task.attachments.length : ''}</small>
        </h4>
        <AttachmentList attachments={looseAttachments} onRemove={removeAttachment} />
        <input ref={fileInput} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
        <button className="btn btn-small" disabled={uploading} onClick={() => fileInput.current?.click()}>
          {uploading ? 'Caricamento…' : '📎 Aggiungi file'}
        </button>

        <h4>
          Pianificazione <small>{plannedHours > 0 ? `${plannedHours.toFixed(1)} h in calendario` : 'nessuno slot'}</small>
        </h4>
        <ul className="slot-list">
          {slots.map((s) => (
            <li key={s.id}>
              {formatDate(s.start)} {s.start.slice(11, 16)}–{s.end.slice(11, 16)} · {userById.get(s.userId)?.displayName ?? '—'}
            </li>
          ))}
        </ul>

        <h4>Aggiornamenti</h4>
        <CommentThread task={task} onSaved={mergeServer} onRemoveAttachment={removeAttachment} />
      </div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <label>{label}</label>
      <div>{children}</div>
    </>
  );
}

function AttachmentList({ attachments, onRemove }: { attachments: Attachment[]; onRemove: (a: Attachment) => void }) {
  if (attachments.length === 0) return null;
  return (
    <ul className="attachments">
      {attachments.map((a) => (
        <li key={a.fileId}>
          <button className="link-like" onClick={() => downloadFile(a.fileId, a.name).catch(toastError)}>
            📄 {a.name}
          </button>
          <small className="muted">{formatSize(a.size)}</small>
          <button className="icon-btn" title="Elimina allegato" onClick={() => onRemove(a)}>
            ✕
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Aggiornamenti in stile monday: i più recenti in alto, con le risposte sotto ciascuno. */
function CommentThread({
  task,
  onSaved,
  onRemoveAttachment,
}: {
  task: Task;
  onSaved: (t: Task) => void;
  onRemoveAttachment: (a: Attachment) => void;
}) {
  const { userById } = useData();
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const post = async (body: string, parentId: string | null) => {
    if (!body.trim()) return false;
    try {
      onSaved(await api.tasks.comment(task.id, body.trim(), parentId));
      return true;
    } catch (e) {
      toastError(e);
      return false;
    }
  };

  const roots = task.comments.filter((c) => !c.parentId).reverse();
  const repliesOf = (id: string) => task.comments.filter((c) => c.parentId === id);
  const attachmentsOf = (id: string) => task.attachments.filter((a) => a.commentId === id);

  const renderComment = (c: Comment, reply = false) => (
    <div className={reply ? 'comment reply' : 'comment'}>
      <div className="comment-head">
        <Avatar user={userById.get(c.authorId)} size={22} />
        <strong>{userById.get(c.authorId)?.displayName ?? 'Utente rimosso'}</strong>
        <small>{new Date(c.createdAt).toLocaleString('it-IT')}</small>
      </div>
      <p>{c.text}</p>
      <AttachmentList attachments={attachmentsOf(c.id)} onRemove={onRemoveAttachment} />
    </div>
  );

  return (
    <>
      <div className="comment-box">
        <textarea rows={2} placeholder="Scrivi un aggiornamento…" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn btn-primary" disabled={!text.trim()} onClick={async () => (await post(text, null)) && setText('')}>
          Pubblica
        </button>
      </div>
      <ul className="comments">
        {roots.map((c) => (
          <li key={c.id}>
            {renderComment(c)}
            {repliesOf(c.id).map((r) => (
              <div key={r.id}>{renderComment(r, true)}</div>
            ))}
            {replyTo === c.id ? (
              <div className="comment-box reply-box">
                <textarea rows={2} autoFocus placeholder="Rispondi…" value={replyText} onChange={(e) => setReplyText(e.target.value)} />
                <div className="row">
                  <button className="btn btn-small" onClick={() => setReplyTo(null)}>
                    Annulla
                  </button>
                  <button
                    className="btn btn-small btn-primary"
                    disabled={!replyText.trim()}
                    onClick={async () => {
                      if (await post(replyText, c.id)) {
                        setReplyText('');
                        setReplyTo(null);
                      }
                    }}
                  >
                    Rispondi
                  </button>
                </div>
              </div>
            ) : (
              <button className="link-like small" onClick={() => setReplyTo(c.id)}>
                ↳ Rispondi
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
