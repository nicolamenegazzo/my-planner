import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin, { Draggable, type DropArg } from '@fullcalendar/interaction';
import itLocale from '@fullcalendar/core/locales/it';
import type { EventApi, EventClickArg } from '@fullcalendar/core';
import { api } from '../api';
import { useAuth } from '../auth';
import { AvatarStack, Modal, PageHeader } from '../components';
import { useData } from '../data';
import { useTasks } from '../hooks';
import { formatDate, isoDateTime } from '../labels';
import { TaskDrawer } from '../TaskDrawer';
import { toastError } from '../toast';
import type { TimeSlot } from '../types';

type Scope = 'sprint' | 'backlog' | 'all';

const SLOT_MINUTES = 60;

export function CalendarPage() {
  const { user } = useAuth();
  const { projects, users, projectById, userById, labelById, activeSprint, isDone } = useData();
  const { tasks, replace, removeLocal } = useTasks();
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [userFilter, setUserFilter] = useState<string>(user!.id);
  const [scope, setScope] = useState<Scope>(activeSprint ? 'sprint' : 'all');
  const [projectFilter, setProjectFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showWeekends, setShowWeekends] = useState(false);
  const [selected, setSelected] = useState<TimeSlot | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const loadSlots = useCallback(async () => {
    if (!range) return;
    try {
      setSlots(await api.slots.list(range.from, range.to, userFilter === 'all' ? undefined : userFilter));
    } catch (e) {
      toastError(e);
    }
  }, [range, userFilter]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  // Rende trascinabili sul calendario gli elementi della lista task
  useEffect(() => {
    if (!listRef.current) return;
    const draggable = new Draggable(listRef.current, {
      itemSelector: '.ext-task',
      eventData: (el) => ({
        title: el.getAttribute('data-title') ?? '',
        duration: { minutes: SLOT_MINUTES },
        create: false,
      }),
    });
    return () => draggable.destroy();
  }, []);

  const plannedMinutes = useMemo(
    () => slots.reduce((sum, s) => sum + (new Date(s.end).getTime() - new Date(s.start).getTime()) / 60_000, 0),
    [slots],
  );

  const sideTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter(
      (t) =>
        !isDone(t) &&
        (scope === 'all' ||
          (scope === 'sprint' && activeSprint && t.sprintId === activeSprint.id) ||
          (scope === 'backlog' && !t.sprintId)) &&
        (!projectFilter || t.projectId === projectFilter) &&
        (!q || t.title.toLowerCase().includes(q)),
    );
  }, [tasks, scope, activeSprint, projectFilter, search, isDone]);

  const events = useMemo(
    () =>
      slots.map((s) => {
        const task = taskById.get(s.taskId);
        const color = projectById.get(task?.projectId ?? '')?.color ?? '#579bfc';
        const owner = userFilter === 'all' ? userById.get(s.userId)?.displayName : undefined;
        return {
          id: s.id,
          title: (task?.title ?? 'Task eliminato') + (owner ? ` · ${owner}` : ''),
          start: s.start,
          end: s.end,
          backgroundColor: color,
          borderColor: color,
          classNames: task && isDone(task) ? ['slot-done'] : [],
        };
      }),
    [slots, taskById, projectById, userById, userFilter, isDone],
  );

  const onDrop = async (info: DropArg) => {
    const taskId = info.draggedEl.getAttribute('data-task-id');
    if (!taskId) return;
    const start = info.date;
    const end = new Date(start.getTime() + SLOT_MINUTES * 60_000);
    try {
      const created = await api.slots.create({
        taskId,
        userId: userFilter === 'all' ? undefined : userFilter,
        start: isoDateTime(start),
        end: isoDateTime(end),
      });
      setSlots((list) => [...list, created]);
    } catch (e) {
      toastError(e);
    }
  };

  const onEventChange = async (info: { event: EventApi; revert: () => void }) => {
    const slot = slots.find((s) => s.id === info.event.id);
    if (!slot || !info.event.start || !info.event.end) return info.revert();
    try {
      const updated = await api.slots.update(slot.id, {
        ...slot,
        start: isoDateTime(info.event.start),
        end: isoDateTime(info.event.end),
      });
      setSlots((list) => list.map((s) => (s.id === updated.id ? updated : s)));
    } catch (e) {
      info.revert();
      toastError(e);
    }
  };

  const removeSlot = async (slot: TimeSlot) => {
    try {
      await api.slots.remove(slot.id);
      setSlots((list) => list.filter((s) => s.id !== slot.id));
      setSelected(null);
    } catch (e) {
      toastError(e);
    }
  };

  const selectedTask = selected ? taskById.get(selected.taskId) : undefined;

  return (
    <div className="page page-wide">
      <PageHeader title="Calendario">
        <span className="muted">Pianificate nel periodo: {(plannedMinutes / 60).toFixed(1)} h</span>
        <select className="plain-select" value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
          <option value={user!.id}>Il mio calendario</option>
          <option value="all">Tutto il team</option>
          {users
            .filter((u) => u.id !== user!.id && u.active)
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName}
              </option>
            ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={showWeekends} onChange={(e) => setShowWeekends(e.target.checked)} /> Weekend
        </label>
      </PageHeader>

      <div className="calendar-layout">
        <aside className="task-pool">
          <h3>Task da pianificare</h3>
          <p className="muted small">Trascina un task nel calendario per creare uno slot da {SLOT_MINUTES} minuti.</p>
          <div className="segmented segmented-small">
            <button className={scope === 'sprint' ? 'active' : ''} onClick={() => setScope('sprint')} disabled={!activeSprint}>
              Sprint
            </button>
            <button className={scope === 'backlog' ? 'active' : ''} onClick={() => setScope('backlog')}>
              Backlog
            </button>
            <button className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>
              Tutti
            </button>
          </div>
          <select className="plain-select" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
            <option value="">Tutti i progetti</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input className="search" placeholder="Cerca…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="task-pool-list" ref={listRef}>
            {sideTasks.length === 0 && <p className="muted small">Nessun task aperto.</p>}
            {sideTasks.map((t) => (
              <div
                key={t.id}
                className="ext-task"
                data-task-id={t.id}
                data-title={t.title}
                style={{ borderLeftColor: projectById.get(t.projectId)?.color }}
                onDoubleClick={() => setOpenTaskId(t.id)}
                title="Trascina sul calendario · doppio clic per aprire"
              >
                <div className="ext-task-title">{t.title}</div>
                <div className="ext-task-meta">
                  <span className="dot" style={{ background: labelById.get(t.status)?.color }} />
                  {labelById.get(t.status)?.name}
                  {t.priority && (
                    <>
                      <span className="dot" style={{ background: labelById.get(t.priority)?.color }} />
                      {labelById.get(t.priority)?.name}
                    </>
                  )}
                  {t.estimateHours != null && <> · {t.estimateHours} h</>}
                  <span className="spacer" />
                  <AvatarStack userIds={t.assigneeIds} size={18} />
                </div>
              </div>
            ))}
          </div>
        </aside>

        <div className="calendar-wrap">
          <FullCalendar
            plugins={[timeGridPlugin, interactionPlugin]}
            initialView="timeGridDay"
            locale={itLocale}
            headerToolbar={{ left: 'prev,next today', center: 'title', right: 'timeGridDay,timeGridWeek' }}
            slotMinTime="08:00:00"
            slotMaxTime="19:00:00"
            slotDuration="00:30:00"
            scrollTime="08:00:00"
            allDaySlot={false}
            weekends={showWeekends}
            firstDay={1}
            nowIndicator
            editable
            droppable
            height="auto"
            events={events}
            datesSet={(arg) => setRange({ from: isoDateTime(arg.start), to: isoDateTime(arg.end) })}
            drop={onDrop}
            eventDrop={onEventChange}
            eventResize={onEventChange}
            eventClick={(info: EventClickArg) => setSelected(slots.find((s) => s.id === info.event.id) ?? null)}
          />
        </div>
      </div>

      {selected && (
        <Modal title={selectedTask?.title ?? 'Task eliminato'} onClose={() => setSelected(null)} width={420}>
          <p>
            {formatDate(selected.start)} · {selected.start.slice(11, 16)}–{selected.end.slice(11, 16)}
          </p>
          <p className="muted">
            {userById.get(selected.userId)?.displayName}
            {selectedTask && <> · {projectById.get(selectedTask.projectId)?.name} · {labelById.get(selectedTask.status)?.name}</>}
          </p>
          <div className="modal-actions">
            {selectedTask && (
              <button
                className="btn btn-primary"
                onClick={() => {
                  setOpenTaskId(selectedTask.id);
                  setSelected(null);
                }}
              >
                Apri task
              </button>
            )}
            <button className="btn btn-danger-ghost" onClick={() => removeSlot(selected)}>
              Rimuovi dal calendario
            </button>
          </div>
        </Modal>
      )}

      {openTaskId && (
        <TaskDrawer
          taskId={openTaskId}
          onClose={() => setOpenTaskId(null)}
          onSaved={replace}
          onDeleted={(id) => {
            removeLocal(id);
            setSlots((list) => list.filter((s) => s.taskId !== id));
          }}
        />
      )}
    </div>
  );
}
