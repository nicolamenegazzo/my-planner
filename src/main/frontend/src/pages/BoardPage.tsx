import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AssigneesPicker,
  FieldInput,
  LabelSelect,
  PageHeader,
  PrioritySelect,
  StatusBar,
  StatusSelect,
  UserSelect,
} from '../components';
import { useData } from '../data';
import { useTasks } from '../hooks';
import { formatDate, isoDate, NEUTRAL_COLOR, SPRINT_STATUS } from '../labels';
import { TaskDrawer } from '../TaskDrawer';
import { toast } from '../toast';
import type { FieldDefinition, Subtask, Task } from '../types';

/** "project", "sprint", "status" oppure "field:<id>" per un campo personalizzato a etichette. */
type GroupBy = string;

interface Group {
  key: string;
  title: string;
  subtitle?: string;
  color: string;
  tasks: Task[];
  projectId?: string;
  sprintId?: string | null;
  defaultCollapsed?: boolean;
  /** Campi da cambiare quando un task viene trascinato in questo gruppo. */
  assign: (task: Task) => Partial<Task>;
}

/** Punto di rilascio durante il trascinamento: indice di inserimento nella lista del gruppo. */
interface DropTarget {
  groupKey: string;
  index: number;
}

/** Posizione tra i due vicini, così basta aggiornare il solo task spostato. */
function positionBetween(prev: Task | undefined, next: Task | undefined, fallback: number) {
  if (prev && next) return (prev.position + next.position) / 2;
  if (prev) return prev.position + 1000;
  if (next) return next.position - 1000;
  return fallback;
}

const GROUP_BY_KEY = 'mymonday.board.groupBy';
const WIDTHS_KEY = 'mymonday.board.widths';

function loadGroupBy(): GroupBy {
  try {
    return localStorage.getItem(GROUP_BY_KEY) ?? 'project';
  } catch {
    return 'project';
  }
}

/** Larghezze predefinite (px) delle colonne; quelle dei campi personalizzati hanno chiave "field:<id>". */
const DEFAULT_WIDTHS: Record<string, number> = {
  title: 360,
  people: 110,
  status: 150,
  priority: 120,
  sprint: 150,
  timeline: 240,
  estimate: 70,
  actual: 70,
};
const CUSTOM_WIDTH = 150;
const MIN_WIDTH = 50;
const BASE_COLUMNS = Object.keys(DEFAULT_WIDTHS);

