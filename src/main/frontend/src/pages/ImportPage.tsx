import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { PageHeader } from '../components';
import { useData } from '../data';
import { toastError } from '../toast';
import type { ImportJob, MondayCatalog } from '../types';

type Workspace = MondayCatalog['workspaces'][number];

export function ImportPage() {
  const { isAdmin } = useAuth();
  const { reload } = useData();
  const [token, setToken] = useState('');
  const [catalog, setCatalog] = useState<MondayCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [boards, setBoards] = useState<Set<string>>(new Set());
  const [docs, setDocs] = useState<Set<string>>(new Set());
  const [job, setJob] = useState<ImportJob | null>(null);

  useEffect(() => {
    if (!job || job.status !== 'RUNNING') return;
    const timer = setTimeout(async () => {
      try {
        const next = await api.mondayImport.job(job.id);
        setJob(next);
        if (next.status !== 'RUNNING') await reload();
      } catch (e) {
        toastError(e);
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [job, reload]);

  if (!isAdmin) return <Navigate to="/board" replace />;

  const loadCatalog = async () => {
    setLoading(true);
    try {
      setCatalog(await api.mondayImport.catalog(token));
    } catch (e) {
      toastError(e);
    } finally {
      setLoading(false);
    }
  };

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, ids: string[], on: boolean) => {
    const next = new Set(set);
    ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
    setter(next);
  };

  const selectWorkspace = (ws: Workspace, on: boolean) => {
    toggle(boards, setBoards, ws.boards.map((b) => b.id), on);
    toggle(docs, setDocs, ws.docs.map((d) => d.id), on);
  };

  const start = async () => {
    try {
      setJob(await api.mondayImport.start(token, [...boards], [...docs]));
    } catch (e) {
      toastError(e);
    }
  };

  const running = job?.status === 'RUNNING';

  return (
    <div className="page">
      <PageHeader title="Import da monday.com" />

      <section className="settings-card">
        <h3>1. Token API</h3>
        <p className="muted small">
          Su monday.com: clic sull'avatar in basso a sinistra → <strong>Developers</strong> → <strong>My access tokens</strong> →
          Show / Copy. Il token non viene salvato: serve solo per questa importazione. Se sul server è impostata la variabile
          MONDAY_API_TOKEN puoi lasciare il campo vuoto.
        </p>
        <div className="row">
          <input
            type="password"
            className="grow"
            placeholder="Token API personale di monday.com"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
          />
          <button className="btn btn-primary" disabled={loading} onClick={loadCatalog}>
            {loading ? 'Lettura…' : 'Leggi board e documenti'}
          </button>
        </div>
      </section>

      {catalog && (
        <section className="settings-card">
          <h3>2. Cosa importare</h3>
          <p className="muted small">
            Account: {catalog.account}. Ogni board diventa un progetto: i gruppi con un periodo nel nome ("Ottobre 2026",
            "13 - 17 Ottobre 2025"…) diventano sprint, gli altri restano nel campo "Gruppo monday". I documenti vengono
            convertiti in Markdown mantenendo le cartelle.
          </p>
          {catalog.workspaces.map((ws) => (
            <WorkspaceSelection
              key={ws.id}
              ws={ws}
              boards={boards}
              docs={docs}
              onToggleBoards={(ids, on) => toggle(boards, setBoards, ids, on)}
              onToggleDocs={(ids, on) => toggle(docs, setDocs, ids, on)}
              onToggleAll={(on) => selectWorkspace(ws, on)}
            />
          ))}
          <div className="modal-actions">
            <span className="muted small">
              {boards.size} board, {docs.size} documenti selezionati
            </span>
            <button className="btn btn-primary" disabled={running || boards.size + docs.size === 0} onClick={start}>
              {running ? 'Import in corso…' : 'Avvia import'}
            </button>
          </div>
        </section>
      )}

      {job && (
        <section className="settings-card">
          <h3>
            3. Avanzamento{' '}
            <span className={`mini-pill job-${job.status.toLowerCase()}`}>
              {job.status === 'RUNNING' ? 'in corso' : job.status === 'DONE' ? 'completato' : 'interrotto'}
            </span>
          </h3>
          <div className="counters">
            {Object.entries(job.counters).map(([k, v]) => (
              <div key={k}>
                <strong>{v}</strong>
                <small>{k}</small>
              </div>
            ))}
          </div>
          <pre className="job-log">{job.log.join('\n')}</pre>
          {job.status === 'DONE' && (
            <p>
              Fatto! Vai alla <Link to="/board">Board</Link>, agli <Link to="/sprint">Sprint</Link> o ai{' '}
              <Link to="/documenti">Documenti</Link>. Gli utenti monday sono stati creati disattivati: abilitali e imposta una
              password dalla pagina <Link to="/utenti">Utenti</Link>.
            </p>
          )}
          <p className="muted small">
            Puoi rilanciare l'import quando vuoi: gli elementi già importati vengono aggiornati con i dati di monday (che
            prevalgono sui campi importati), senza duplicati; task, commenti e sottotask creati solo in MyMonday restano
            intatti. Il contenuto dei documenti viene invece sovrascritto.
          </p>
        </section>
      )}
    </div>
  );
}

function WorkspaceSelection({
  ws,
  boards,
  docs,
  onToggleBoards,
  onToggleDocs,
  onToggleAll,
}: {
  ws: Workspace;
  boards: Set<string>;
  docs: Set<string>;
  onToggleBoards: (ids: string[], on: boolean) => void;
  onToggleDocs: (ids: string[], on: boolean) => void;
  onToggleAll: (on: boolean) => void;
}) {
  const folderName = new Map(ws.folders.map((f) => [f.id, f.name]));
  const docGroups = new Map<string, typeof ws.docs>();
  for (const d of ws.docs) {
    const key = d.folderId && folderName.has(d.folderId) ? d.folderId : '';
    docGroups.set(key, [...(docGroups.get(key) ?? []), d]);
  }
  const allSelected = ws.boards.every((b) => boards.has(b.id)) && ws.docs.every((d) => docs.has(d.id));
  if (ws.boards.length === 0 && ws.docs.length === 0) return null;

  return (
    <div className="ws-block">
      <div className="ws-head">
        <strong>{ws.name}</strong>
        <button className="link-like small" onClick={() => onToggleAll(!allSelected)}>
          {allSelected ? 'Deseleziona tutto' : 'Seleziona tutto'}
        </button>
      </div>
      {ws.boards.length > 0 && (
        <div className="ws-section">
          <div className="muted small">Board</div>
          {ws.boards.map((b) => (
            <label key={b.id} className="check">
              <input type="checkbox" checked={boards.has(b.id)} onChange={(e) => onToggleBoards([b.id], e.target.checked)} />
              {b.name} <small className="muted">({b.itemsCount} elementi)</small>
            </label>
          ))}
        </div>
      )}
      {[...docGroups.entries()].map(([folderId, list]) => {
        const all = list.every((d) => docs.has(d.id));
        return (
          <div key={folderId || 'root'} className="ws-section">
            <label className="check muted small">
              <input type="checkbox" checked={all} onChange={(e) => onToggleDocs(list.map((d) => d.id), e.target.checked)} />
              📁 {folderId ? folderName.get(folderId) : 'Documenti senza cartella'}
            </label>
            {list.map((d) => (
              <label key={d.id} className="check nested">
                <input type="checkbox" checked={docs.has(d.id)} onChange={(e) => onToggleDocs([d.id], e.target.checked)} />
                {d.name}
              </label>
            ))}
          </div>
        );
      })}
    </div>
  );
}
