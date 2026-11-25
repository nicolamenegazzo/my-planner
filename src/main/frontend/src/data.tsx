import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';
import { toastError } from './toast';
import type { FieldDefinition, Label, Project, Sprint, Task, User } from './types';

/** Anagrafiche condivise da tutte le pagine: progetti, sprint, utenti, etichette e campi personalizzati. */
interface DataState {
  projects: Project[];
  sprints: Sprint[];
  users: User[];
  statuses: Label[];
  priorities: Label[];
  fields: FieldDefinition[];
  projectById: Map<string, Project>;
  sprintById: Map<string, Sprint>;
  userById: Map<string, User>;
  labelById: Map<string, Label>;
  activeSprint: Sprint | undefined;
  isDone: (task: Pick<Task, 'status'>) => boolean;
  loaded: boolean;
  reload: () => Promise<void>;
}

const DataContext = createContext<DataState | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [p, s, u, l, f] = await Promise.all([
        api.projects.list(),
        api.sprints.list(),
        api.users.list(),
        api.labels.list(),
        api.fields.list(),
      ]);
      setProjects(p);
      setSprints(s);
      setUsers(u);
      setLabels(l);
      setFields(f);
    } catch (e) {
      toastError(e);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const value = useMemo<DataState>(() => {
    const labelById = new Map(labels.map((l) => [l.id, l]));
    return {
      projects,
      sprints,
      users,
      statuses: labels.filter((l) => l.kind === 'STATUS').sort((a, b) => a.position - b.position),
      priorities: labels.filter((l) => l.kind === 'PRIORITY').sort((a, b) => a.position - b.position),
      fields: [...fields].sort((a, b) => a.position - b.position),
      projectById: new Map(projects.map((p) => [p.id, p])),
      sprintById: new Map(sprints.map((s) => [s.id, s])),
      userById: new Map(users.map((u) => [u.id, u])),
      labelById,
      activeSprint: sprints.find((s) => s.status === 'ACTIVE'),
      isDone: (task) => !!labelById.get(task.status)?.done,
      loaded,
      reload,
    };
  }, [projects, sprints, users, labels, fields, loaded, reload]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataState {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData fuori da DataProvider');
  return ctx;
}
