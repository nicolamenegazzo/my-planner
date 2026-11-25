import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { PageHeader } from '../components';
import { useData } from '../data';
import { Markdown } from '../Markdown';
import { toastError } from '../toast';
import type { Doc, DocFolder, DocSummary } from '../types';

type Mode = 'view' | 'edit' | 'split';

/** Documenti in cartelle (Knowledge Base, Note applicative…), con editor Markdown e anteprima. */
export function DocsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [folders, setFolders] = useState<DocFolder[]>([]);
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const [f, d] = await Promise.all([api.docs.folders(), api.docs.list()]);
      setFolders(f);
      setDocs(d);
    } catch (e) {
      toastError(e);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs.filter((d) => !q || d.title.toLowerCase().includes(q));
  }, [docs, search]);

  const createDoc = async (folderId: string | null) => {
    try {
      const doc = await api.docs.create({ title: 'Nuovo documento', folderId, content: '' });
      await load();
      navigate(`/documenti/${doc.id}?edit=1`);
    } catch (e) {
      toastError(e);
    }
  };

  const createFolder = async () => {
    const name = prompt('Nome della cartella');
    if (!name?.trim()) return;
    try {
      await api.docs.createFolder(name.trim());
      await load();
    } catch (e) {
      toastError(e);
    }
  };

  const renameFolder = async (f: DocFolder) => {
    const name = prompt('Nuovo nome della cartella', f.name);
    if (!name?.trim() || name === f.name) return;
    try {
      await api.docs.updateFolder(f.id, name.trim());
      await load();
    } catch (e) {
      toastError(e);
    }
  };

  const removeFolder = async (f: DocFolder) => {
    if (!confirm(`Eliminare la cartella "${f.name}"? I documenti resteranno, fuori da cartelle.`)) return;
    try {
      await api.docs.removeFolder(f.id);
      await load();
    } catch (e) {
      toastError(e);
    }
  };

  const sections: { folder: DocFolder | null; docs: DocSummary[] }[] = [
    ...folders.map((f) => ({ folder: f, docs: visible.filter((d) => d.folderId === f.id) })),
    { folder: null, docs: visible.filter((d) => !d.folderId || !folders.some((f) => f.id === d.folderId)) },
  ];

  return (
    <div className="page page-wide">
      <PageHeader title="Documenti">
        <button className="btn" onClick={createFolder}>
          + Cartella
        </button>
        <button className="btn btn-primary" onClick={() => createDoc(null)}>
          + Documento
        </button>
      </PageHeader>
      <div className="docs-layout">
        <aside className="docs-tree">
          <input className="search" placeholder="Cerca documenti…" value={search} onChange={(e) => setSearch(e.target.value)} />
          {sections.map(({ folder, docs: list }) => {
            if (!folder && list.length === 0) return null;
            const key = folder?.id ?? 'root';
            const isCollapsed = collapsed.has(key) && !search;
            return (
              <div key={key} className="docs-folder">
                <div className="docs-folder-head">
                  <button
                    className="link-like"
                    onClick={() =>
                      setCollapsed((s) => {
                        const next = new Set(s);
                        if (next.has(key)) next.delete(key);
                        else next.add(key);
                        return next;
                      })
                    }
                  >
                    <span className={`chevron ${isCollapsed ? '' : 'open'}`}>▸</span> 📁 {folder?.name ?? 'Senza cartella'}
                  </button>
                  <span className="muted small">{list.length}</span>
                  {folder && (
                    <span className="docs-folder-actions">
                      <button className="icon-btn" title="Nuovo documento nella cartella" onClick={() => createDoc(folder.id)}>
                        +
                      </button>
                      <button className="icon-btn" title="Rinomina" onClick={() => renameFolder(folder)}>
                        ✎
                      </button>
                      <button className="icon-btn" title="Elimina cartella" onClick={() => removeFolder(folder)}>
                        ✕
                      </button>
                    </span>
                  )}
                </div>
                {!isCollapsed &&
                  list.map((d) => (
                    <button key={d.id} className={`docs-item ${d.id === id ? 'active' : ''}`} onClick={() => navigate(`/documenti/${d.id}`)}>
                      📄 {d.title}
                    </button>
                  ))}
              </div>
            );
          })}
          {docs.length === 0 && <p className="muted small">Nessun documento. Creane uno o importali da monday.com.</p>}
        </aside>
        <section className="docs-content">
          {id ? (
            <DocEditor key={id} id={id} folders={folders} onChanged={load} onDeleted={() => navigate('/documenti')} />
          ) : (
            <div className="empty-state">Seleziona un documento dall'elenco.</div>
          )}
        </section>
      </div>
    </div>
  );
}

