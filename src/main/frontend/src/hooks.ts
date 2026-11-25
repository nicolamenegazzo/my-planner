import { useCallback, useEffect, useState } from 'react';
import { api, toRequest } from './api';
import { toastError } from './toast';
import type { Task, TaskRequest } from './types';

type TaskQuery = Parameters<typeof api.tasks.list>[0];

/** Lista di task con aggiornamenti ottimistici; `params` viene confrontato per valore. */
export function useTasks(params: TaskQuery = {}, enabled = true) {
  const key = JSON.stringify(params);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!enabled) {
      setTasks([]);
      setLoading(false);
      return;
    }
    try {
      setTasks(await api.tasks.list(JSON.parse(key)));
    } catch (e) {
      toastError(e);
    } finally {
      setLoading(false);
    }
  }, [key, enabled]);

  useEffect(() => {
    reload();
  }, [reload]);

  const patch = useCallback(async (task: Task, changes: Partial<Task>) => {
    const optimistic = { ...task, ...changes };
    setTasks((list) => list.map((t) => (t.id === task.id ? optimistic : t)));
    try {
      const saved = await api.tasks.update(task.id, toRequest(optimistic));
      setTasks((list) => list.map((t) => (t.id === saved.id ? saved : t)));
      return saved;
    } catch (e) {
      setTasks((list) => list.map((t) => (t.id === task.id ? task : t)));
      toastError(e);
      return undefined;
    }
  }, []);

  const add = useCallback(async (req: Partial<TaskRequest> & Pick<TaskRequest, 'title' | 'projectId'>) => {
    try {
      const created = await api.tasks.create(req);
      setTasks((list) => [...list, created]);
      return created;
    } catch (e) {
      toastError(e);
      return undefined;
    }
  }, []);

  const replace = useCallback((task: Task) => {
    setTasks((list) => (list.some((t) => t.id === task.id) ? list.map((t) => (t.id === task.id ? task : t)) : [...list, task]));
  }, []);

  const removeLocal = useCallback((id: string) => {
    setTasks((list) => list.filter((t) => t.id !== id));
  }, []);

  return { tasks, loading, reload, patch, add, replace, removeLocal };
}
