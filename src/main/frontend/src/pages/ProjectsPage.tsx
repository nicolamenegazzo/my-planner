import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Modal, PageHeader, StatusBar } from '../components';
import { useData } from '../data';
import { useTasks } from '../hooks';
import { PROJECT_COLORS } from '../labels';
import { toastError } from '../toast';
import type { Project } from '../types';

type ProjectForm = Omit<Project, 'id'>;

export function ProjectsPage() {
  const { projects, reload, isDone } = useData();
  const { tasks } = useTasks();
  const [editing, setEditing] = useState<{ id: string | null; form: ProjectForm } | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const save = async (form: ProjectForm) => {
    try {
      await (editing?.id ? api.projects.update(editing.id, form) : api.projects.create(form));
      setEditing(null);
      await reload();
    } catch (e) {
      toastError(e);
    }
  };

  const remove = async (p: Project) => {
    const count = tasks.filter((t) => t.projectId === p.id).length;
    if (!confirm(`Eliminare "${p.name}"${count ? ` e i suoi ${count} task` : ''}? L'operazione non è reversibile.`)) return;
    try {
      await api.projects.remove(p.id);
      await reload();
    } catch (e) {
      toastError(e);
    }
  };

  const visible = projects.filter((p) => showArchived || !p.archived);

  return (
    <div className="page">
      <PageHeader title="Progetti">
        <label className="check">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Mostra archiviati
        </label>
        <button
          className="btn btn-primary"
          onClick={() =>
            setEditing({
              id: null,
              form: { name: '', description: '', color: PROJECT_COLORS[projects.length % PROJECT_COLORS.length], archived: false },
            })
          }
        >
          + Nuovo progetto
        </button>
      </PageHeader>

      {visible.length === 0 && <div className="empty-state">Nessun progetto. Crea il primo per iniziare.</div>}

      <div className="project-grid">
        {visible.map((p) => {
          const pt = tasks.filter((t) => t.projectId === p.id);
          const open = pt.filter((t) => !isDone(t)).length;
          return (
            <div key={p.id} className={`project-card ${p.archived ? 'archived' : ''}`} style={{ borderTopColor: p.color }}>
              <h3>
                <span className="dot" style={{ background: p.color }} /> {p.name}
                {p.archived && <small className="muted"> (archiviato)</small>}
              </h3>
              {p.description && <p className="muted">{p.description}</p>}
              <div className="project-stats">
                <span>{pt.length} task</span>
                <span>{open} aperti</span>
              </div>
              <StatusBar tasks={pt} />
              <div className="project-links">
                <Link to={`/board?project=${p.id}&groupBy=status`}>📋 Task</Link>
                <Link to={`/board?project=${p.id}&groupBy=sprint`}>↻ Sprint e backlog</Link>
                <Link to={`/kanban?project=${p.id}`}>▥ Kanban sprint attivo</Link>
              </div>
              <div className="sprint-card-actions">
                <button
                  className="btn"
                  onClick={() =>
                    setEditing({ id: p.id, form: { name: p.name, description: p.description ?? '', color: p.color, archived: p.archived } })
                  }
                >
                  Modifica
                </button>
                <button className="btn btn-danger-ghost" onClick={() => remove(p)}>
                  Elimina
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <ProjectFormModal
          title={editing.id ? 'Modifica progetto' : 'Nuovo progetto'}
          initial={editing.form}
          onClose={() => setEditing(null)}
          onSubmit={save}
        />
      )}
    </div>
  );
}

function ProjectFormModal({
  title,
  initial,
  onClose,
  onSubmit,
}: {
  title: string;
  initial: ProjectForm;
  onClose: () => void;
  onSubmit: (f: ProjectForm) => void;
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
          <input required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label>
          Descrizione
          <textarea rows={2} value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        <div>
          <span className="label">Colore</span>
          <div className="color-picker">
            {PROJECT_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                className={c === form.color ? 'selected' : ''}
                style={{ background: c }}
                onClick={() => setForm({ ...form, color: c })}
                aria-label={c}
              />
            ))}
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={form.archived} onChange={(e) => setForm({ ...form, archived: e.target.checked })} /> Archiviato
        </label>
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