function loadWidths(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(WIDTHS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function BoardPage() {
  const { projects, sprints, users, statuses, fields, sprintById } = useData();
  const { tasks, loading, patch, add, replace, removeLocal } = useTasks();
  const [searchParams] = useSearchParams();
  const [groupBy, setGroupBy] = useState<GroupBy>(() => searchParams.get('groupBy') ?? loadGroupBy());
  const [projectFilter, setProjectFilter] = useState(() => searchParams.get('project') ?? '');
  const [widths, setWidths] = useState<Record<string, number>>(loadWidths);
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [search, setSearch] = useState('');
  /** Stati da mostrare; vuoto = tutti. */
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [toggled, setToggled] = useState<Set<string>>(new Set());
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  const labelFields = fields.filter((f) => f.type === 'LABEL');
  const boardFields = fields.filter((f) => f.showInBoard);
  const groupField = groupBy.startsWith('field:') ? fields.find((f) => f.id === groupBy.slice(6)) : undefined;
  const effectiveGroupBy = groupBy.startsWith('field:') && !groupField ? 'project' : groupBy;

  const columnKeys = [...BASE_COLUMNS, ...boardFields.map((f) => `field:${f.id}`)];
  const widthOf = (key: string) => widths[key] ?? DEFAULT_WIDTHS[key] ?? CUSTOM_WIDTH;
  const gridTemplate = ['6px', ...columnKeys.map((k) => `${widthOf(k)}px`)].join(' ');
  const minWidth = 6 + columnKeys.reduce((sum, k) => sum + widthOf(k), 0);

  // I link dalla pagina Progetti aprono la board già filtrata (?project=…&groupBy=…)
  useEffect(() => {
    const project = searchParams.get('project');
    const group = searchParams.get('groupBy');
    if (project !== null) setProjectFilter(project);
    if (group !== null) setGroupBy(group);
  }, [searchParams]);

  const resizeColumn = (key: string, width: number | null) =>
    setWidths((current) => {
      const next = { ...current };
      if (width === null) delete next[key];
      else next[key] = Math.max(MIN_WIDTH, Math.round(width));
      return next;
    });

  const saveWidths = () =>
    setWidths((current) => {
      try {
        localStorage.setItem(WIDTHS_KEY, JSON.stringify(current));
      } catch {
        /* larghezze non persistite */
      }
      return current;
    });

  useEffect(() => {
    try {
      localStorage.setItem(GROUP_BY_KEY, groupBy);
    } catch {
      /* preferenza non persistita */
    }
  }, [groupBy]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks
      .filter(
        (t) =>
          (!projectFilter || t.projectId === projectFilter) &&
          (!assigneeFilter || t.assigneeIds.includes(assigneeFilter)) &&
          (statusFilter.size === 0 || statusFilter.has(t.status)) &&
          (!q || t.title.toLowerCase().includes(q)),
      )
      .sort((a, b) => a.position - b.position);
  }, [tasks, projectFilter, assigneeFilter, statusFilter, search]);

  const groups = useMemo<Group[]>(() => {
    if (effectiveGroupBy === 'sprint') {
      const byStart = (a: { startDate: string }, b: { startDate: string }) => a.startDate.localeCompare(b.startDate);
      const ordered = [
        ...sprints.filter((s) => s.status === 'ACTIVE'),
        ...sprints.filter((s) => s.status === 'PLANNED').sort(byStart),
      ];
      const closed = sprints.filter((s) => s.status === 'CLOSED').sort((a, b) => byStart(b, a));
      const sprintGroup = (s: (typeof sprints)[number]): Group => ({
        key: s.id,
        title: s.name,
        subtitle: `${SPRINT_STATUS[s.status].label} · ${formatDate(s.startDate)} – ${formatDate(s.endDate)}`,
        color: SPRINT_STATUS[s.status].color,
        tasks: filtered.filter((t) => t.sprintId === s.id),
        sprintId: s.id,
        defaultCollapsed: s.status === 'CLOSED',
        assign: () => ({ sprintId: s.id }),
      });
      return [
        ...ordered.map(sprintGroup),
        {
          key: 'backlog',
          title: 'Backlog',
          color: NEUTRAL_COLOR,
          tasks: filtered.filter((t) => !t.sprintId || !sprintById.has(t.sprintId)),
          sprintId: null,
          assign: () => ({ sprintId: null }),
        },
        ...closed.map(sprintGroup),
      ];
    }
    if (effectiveGroupBy === 'status') {
      return statuses.map((s) => ({
        key: s.id,
        title: s.name,
        color: s.color,
        tasks: filtered.filter((t) => t.status === s.id),
        defaultCollapsed: s.done,
        assign: () => ({ status: s.id }),
      }));
    }
    if (groupField) {
      const options = groupField.options;
      const result: Group[] = options.map((o) => ({
        key: o.name,
        title: o.name,
        color: o.color ?? NEUTRAL_COLOR,
        tasks: filtered.filter((t) => t.customFields[groupField.id] === o.name),
        assign: (t: Task) => ({ customFields: { ...t.customFields, [groupField.id]: o.name } }),
      }));
      result.push({
        key: '__none__',
        title: `Senza ${groupField.name}`,
        color: NEUTRAL_COLOR,
        tasks: filtered.filter((t) => !options.some((o) => o.name === t.customFields[groupField.id])),
        assign: (t: Task) => {
          const customFields = { ...t.customFields };
          delete customFields[groupField.id];
          return { customFields };
        },
      });
      return result.filter((g) => g.tasks.length > 0 || g.key === '__none__');
    }
    return projects
      .filter((p) => !projectFilter || p.id === projectFilter)
      .filter((p) => !p.archived || filtered.some((t) => t.projectId === p.id))
      .map((p) => ({
        key: p.id,
        title: p.name,
        subtitle: p.archived ? 'archiviato' : undefined,
        color: p.color,
        tasks: filtered.filter((t) => t.projectId === p.id),
        projectId: p.id,
        sprintId: null,
        defaultCollapsed: p.archived,
        assign: () => ({ projectId: p.id }),
      }));
  }, [effectiveGroupBy, groupField, projects, sprints, statuses, filtered, projectFilter, sprintById]);

  /** Il punto di rilascio cambia solo se diverso, per non ridisegnare la board a ogni dragover. */
  const updateDropTarget = (groupKey: string, index: number) =>
    setDropTarget((current) => (current?.groupKey === groupKey && current.index === index ? current : { groupKey, index }));

  const endDrag = () => {
    setDragId(null);
    setDropTarget(null);
  };

  const dropInto = (group: Group) => {
    const moving = tasks.find((t) => t.id === dragId);
    const target = dropTarget?.groupKey === group.key ? dropTarget.index : group.tasks.length;
    endDrag();
    if (!moving) return;
    const original = group.tasks.findIndex((t) => t.id === moving.id);
    const others = group.tasks.filter((t) => t.id !== moving.id);
    const index = original >= 0 && original < target ? target - 1 : target;
    if (original >= 0 && index === original) return; // rilasciato nello stesso punto
    const position = positionBetween(others[index - 1], others[index], moving.position);
    patch(moving, { ...(original >= 0 ? {} : group.assign(moving)), position });
  };

  const toggle = (key: string) =>
    setToggled((set) => {
      const next = new Set(set);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const createIn = async (group: Group, title: string) => {
    const projectId = group.projectId ?? (projectFilter || projects.find((p) => !p.archived)?.id);
    if (!projectId) {
      toast('Crea prima un progetto', 'error');
      return false;
    }
    const created = await add({
      title,
      projectId,
      sprintId: group.sprintId ?? null,
      status: effectiveGroupBy === 'status' ? group.key : undefined,
      assigneeIds: assigneeFilter ? [assigneeFilter] : [],
      customFields: groupField && group.key !== '__none__' ? { [groupField.id]: group.key } : {},
    });
    return !!created;
  };

  return (
    <div className="page page-wide">
      <PageHeader title="Board">
        <label className="row muted">
          Raggruppa per
          <select className="plain-select" value={effectiveGroupBy} onChange={(e) => setGroupBy(e.target.value)}>
            <option value="project">Progetto</option>
            <option value="sprint">Sprint</option>
            <option value="status">Stato</option>
            {labelFields.map((f) => (
              <option key={f.id} value={`field:${f.id}`}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      </PageHeader>

      <div className="toolbar">
        <input className="search" placeholder="Cerca task…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="plain-select" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
          <option value="">Tutti i progetti</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <UserSelect users={users} value={assigneeFilter} onChange={(id) => setAssigneeFilter(id ?? '')} emptyLabel="Tutte le persone" />
        <StatusFilter selected={statusFilter} onChange={setStatusFilter} />
        <span className="muted small">{filtered.length} task</span>
        {Object.keys(widths).length > 0 && (
          <button
            className="link-like small"
            onClick={() => {
              setWidths({});
              try {
                localStorage.removeItem(WIDTHS_KEY);
              } catch {
                /* ignorato */
              }
            }}
          >
            Reimposta larghezze colonne
          </button>
        )}
      </div>

      {loading ? (
        <div className="muted">Caricamento…</div>
      ) : projects.length === 0 ? (
        <div className="empty-state">
          Nessun progetto ancora. <Link to="/progetti">Crea il primo progetto</Link> oppure{' '}
          <Link to="/import">importa i dati da monday.com</Link>.
        </div>
      ) : (
        <BoardScroller>
        {groups.map((g) => {
          const collapsed = !!g.defaultCollapsed !== toggled.has(g.key);
          const hours = g.tasks.reduce((s, t) => s + (t.estimateHours ?? 0), 0);
          const actual = g.tasks.reduce((s, t) => s + (t.actualHours ?? 0), 0);
          const dropIndex = dragId && dropTarget?.groupKey === g.key ? dropTarget.index : null;
          return (
            <section key={g.key} className="group" style={{ ['--group-color' as string]: g.color }}>
              <div
                className={`group-header ${dragId && collapsed && dropIndex !== null ? 'drop-target' : ''}`}
                onClick={() => toggle(g.key)}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  updateDropTarget(g.key, collapsed ? g.tasks.length : 0);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  dropInto(g);
                }}
              >
                <span className={`chevron ${collapsed ? '' : 'open'}`}>▸</span>
                <span className="group-title">{g.title}</span>
                <span className="group-count">{g.tasks.length} task</span>
                {g.subtitle && <span className="group-subtitle">{g.subtitle}</span>}
              </div>
              {!collapsed && (
                <div className="table">
                  <div className="tr th" style={{ gridTemplateColumns: gridTemplate, minWidth }}>
                    <span className="cell-color" />
                    {columnKeys.map((key) => (
                      <HeaderCell
                        key={key}
                        width={widthOf(key)}
                        onResize={(w) => resizeColumn(key, w)}
                        onResizeEnd={saveWidths}
                        onReset={() => {
                          resizeColumn(key, null);
                          saveWidths();
                        }}
                      >
                        {headerLabel(key, effectiveGroupBy, boardFields)}
                      </HeaderCell>
                    ))}
                  </div>
                  {g.tasks.map((t, i) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      showProject={effectiveGroupBy === 'sprint'}
                      boardFields={boardFields}
                      gridTemplate={gridTemplate}
                      minWidth={minWidth}
                      onPatch={(changes) => patch(t, changes)}
                      onOpen={() => setOpenTaskId(t.id)}
                      drag={{
                        active: dragId !== null,
                        dragging: dragId === t.id,
                        indicator: dropIndex === i ? 'before' : dropIndex === i + 1 && i === g.tasks.length - 1 ? 'after' : null,
                        onStart: () => setDragId(t.id),
                        onEnd: endDrag,
                        onOver: (before) => updateDropTarget(g.key, before ? i : i + 1),
                        onDrop: () => dropInto(g),
                      }}
                    />
                  ))}
                  <div
                    onDragOver={(e) => {
                      if (!dragId) return;
                      e.preventDefault();
                      updateDropTarget(g.key, g.tasks.length);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      dropInto(g);
                    }}
                  >
                    <AddTaskRow onAdd={(title) => createIn(g, title)} />
                  </div>
                  <div className="tr tf" style={{ gridTemplateColumns: gridTemplate, minWidth }}>
                    <span className="cell-color" />
                    <span />
                    <span />
                    <StatusBar tasks={g.tasks} />
                    <span />
                    <span />
                    <span />
                    <span className="num">{hours > 0 ? `${hours} h` : ''}</span>
                    <span className="num">{actual > 0 ? `${actual} h` : ''}</span>
                    {boardFields.map((f) => (
                      <span key={f.id} />
                    ))}
                  </div>
                </div>
              )}
            </section>
          );
        })}
        </BoardScroller>
      )}

      {openTaskId && (
        <TaskDrawer taskId={openTaskId} onClose={() => setOpenTaskId(null)} onSaved={replace} onDeleted={removeLocal} />
      )}
    </div>
  );
}

/**
 * Contenitore a scorrimento orizzontale unico per tutti i gruppi, con una barra fissata in fondo alla finestra:
 * le colonne a destra restano raggiungibili senza scorrere fino alla fine dell'elenco.
 */
function BoardScroller({ children }: { children: React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ content: 0, visible: 0 });

  useEffect(() => {
    const scroll = scrollRef.current;
    const inner = innerRef.current;
    if (!scroll || !inner) return;
    const measure = () => setSize({ content: inner.scrollWidth, visible: scroll.clientWidth });
    const observer = new ResizeObserver(measure);
    observer.observe(scroll);
    observer.observe(inner);
    measure();
    return () => observer.disconnect();
  }, []);

  // le due aree si allineano a vicenda; assegnare lo stesso valore non genera un nuovo spostamento
  const sync = (from: HTMLDivElement | null, to: HTMLDivElement | null) => {
    if (from && to && to.scrollLeft !== from.scrollLeft) to.scrollLeft = from.scrollLeft;
  };

  return (
    <>
      <div className="board-scroll" ref={scrollRef} onScroll={() => sync(scrollRef.current, barRef.current)}>
        <div className="board-inner" ref={innerRef}>
          {children}
        </div>
      </div>
      {size.content > size.visible && (
        <div className="board-hscroll" ref={barRef} onScroll={() => sync(barRef.current, scrollRef.current)}>
          <div style={{ width: size.content }} />
        </div>
      )}
    </>
  );
}

function headerLabel(key: string, groupBy: string, boardFields: FieldDefinition[]) {
  switch (key) {
    case 'title':
      return 'Task';
    case 'people':
      return 'Persone';
    case 'status':
      return 'Stato';
    case 'priority':
      return 'Priorità';
    case 'sprint':
      return groupBy === 'sprint' ? 'Progetto' : 'Sprint';
    case 'timeline':
      return 'Timeline';
    case 'estimate':
      return <span title="Stima (ore)">Stima</span>;
    case 'actual':
      return <span title="Ore effettive">Effett.</span>;
    default:
      return boardFields.find((f) => `field:${f.id}` === key)?.name ?? '';
  }
}

/** Intestazione con maniglia di ridimensionamento sul bordo destro (doppio clic = larghezza predefinita). */
function HeaderCell({
  width,
  onResize,
  onResizeEnd,
  onReset,
  children,
}: {
  width: number;
  onResize: (width: number) => void;
  onResizeEnd: () => void;
  onReset: () => void;
  children: React.ReactNode;
}) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    drag.current = { startX: e.clientX, startWidth: width };
    const onMove = (ev: MouseEvent) => {
      if (drag.current) onResize(drag.current.startWidth + ev.clientX - drag.current.startX);
    };
    const onUp = () => {
      drag.current = null;
      document.body.classList.remove('resizing-columns');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      onResizeEnd();
    };
    document.body.classList.add('resizing-columns');
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <span className="th-cell">
      <span className="th-label">{children}</span>
      <span
        className="col-resizer"
        onMouseDown={onMouseDown}
        onDoubleClick={onReset}
        title="Trascina per ridimensionare, doppio clic per ripristinare"
      />
    </span>
  );
}

