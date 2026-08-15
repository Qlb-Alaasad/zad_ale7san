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

const VALID_STATUSES: TaskStatus[] = ['assigned', 'in_progress', 'submitted', 'completed'];

/** Allowed student-driven status transitions (defense-in-depth with DB trigger). */
const STUDENT_STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  assigned: ['in_progress'],
  in_progress: ['submitted', 'completed'],
  submitted: [],
  completed: [],
};

export type StudentTaskUpdate = {
  status?: TaskStatus;
  completed?: boolean;
  submission_text?: string;
  submitted_at?: string | null;
  submission_file_path?: string | null;
};

/** Fetch all tasks assigned to a student (student_id = auth.users.id / profiles.id). */
export async function getTasksForStudent(studentId: string): Promise<Task[]> {
  if (!studentId) return [];

  const { data, error } = await supabase
    .from('tasks')
    .select('*, category:categories(id, name)')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[tasks] getTasksForStudent failed:', error.message);
    return [];
  }

  return (data as Task[]) || [];
}

/** Admin: fetch all tasks (RLS allows admin full select). */
export async function getAllTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*, category:categories(id, name)')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[tasks] getAllTasks failed:', error.message);
    return [];
  }

  return (data as Task[]) || [];
}

/**
 * Student-safe task update — whitelisted fields only, scoped to owning student.
 * RLS + DB trigger provide additional enforcement.
 */
export async function updateStudentTask(
  taskId: string,
  studentId: string,
  updates: StudentTaskUpdate,
  currentStatus?: TaskStatus
): Promise<{ ok: boolean; error?: string }> {
  if (!taskId || !studentId) {
    return { ok: false, error: 'missing_ids' };
  }

  if (updates.status && !VALID_STATUSES.includes(updates.status)) {
    return { ok: false, error: 'invalid_status' };
  }

  if (updates.status && currentStatus && updates.status !== currentStatus) {
    const allowed = STUDENT_STATUS_TRANSITIONS[currentStatus] ?? [];
    if (!allowed.includes(updates.status)) {
      return { ok: false, error: 'invalid_transition' };
    }
  }

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.status !== undefined) {
    payload.status = updates.status;
    payload.completed = updates.status === 'completed';
  }
  if (updates.completed !== undefined && updates.status === undefined) {
    payload.completed = updates.completed;
  }
  if (updates.submission_text !== undefined) payload.submission_text = updates.submission_text;
  if (updates.submitted_at !== undefined) payload.submitted_at = updates.submitted_at;
  if (updates.submission_file_path !== undefined) payload.submission_file_path = updates.submission_file_path;

  const { error } = await supabase
    .from('tasks')
    .update(payload)
    .eq('id', taskId)
    .eq('student_id', studentId);

  if (error) {
    console.error('[tasks] updateStudentTask failed:', error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true };
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
    console.error('[tasks] insertTasksForStudents failed:', error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
