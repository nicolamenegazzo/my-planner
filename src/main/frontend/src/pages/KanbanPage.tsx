import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AvatarStack, LabelBadge, PageHeader, StatusBar, UserSelect } from '../components';
import { useData } from '../data';
import { useTasks } from '../hooks';
import { formatDate, isoDate, textColorOn } from '../labels';
import { TaskDrawer } from '../TaskDrawer';
import { toast } from '../toast';
import type { Task } from '../types';

export function KanbanPage() {
  const { sprints, activeSprint, projects, users, statuses, isDone } = useData();
  const [sprintId, setSprintId] = useState(activeSprint?.id ?? '');
  const { tasks, patch, add, replace, removeLocal } = useTasks({ sprintId }, !!sprintId);
  const [searchParams] = useSearchParams();
  const [projectFilter, setProjectFilter] = useState(() => searchParams.get('project') ?? '');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [showEmpty, setShowEmpty] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');

  const sprint = sprints.find((s) => s.id === sprintId);
  const selectable = sprints.filter((s) => s.status !== 'CLOSED');

  if (!sprint) {
    return (
      <div className="page">
        <PageHeader title="Sprint attivo" />
        <div className="empty-state">
          Nessuno sprint attivo. Vai alla pagina <Link to="/sprint">Sprint</Link> per crearne o avviarne uno.
          {selectable.length > 0 && (
            <div style={{ marginTop: 12 }}>
              Oppure apri uno sprint pianificato:{' '}
              <select className="plain-select" value="" onChange={(e) => setSprintId(e.target.value)}>
                <option value="">Scegli…</option>
                {selectable.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>
    );
  }

  const visible = tasks.filter(
    (t) => (!projectFilter || t.projectId === projectFilter) && (!assigneeFilter || t.assigneeIds.includes(assigneeFilter)),
  );
  const done = visible.filter(isDone);
  const totalHours = visible.reduce((s, t) => s + (t.estimateHours ?? 0), 0);
  const doneHours = done.reduce((s, t) => s + (t.estimateHours ?? 0), 0);
  const daysLeft = Math.ceil((new Date(sprint.endDate + 'T23:59:59').getTime() - Date.now()) / 86_400_000);
  const firstStatus = statuses[0]?.id;
  const columns = statuses.filter(
    (s) => showEmpty || dragging || s.id === firstStatus || visible.some((t) => t.status === s.id),
  );

  const onDrop = (status: string, e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    setDragging(false);
    const task = tasks.find((t) => t.id === e.dataTransfer.getData('text/plain'));
    if (task && task.status !== status) patch(task, { status });
  };

  const quickAdd = async () => {
    const projectId = projectFilter || projects.find((p) => !p.archived)?.id;
    if (!newTitle.trim()) return;
    if (!projectId) return toast('Crea prima un progetto', 'error');
    const created = await add({
      title: newTitle.trim(),
      projectId,
      sprintId: sprint.id,
      status: firstStatus,
      assigneeIds: assigneeFilter ? [assigneeFilter] : [],
    });
    if (created) setNewTitle('');
  };

  return (
    <div className="page page-wide">
      <PageHeader title={sprint.name}>
        <select className="plain-select" value={sprintId} onChange={(e) => setSprintId(e.target.value)}>
          {selectable.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} {s.status === 'ACTIVE' ? '(attivo)' : ''}
            </option>
          ))}
        </select>
      </PageHeader>

      <div className="sprint-summary">
        <div>
          <small>Periodo</small>
          <strong>
            {formatDate(sprint.startDate)} – {formatDate(sprint.endDate)}
          </strong>
        </div>
        <div>
          <small>Giorni rimanenti</small>
          <strong>{daysLeft >= 0 ? daysLeft : 'scaduto'}</strong>
        </div>
        <div>
          <small>Completati</small>
          <strong>
            {done.length}/{visible.length}
          </strong>
        </div>
        <div>
          <small>Ore stimate</small>
          <strong>
            {doneHours}/{totalHours} h
          </strong>
        </div>
        <div className="sprint-summary-bar">
          <StatusBar tasks={visible} />
        </div>
        {sprint.goal && <p className="sprint-goal">🎯 {sprint.goal}</p>}
      </div>

      <div className="toolbar">
        <select className="plain-select" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
          <option value="">Tutti i progetti</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <UserSelect users={users} value={assigneeFilter} onChange={(id) => setAssigneeFilter(id ?? '')} emptyLabel="Tutte le persone" />
        <label className="check">
          <input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} /> Mostra colonne vuote
        </label>
      </div>

      <div className="kanban" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(230px, 1fr))` }}>
        {columns.map((status) => {
          const column = visible.filter((t) => t.status === status.id);
          return (
            <div
              key={status.id}
              className={`kanban-col ${dragOver === status.id ? 'drag-over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(status.id);
              }}
              onDragLeave={() => setDragOver((s) => (s === status.id ? null : s))}
              onDrop={(e) => onDrop(status.id, e)}
            >
              <div className="kanban-col-header" style={{ background: status.color, color: textColorOn(status.color) }}>
                {status.name} <span>{column.length}</span>
              </div>
              <div className="kanban-cards">
                {column.map((t) => (
                  <Card
                    key={t.id}
                    task={t}
                    onOpen={() => setOpenTaskId(t.id)}
                    onDragStart={() => setDragging(true)}
                    onDragEnd={() => {
                      setDragging(false);
                      setDragOver(null);
                    }}
                  />
                ))}
                {status.id === firstStatus && (
                  <input
                    className="add-input"
                    placeholder="+ Nuovo task (Invio)"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && quickAdd()}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {openTaskId && (
        <TaskDrawer taskId={openTaskId} onClose={() => setOpenTaskId(null)} onSaved={replace} onDeleted={removeLocal} />
      )}
    </div>
  );
}

function Card({
  task,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  task: Task;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const { projectById, labelById, isDone } = useData();
  const project = projectById.get(task.projectId);
  const overdue = task.dueDate && !isDone(task) && task.dueDate < isoDate(new Date());
  const doneSub = task.subtasks.filter((s) => s.done).length;
  return (
    <div
      className="card"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', task.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      style={{ borderLeftColor: project?.color }}
    >
      <div className="card-project" style={{ color: project?.color }}>
        {project?.name}
      </div>
      <div className="card-title">{task.title}</div>
      <div className="card-meta">
        {task.priority && <LabelBadge label={labelById.get(task.priority)} />}
        {task.dueDate && <span className={overdue ? 'overdue' : ''}>📅 {formatDate(task.dueDate)}</span>}
        {task.estimateHours != null && <span>⏱ {task.estimateHours} h</span>}
        {task.subtasks.length > 0 && (
          <span>
            ☑ {doneSub}/{task.subtasks.length}
          </span>
        )}
        {task.comments.length > 0 && <span>💬 {task.comments.length}</span>}
        {task.attachments.length > 0 && <span>📎 {task.attachments.length}</span>}
        <span className="spacer" />
        <AvatarStack userIds={task.assigneeIds} size={22} />
      </div>
    </div>
  );
}
