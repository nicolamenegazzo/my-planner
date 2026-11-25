import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Avatar, PageHeader } from '../components';
import { toast, toastError } from '../toast';

export function ProfilePage() {
  const { user } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmNext, setConfirmNext] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next !== confirmNext) return toast('Le due password non coincidono', 'error');
    try {
      await api.changePassword(current, next);
      toast('Password aggiornata');
      setCurrent('');
      setNext('');
      setConfirmNext('');
    } catch (err) {
      toastError(err);
    }
  };

  return (
    <div className="page">
      <PageHeader title="Profilo" />
      <div className="profile-card">
        <div className="row">
          <Avatar user={user} size={48} />
          <div>
            <strong>{user?.displayName}</strong>
            <div className="muted">
              {user?.username} {user?.email && `· ${user.email}`}
            </div>
          </div>
        </div>
        <form className="form" onSubmit={submit}>
          <h3>Cambia password</h3>
          <label>
            Password attuale
            <input type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </label>
          <label>
            Nuova password (almeno 8 caratteri)
            <input type="password" required minLength={8} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </label>
          <label>
            Conferma nuova password
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmNext}
              onChange={(e) => setConfirmNext(e.target.value)}
            />
          </label>
          <div className="modal-actions">
            <button className="btn btn-primary">Aggiorna password</button>
          </div>
        </form>
      </div>
    </div>
  );
}
