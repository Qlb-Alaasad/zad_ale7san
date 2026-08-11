import type { Task, TaskStatus } from './types';

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  assigned: 'مُسندة',
  in_progress: 'قيد التنفيذ',
  submitted: 'مُسلّمة',
  completed: 'مكتملة',
};

export const TASK_STATUS_COLORS: Record<TaskStatus, 'gray' | 'gold' | 'forest' | 'green'> = {
  assigned: 'gray',
  in_progress: 'gold',
  submitted: 'forest',
  completed: 'green',
};

export function isTaskOverdue(task: Task): boolean {
  if (!task.due_date || task.status === 'completed') return false;
  const due = new Date(task.due_date);
  due.setHours(23, 59, 59, 999);
  return due < new Date();
}

export function normalizeTaskStatus(task: Task): TaskStatus {
  if (task.status) return task.status;
  return task.completed ? 'completed' : 'assigned';
}

export function taskProgressPercent(tasks: Task[]): number {
  if (tasks.length === 0) return 100;
  const done = tasks.filter((t) => normalizeTaskStatus(t) === 'completed').length;
  return Math.round((done / tasks.length) * 100);
}