/** Stato del trascinamento passato a ogni riga. */
interface RowDrag {
  active: boolean;
  dragging: boolean;
  indicator: 'before' | 'after' | null;
  onStart: () => void;
  onEnd: () => void;
  onOver: (before: boolean) => void;
  onDrop: () => void;
}

function TaskRow({
  task,
  showProject,
  boardFields,
  gridTemplate,
  minWidth,
  onPatch,
  onOpen,
  drag,
}: {
  task: Task;
  showProject: boolean;
  boardFields: FieldDefinition[];
  gridTemplate: string;
  minWidth: number;
  onPatch: (c: Partial<Task>) => void;
  onOpen: () => void;
  drag: RowDrag;
}) {
  const { projects, sprints, projectById, isDone } = useData();
  const [expanded, setExpanded] = useState(false);
  const project = projectById.get(task.projectId);
  const overdue = task.dueDate && !isDone(task) && task.dueDate < isoDate(new Date());
  const doneSub = task.subtasks.filter((s) => s.done).length;
  const hours = (v: string) => {
    const n = v.trim() === '' ? null : Number(v.replace(',', '.'));
    return n === null || (Number.isFinite(n) && n >= 0) ? { ok: true as const, n } : { ok: false as const };
  };
  const rowClass = ['tr', drag.dragging ? 'dragging' : '', drag.indicator ? `drop-${drag.indicator}` : ''].join(' ');
  return (
    <>
    <div
      className={rowClass}
      style={{ gridTemplateColumns: gridTemplate, minWidth }}
      onDragOver={(e) => {
        if (!drag.active) return;
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        drag.onOver(e.clientY < rect.top + rect.height / 2);
      }}
      onDrop={(e) => {
        e.preventDefault();
        drag.onDrop();
      }}
    >
      <span className="cell-color" style={{ background: project?.color }} />
      <span className="cell-title">
        <span
          className="drag-handle"
          draggable
          title="Trascina per spostare il task"
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', task.id);
            const row = e.currentTarget.closest('.tr');
            if (row) e.dataTransfer.setDragImage(row, 24, 18);
            drag.onStart();
          }}
          onDragEnd={drag.onEnd}
        >
          ⋮⋮
        </span>
        <button
          className={`subtask-toggle ${expanded ? 'open' : ''}`}
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? 'Nascondi sottotask' : 'Mostra e aggiungi sottotask'}
        >
          <span className="chevron-small">▸</span>
          {task.subtasks.length > 0 ? `${doneSub}/${task.subtasks.length}` : '+'}
        </button>
        <InlineText value={task.title} onCommit={(title) => title.trim() && onPatch({ title: title.trim() })} />
        <button className="open-btn" onClick={onOpen} title="Apri dettaglio">
          {task.comments.length > 0 ? `💬 ${task.comments.length}` : 'Apri'}
        </button>
      </span>
      <span className="row center">
        <AssigneesPicker value={task.assigneeIds} onChange={(assigneeIds) => onPatch({ assigneeIds })} />
      </span>
      <StatusSelect value={task.status} onChange={(status) => onPatch({ status })} />
      <PrioritySelect value={task.priority} onChange={(priority) => onPatch({ priority })} />
      {showProject ? (
        <select className="plain-select" value={task.projectId} onChange={(e) => onPatch({ projectId: e.target.value })}>
          {projects
            .filter((p) => !p.archived || p.id === task.projectId)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
      ) : (
        <select className="plain-select" value={task.sprintId ?? ''} onChange={(e) => onPatch({ sprintId: e.target.value || null })}>
          <option value="">Backlog</option>
          {sprints
            .filter((s) => s.status !== 'CLOSED' || s.id === task.sprintId)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
      )}
      <span className="timeline-cell">
        <input
          type="date"
          className="date-input"
          title="Inizio"
          value={task.startDate ?? ''}
          onChange={(e) => onPatch({ startDate: e.target.value || null })}
        />
        <span className="muted">→</span>
        <input
          type="date"
          className={`date-input ${overdue ? 'overdue' : ''}`}
          title="Scadenza"
          value={task.dueDate ?? ''}
          onChange={(e) => onPatch({ dueDate: e.target.value || null })}
        />
      </span>
      <InlineText
        className="num"
        value={task.estimateHours != null ? String(task.estimateHours) : ''}
        placeholder="h"
        onCommit={(v) => {
          const r = hours(v);
          if (r.ok) onPatch({ estimateHours: r.n });
        }}
      />
      <InlineText
        className="num"
        value={task.actualHours != null ? String(task.actualHours) : ''}
        placeholder="h"
        onCommit={(v) => {
          const r = hours(v);
          if (r.ok) onPatch({ actualHours: r.n });
        }}
      />
      {boardFields.map((f) => (
        <span key={f.id} className="custom-cell">
          <FieldInput
            field={f}
            compact
            value={task.customFields[f.id]}
            onChange={(v) => {
              const next = { ...task.customFields };
              if (v === null) delete next[f.id];
              else next[f.id] = v;
              onPatch({ customFields: next });
            }}
          />
        </span>
      ))}
    </div>
    {expanded && <SubtaskRows task={task} minWidth={minWidth} onPatch={onPatch} />}
    </>
  );
}