function DocEditor({
  id,
  folders,
  onChanged,
  onDeleted,
}: {
  id: string;
  folders: DocFolder[];
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const { userById } = useData();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [draft, setDraft] = useState<Doc | null>(null);
  const [mode, setMode] = useState<Mode>(() => (new URLSearchParams(location.search).has('edit') ? 'split' : 'view'));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.docs
      .get(id)
      .then((d) => {
        setDoc(d);
        setDraft(d);
      })
      .catch(toastError);
  }, [id]);

  if (!doc || !draft) return <div className="muted">Caricamento…</div>;

  const dirty = doc.title !== draft.title || doc.content !== draft.content || (doc.folderId ?? '') !== (draft.folderId ?? '');

  const save = async () => {
    if (!draft.title.trim()) return toastError(new Error('Il titolo è obbligatorio'));
    setSaving(true);
    try {
      const saved = await api.docs.update(doc.id, { title: draft.title.trim(), folderId: draft.folderId, content: draft.content });
      setDoc(saved);
      setDraft(saved);
      onChanged();
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Eliminare il documento "${doc.title}"?`)) return;
    try {
      await api.docs.remove(doc.id);
      onChanged();
      onDeleted();
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <div className="doc-editor">
      <div className="doc-toolbar">
        <input className="drawer-title grow" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        <select className="plain-select" value={draft.folderId ?? ''} onChange={(e) => setDraft({ ...draft, folderId: e.target.value || null })}>
          <option value="">Senza cartella</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <div className="segmented">
          <button className={mode === 'view' ? 'active' : ''} onClick={() => setMode('view')}>
            Lettura
          </button>
          <button className={mode === 'split' ? 'active' : ''} onClick={() => setMode('split')}>
            Affiancato
          </button>
          <button className={mode === 'edit' ? 'active' : ''} onClick={() => setMode('edit')}>
            Modifica
          </button>
        </div>
        <button className="btn btn-primary" disabled={!dirty || saving} onClick={save}>
          {saving ? 'Salvataggio…' : 'Salva'}
        </button>
        <button className="btn btn-danger-ghost" onClick={remove}>
          Elimina
        </button>
      </div>
      <p className="muted small">
        Aggiornato il {new Date(doc.updatedAt).toLocaleString('it-IT')}
        {doc.updatedBy && userById.get(doc.updatedBy) ? ` da ${userById.get(doc.updatedBy)!.displayName}` : ''}
        {doc.mondayObjectId ? ' · importato da monday.com' : ''}
      </p>
      <div className={`doc-body doc-${mode}`}>
        {mode !== 'view' && (
          <textarea
            className="doc-source"
            value={draft.content}
            placeholder="Scrivi in Markdown: # titolo, - elenco, **grassetto**, | tabella |…"
            onChange={(e) => setDraft({ ...draft, content: e.target.value })}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                if (dirty) save();
              }
            }}
          />
        )}
        {mode !== 'edit' && (
          <div className="doc-preview">
            <Markdown content={draft.content} />
          </div>
        )}
      </div>
    </div>
  );
}
