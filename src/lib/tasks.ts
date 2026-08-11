import { supabase } from './supabase';
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

function logTaskFetchError(operation: string, studentId: string, error: { message: string; code?: string; details?: string; hint?: string }) {
  console.error(`[tasks] ${operation} failed — possible RLS block or schema mismatch`, {
    studentId,
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
  });
}

/** Fetch all tasks assigned to a student (student_id = auth.users.id / profiles.id). */
export async function getTasksForStudent(studentId: string): Promise<Task[]> {
  if (!studentId) {
    console.warn('[tasks] getTasksForStudent called with empty studentId');
    return [];
  }

  const { data, error } = await supabase
    .from('tasks')
    .select('*, category:categories(id, name)')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });

  if (error) {
    logTaskFetchError('getTasksForStudent', studentId, error);
    return [];
  }

  const tasks = (data as Task[]) || [];
  if (tasks.length === 0) {
    console.info('[tasks] getTasksForStudent returned 0 rows', { studentId });
  } else {
    console.debug('[tasks] getTasksForStudent ok', { studentId, count: tasks.length });
  }

  return tasks;
}

/** Admin: fetch all tasks (RLS allows admin full select). */
export async function getAllTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*, category:categories(id, name)')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[tasks] getAllTasks failed:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return [];
  }

  return (data as Task[]) || [];
}

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

export type TaskInsertRow = {
  student_id: string;
  category_id: string | null;
  title: string;
  description: string;
  due_date: string | null;
  status?: TaskStatus;
  completed?: boolean;
};

/** Insert tasks for one or more students; logs RLS/validation errors. */
export async function insertTasksForStudents(rows: TaskInsertRow[]): Promise<{ ok: boolean; error?: string }> {
  const payload = rows.map((r) => ({
    ...r,
    status: r.status ?? 'assigned',
    completed: r.completed ?? false,
  }));

  const { error } = await supabase.from('tasks').insert(payload);

  if (error) {
    console.error('[tasks] insertTasksForStudents failed:', {
      rowCount: payload.length,
      studentIds: payload.map((r) => r.student_id),
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, error: error.message };
  }

  console.debug('[tasks] insertTasksForStudents ok', { rowCount: payload.length });
  return { ok: true };
}