/** Sottotask mostrati sotto la riga del task, come i sottoelementi di monday.com. */
function SubtaskRows({ task, minWidth, onPatch }: { task: Task; minWidth: number; onPatch: (c: Partial<Task>) => void }) {
  const { users, statuses, labelById } = useData();
  const [title, setTitle] = useState('');
  const update = (index: number, changes: Partial<Subtask>) =>
    onPatch({ subtasks: task.subtasks.map((s, i) => (i === index ? { ...s, ...changes } : s)) });
  const add = () => {
    if (!title.trim()) return;
    onPatch({ subtasks: [...task.subtasks, { title: title.trim(), done: false }] });
    setTitle('');
  };
  return (
    <div className="subtask-block" style={{ minWidth }}>
      {task.subtasks.length > 0 && (
        <div className="subtask-line subtask-head">
          <span />
          <span>Sottotask</span>
          <span>Stato</span>
          <span>Persona</span>
          <span>Scadenza</span>
          <span>Stima</span>
          <span />
        </div>
      )}
      {task.subtasks.map((s, i) => (
        <div key={s.id ?? `new-${i}`} className="subtask-line">
          <input type="checkbox" checked={s.done} onChange={() => update(i, { done: !s.done })} title="Completato" />
          <InlineText
            className={s.done ? 'done' : ''}
            value={s.title}
            onCommit={(v) => v.trim() && update(i, { title: v.trim() })}
          />
          <LabelSelect
            labels={statuses}
            value={s.status}
            allowEmpty
            onChange={(status) => update(i, { status, done: status ? !!labelById.get(status)?.done : s.done })}
          />
          <UserSelect users={users} value={s.assigneeId} onChange={(assigneeId) => update(i, { assigneeId })} emptyLabel="—" />
          <input
            type="date"
            className="date-input"
            value={s.dueDate ?? ''}
            onChange={(e) => update(i, { dueDate: e.target.value || null })}
          />
          <InlineText
            className="num"
            value={s.estimateHours != null ? String(s.estimateHours) : ''}
            placeholder="h"
            onCommit={(v) => {
              const n = v.trim() === '' ? null : Number(v.replace(',', '.'));
              if (n === null || (Number.isFinite(n) && n >= 0)) update(i, { estimateHours: n });
            }}
          />
          <button
            className="icon-btn"
            title="Elimina sottotask"
            onClick={() => onPatch({ subtasks: task.subtasks.filter((_, j) => j !== i) })}
          >
            ✕
          </button>
        </div>
      ))}
      <div className="subtask-line subtask-add">
        <span />
        <input
          className="add-input"
          placeholder="+ Aggiungi sottotask (Invio)"
          value={title}
          autoFocus={task.subtasks.length === 0}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
      </div>
    </div>
  );
}

