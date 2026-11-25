import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Avatar, Modal, PageHeader } from '../components';
import { useData } from '../data';
import { toastError } from '../toast';
import type { Role, User } from '../types';

interface UserForm {
  username: string;
  displayName: string;
  email: string;
  password: string;
  admin: boolean;
  active: boolean;
}

export function UsersPage() {
  const { isAdmin, user: me } = useAuth();
  const { users, reload } = useData();
  const [editing, setEditing] = useState<{ user: User | null; form: UserForm } | null>(null);

  if (!isAdmin) return <Navigate to="/board" replace />;

  const save = async (form: UserForm) => {
    const roles: Role[] = form.admin ? ['USER', 'ADMIN'] : ['USER'];
    try {
      if (editing?.user) {
        await api.users.update(editing.user.id, {
          displayName: form.displayName,
          email: form.email || null,
          roles,
          active: form.active,
          password: form.password || undefined,
        });
      } else {
        await api.users.create({
          username: form.username,
          displayName: form.displayName,
          email: form.email || undefined,
          password: form.password,
          roles,
        });
      }
      setEditing(null);
      await reload();
    } catch (e) {
      toastError(e);
    }
  };

  const remove = async (u: User) => {
    if (!confirm(`Eliminare l'utente ${u.displayName}? I task assegnati resteranno senza persona.`)) return;
    try {
      await api.users.remove(u.id);
      await reload();
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <div className="page">
      <PageHeader title="Utenti">
        <button
          className="btn btn-primary"
          onClick={() =>
            setEditing({ user: null, form: { username: '', displayName: '', email: '', password: '', admin: false, active: true } })
          }
        >
          + Nuovo utente
        </button>
      </PageHeader>

      <div className="simple-table">
        <div className="simple-tr simple-th">
          <span />
          <span>Nome</span>
          <span>Username</span>
          <span>Email</span>
          <span>Ruolo</span>
          <span>Stato</span>
          <span />
        </div>
        {users.map((u) => (
          <div key={u.id} className={`simple-tr ${u.active ? '' : 'inactive'}`}>
            <Avatar user={u} />
            <span>{u.displayName}</span>
            <span className="muted">{u.username}</span>
            <span className="muted">{u.email}</span>
            <span>{u.roles.includes('ADMIN') ? 'Amministratore' : 'Utente'}</span>
            <span>{u.active ? 'Attivo' : 'Disattivato'}</span>
            <span className="row">
              <button
                className="btn btn-small"
                onClick={() =>
                  setEditing({
                    user: u,
                    form: {
                      username: u.username,
                      displayName: u.displayName,
                      email: u.email ?? '',
                      password: '',
                      admin: u.roles.includes('ADMIN'),
                      active: u.active,
                    },
                  })
                }
              >
                Modifica
              </button>
              {u.id !== me?.id && (
                <button className="btn btn-small btn-danger-ghost" onClick={() => remove(u)}>
                  Elimina
                </button>
              )}
            </span>
          </div>
        ))}
      </div>

      {editing && (
        <UserFormModal
          isNew={!editing.user}
          isSelf={editing.user?.id === me?.id}
          initial={editing.form}
          onClose={() => setEditing(null)}
          onSubmit={save}
        />
      )}
    </div>
  );
}

function UserFormModal({
  isNew,
  isSelf,
  initial,
  onClose,
  onSubmit,
}: {
  isNew: boolean;
  isSelf: boolean;
  initial: UserForm;
  onClose: () => void;
  onSubmit: (f: UserForm) => void;
}) {
  const [form, setForm] = useState(initial);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };
  return (
    <Modal title={isNew ? 'Nuovo utente' : `Modifica ${initial.displayName}`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>
          Username
          <input required disabled={!isNew} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </label>
        <label>
          Nome visualizzato
          <input required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
        </label>
        <label>
          Email
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <label>
          {isNew ? 'Password' : 'Nuova password (lascia vuoto per non cambiarla)'}
          <input
            type="password"
            required={isNew}
            minLength={8}
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </label>
        <label className="check">
          <input type="checkbox" disabled={isSelf} checked={form.admin} onChange={(e) => setForm({ ...form, admin: e.target.checked })} />{' '}
          Amministratore
        </label>
        {!isNew && (
          <label className="check">
            <input type="checkbox" disabled={isSelf} checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />{' '}
            Attivo
          </label>
        )}
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
