export type Role = 'USER' | 'ADMIN';
export type SprintStatus = 'PLANNED' | 'ACTIVE' | 'CLOSED';
export type LabelKind = 'STATUS' | 'PRIORITY';
export type FieldType = 'TEXT' | 'NUMBER' | 'DATE' | 'LABEL';

export interface User {
  id: string;
  username: string;
  displayName: string;
  email?: string | null;
  roles: Role[];
  active: boolean;
}

export interface Project {
  id: string;
  name: string;
  description?: string | null;
  color: string;
  archived: boolean;
}

export interface Sprint {
  id: string;
  name: string;
  goal?: string | null;
  startDate: string;
  endDate: string;
  status: SprintStatus;
}

/** Etichetta configurabile di stato o priorità; `done` = stato che chiude il task. */
export interface Label {
  id: string;
  kind: LabelKind;
  name: string;
  color: string;
  done: boolean;
  position: number;
}

export interface FieldOption {
  name: string;
  color?: string | null;
}

export interface FieldDefinition {
  id: string;
  name: string;
  type: FieldType;
  options: FieldOption[];
  position: number;
  showInBoard: boolean;
}

export interface Subtask {
  id?: string | null;
  title: string;
  done: boolean;
  status?: string | null;
  assigneeId?: string | null;
  dueDate?: string | null;
  estimateHours?: number | null;
  mondayId?: string | null;
}

export interface Comment {
  id: string;
  authorId: string;
  text: string;
  createdAt: string;
  parentId?: string | null;
  mondayId?: string | null;
}

export interface Attachment {
  fileId: string;
  name: string;
  size: number;
  contentType?: string | null;
  createdAt: string;
  uploadedBy?: string | null;
  commentId?: string | null;
}

export type CustomValue = string | number;

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority?: string | null;
  projectId: string;
  sprintId?: string | null;
  assigneeIds: string[];
  startDate?: string | null;
  dueDate?: string | null;
  estimateHours?: number | null;
  actualHours?: number | null;
  customFields: Record<string, CustomValue>;
  subtasks: Subtask[];
  comments: Comment[];
  attachments: Attachment[];
  position: number;
  mondayId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TaskRequest = Pick<
  Task,
  | 'title'
  | 'description'
  | 'status'
  | 'priority'
  | 'projectId'
  | 'sprintId'
  | 'assigneeIds'
  | 'startDate'
  | 'dueDate'
  | 'estimateHours'
  | 'actualHours'
  | 'customFields'
  | 'subtasks'
  | 'position'
>;

export interface TimeSlot {
  id: string;
  taskId: string;
  userId: string;
  start: string;
  end: string;
  note?: string | null;
}

export interface DocFolder {
  id: string;
  name: string;
  position: number;
}

export interface DocSummary {
  id: string;
  title: string;
  folderId?: string | null;
  updatedAt: string;
  updatedBy?: string | null;
}

export interface Doc extends DocSummary {
  content: string;
  createdBy?: string | null;
  createdAt: string;
  mondayObjectId?: string | null;
}

export interface MondayCatalog {
  account: string;
  workspaces: {
    id: string;
    name: string;
    boards: { id: string; name: string; itemsCount: number; folderId?: string | null }[];
    folders: { id: string; name: string }[];
    docs: { id: string; objectId: string; name: string; folderId?: string | null }[];
  }[];
}

export interface ImportJob {
  id: string;
  status: 'RUNNING' | 'DONE' | 'FAILED';
  log: string[];
  counters: Record<string, number>;
  startedAt: string;
  finishedAt?: string | null;
}