/** Filtro multiplo per stato; nessuna selezione = tutti gli stati. */
function StatusFilter({ selected, onChange }: { selected: Set<string>; onChange: (s: Set<string>) => void }) {
  const { statuses } = useData();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const toggleStatus = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };
  const label =
    selected.size === 0
      ? 'Tutti gli stati'
      : selected.size === 1
        ? statuses.find((s) => selected.has(s.id))?.name ?? '1 stato'
        : `${selected.size} stati`;

  return (
    <div className="picker" ref={ref}>
      <button className={`btn filter-btn ${selected.size > 0 ? 'active' : ''}`} onClick={() => setOpen((v) => !v)}>
        Stato: {label} ▾
      </button>
      {open && (
        <div className="picker-menu">
          <div className="row filter-shortcuts">
            <button className="link-like small" onClick={() => onChange(new Set())}>
              Tutti
            </button>
            <button className="link-like small" onClick={() => onChange(new Set(statuses.filter((s) => !s.done).map((s) => s.id)))}>
              Solo aperti
            </button>
            <button className="link-like small" onClick={() => onChange(new Set(statuses.filter((s) => s.done).map((s) => s.id)))}>
              Solo completati
            </button>
          </div>
          {statuses.map((s) => (
            <label key={s.id} className="picker-option">
              <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleStatus(s.id)} />
              <span className="dot" style={{ background: s.color }} />
              <span>{s.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function InlineText({
  value,
  onCommit,
  className = '',
  placeholder,
}: {
  value: string;
  onCommit: (v: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input
      className={`inline-input ${className}`}
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== value && onCommit(text)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setText(value);
      }}
    />
  );
}

function AddTaskRow({ onAdd }: { onAdd: (title: string) => Promise<boolean> }) {
  const [title, setTitle] = useState('');
  const submit = async () => {
    if (!title.trim()) return;
    if (await onAdd(title.trim())) setTitle('');
  };
  return (
    <div className="tr add-row">
      <span className="cell-color" />
      <input
        className="add-input"
        placeholder="+ Aggiungi task"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
    </div>
  );
}
