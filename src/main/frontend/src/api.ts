import type {
  Doc,
  DocFolder,
  DocSummary,
  FieldDefinition,
  ImportJob,
  Label,
  LabelKind,
  MondayCatalog,
  Project,
  Sprint,
  Task,
  TaskRequest,
  TimeSlot,
  User,
} from './types';

const TOKEN_KEY = 'mymonday.token';

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* storage non disponibile: il token resta valido solo per la sessione corrente */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignorato */
    }
  },
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let unauthorizedHandler: () => void = () => {};

export function onUnauthorized(handler: () => void) {
  unauthorizedHandler = handler;
}

function authHeaders(): Record<string, string> {
  const token = tokenStore.get();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function send(method: string, path: string, body?: BodyInit, headers: Record<string, string> = {}) {
  const res = await fetch(`/api${path}`, { method, headers: { ...authHeaders(), ...headers }, body });
  if (res.status === 401 && path !== '/auth/login') {
    unauthorizedHandler();
  }
  if (!res.ok) {
    let message = res.statusText || `Errore ${res.status}`;
    try {
      const data = await res.json();
      message = data.detail || data.message || message;
    } catch {
      /* risposta senza corpo JSON */
    }
    throw new ApiError(res.status, message);
  }
  return res;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await send(
    method,
    path,
    body !== undefined ? JSON.stringify(body) : undefined,
    body !== undefined ? { 'Content-Type': 'application/json' } : {},
  );
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function query(params: Record<string, string | boolean | undefined | null>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export function toRequest(t: Task): TaskRequest {
  return {
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    projectId: t.projectId,
    sprintId: t.sprintId,
    assigneeIds: t.assigneeIds,
    startDate: t.startDate,
    dueDate: t.dueDate,
    estimateHours: t.estimateHours,
    actualHours: t.actualHours,
    customFields: t.customFields,
    subtasks: t.subtasks,
    position: t.position,
  };
}

/** Scarica un file protetto (serve il token, quindi non basta un normale link). */
export async function fetchFileBlob(fileId: string): Promise<Blob> {
  const res = await send('GET', `/files/${fileId}`);
  return res.blob();
}

export async function downloadFile(fileId: string, name: string) {
  const url = URL.createObjectURL(await fetchFileBlob(fileId));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

type LabelInput = { kind: LabelKind; name: string; color: string; done: boolean };
type FieldInput = Omit<FieldDefinition, 'id' | 'position'> & { position?: number };

export const api = {
  login: (username: string, password: string) =>
    request<{ token: string; user: User }>('POST', '/auth/login', { username, password }),
  me: () => request<User>('GET', '/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>('POST', '/auth/password', { currentPassword, newPassword }),

  users: {
    list: () => request<User[]>('GET', '/users'),
    create: (u: { username: string; displayName: string; email?: string; password: string; roles: string[] }) =>
      request<User>('POST', '/users', u),
    update: (
      id: string,
      u: { displayName: string; email?: string | null; roles: string[]; active: boolean; password?: string },
    ) => request<User>('PUT', `/users/${id}`, u),
    remove: (id: string) => request<void>('DELETE', `/users/${id}`),
  },

  projects: {
    list: () => request<Project[]>('GET', '/projects'),
    create: (p: Omit<Project, 'id'>) => request<Project>('POST', '/projects', p),
    update: (id: string, p: Omit<Project, 'id'>) => request<Project>('PUT', `/projects/${id}`, p),
    remove: (id: string) => request<void>('DELETE', `/projects/${id}`),
  },

  sprints: {
    list: () => request<Sprint[]>('GET', '/sprints'),
    create: (s: Pick<Sprint, 'name' | 'goal' | 'startDate' | 'endDate'>) => request<Sprint>('POST', '/sprints', s),
    update: (id: string, s: Pick<Sprint, 'name' | 'goal' | 'startDate' | 'endDate'>) =>
      request<Sprint>('PUT', `/sprints/${id}`, s),
    start: (id: string) => request<Sprint>('POST', `/sprints/${id}/start`),
    close: (id: string, moveToSprintId: string | null) =>
      request<Sprint>('POST', `/sprints/${id}/close`, { moveToSprintId }),
    remove: (id: string) => request<void>('DELETE', `/sprints/${id}`),
  },

  labels: {
    list: () => request<Label[]>('GET', '/labels'),
    create: (l: LabelInput) => request<Label>('POST', '/labels', l),
    update: (id: string, l: LabelInput) => request<Label>('PUT', `/labels/${id}`, l),
    reorder: (kind: LabelKind, ids: string[]) => request<Label[]>('PUT', '/labels/order', { kind, ids }),
    remove: (id: string, replaceWith?: string) =>
      request<void>('DELETE', `/labels/${id}${replaceWith !== undefined ? query({ replaceWith: replaceWith || ' ' }) : ''}`),
  },

  fields: {
    list: () => request<FieldDefinition[]>('GET', '/fields'),
    create: (f: FieldInput) => request<FieldDefinition>('POST', '/fields', f),
    update: (id: string, f: FieldInput) => request<FieldDefinition>('PUT', `/fields/${id}`, f),
    remove: (id: string) => request<void>('DELETE', `/fields/${id}`),
  },

  tasks: {
    list: (params: { projectId?: string; sprintId?: string; backlog?: boolean; assigneeId?: string; openOnly?: boolean } = {}) =>
      request<Task[]>('GET', `/tasks${query(params)}`),
    get: (id: string) => request<Task>('GET', `/tasks/${id}`),
    create: (t: Partial<TaskRequest> & Pick<TaskRequest, 'title' | 'projectId'>) => request<Task>('POST', '/tasks', t),
    update: (id: string, t: TaskRequest) => request<Task>('PUT', `/tasks/${id}`, t),
    remove: (id: string) => request<void>('DELETE', `/tasks/${id}`),
    comment: (id: string, text: string, parentId?: string | null) =>
      request<Task>('POST', `/tasks/${id}/comments`, { text, parentId }),
    upload: async (id: string, file: File) => {
      const form = new FormData();
      form.append('file', file);
      const res = await send('POST', `/tasks/${id}/attachments`, form);
      return (await res.json()) as Task;
    },
    removeAttachment: (id: string, fileId: string) => request<Task>('DELETE', `/tasks/${id}/attachments/${fileId}`),
  },

  slots: {
    list: (from: string, to: string, userId?: string) => request<TimeSlot[]>('GET', `/slots${query({ from, to, userId })}`),
    byTask: (taskId: string) => request<TimeSlot[]>('GET', `/slots/by-task/${taskId}`),
    create: (s: Omit<TimeSlot, 'id' | 'userId'> & { userId?: string }) => request<TimeSlot>('POST', '/slots', s),
    update: (id: string, s: Omit<TimeSlot, 'id'>) => request<TimeSlot>('PUT', `/slots/${id}`, s),
    remove: (id: string) => request<void>('DELETE', `/slots/${id}`),
  },

  docs: {
    folders: () => request<DocFolder[]>('GET', '/doc-folders'),
    createFolder: (name: string) => request<DocFolder>('POST', '/doc-folders', { name }),
    updateFolder: (id: string, name: string, position?: number) =>
      request<DocFolder>('PUT', `/doc-folders/${id}`, { name, position }),
    removeFolder: (id: string) => request<void>('DELETE', `/doc-folders/${id}`),
    list: () => request<DocSummary[]>('GET', '/docs'),
    get: (id: string) => request<Doc>('GET', `/docs/${id}`),
    create: (d: { title: string; folderId?: string | null; content?: string }) => request<Doc>('POST', '/docs', d),
    update: (id: string, d: { title: string; folderId?: string | null; content: string }) =>
      request<Doc>('PUT', `/docs/${id}`, d),
    remove: (id: string) => request<void>('DELETE', `/docs/${id}`),
  },

  mondayImport: {
    catalog: (token: string) => request<MondayCatalog>('POST', '/import/monday/catalog', { token }),
    start: (token: string, boardIds: string[], docIds: string[]) =>
      request<ImportJob>('POST', '/import/monday/jobs', { token, boardIds, docIds }),
    job: (id: string) => request<ImportJob>('GET', `/import/monday/jobs/${id}`),
  },
};
