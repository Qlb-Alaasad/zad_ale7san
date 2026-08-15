import { describe, expect, it } from 'vitest';
import {
  isTaskOverdue,
  normalizeTaskStatus,
  taskProgressPercent,
  TASK_STATUS_LABELS,
  updateStudentTask,
} from './tasks';
import type { Task, TaskStatus } from './types';

function task(overrides: Partial<Task> & Pick<Task, 'id' | 'student_id'>): Task {
  return {
    category_id: null,
    title: 'Assignment',
    description: '',
    due_date: null,
    status: 'assigned',
    completed: false,
    submission_text: '',
    submitted_at: null,
    updated_at: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('student task workflow', () => {
  it('supports assigned → in_progress → submitted → completed labels', () => {
    expect(TASK_STATUS_LABELS.assigned).toBe('مُسندة');
    expect(TASK_STATUS_LABELS.in_progress).toBe('قيد التنفيذ');
    expect(TASK_STATUS_LABELS.submitted).toBe('مُسلّمة');
    expect(TASK_STATUS_LABELS.completed).toBe('مكتملة');
  });

  it('derives legacy completed flag when status is missing', () => {
    expect(normalizeTaskStatus(task({ id: 't1', student_id: 's1', completed: true, status: undefined as unknown as TaskStatus }))).toBe('completed');
    expect(normalizeTaskStatus(task({ id: 't2', student_id: 's1', completed: false, status: undefined as unknown as TaskStatus }))).toBe('assigned');
  });

  it('tracks progress as students complete assignments', () => {
    const tasks = [
      task({ id: 't1', student_id: 's1', status: 'completed' }),
      task({ id: 't2', student_id: 's1', status: 'submitted' }),
      task({ id: 't3', student_id: 's1', status: 'assigned' }),
    ];
    expect(taskProgressPercent(tasks)).toBe(33);
  });

  it('reports 100% when no tasks are assigned', () => {
    expect(taskProgressPercent([])).toBe(100);
  });
});

describe('teacher/admin task oversight', () => {
  it('recognizes submitted work awaiting review', () => {
    const submitted = task({ id: 't1', student_id: 's1', status: 'submitted', submission_text: 'My answer' });
    expect(normalizeTaskStatus(submitted)).toBe('submitted');
    expect(submitted.submission_text).toBe('My answer');
  });
});

// ========== NEW EDGE CASES ==========

describe('isTaskOverdue edge cases', () => {
  it('returns false when due_date is null', () => {
    const t = task({ id: 't1', student_id: 's1', due_date: null, status: 'assigned' });
    expect(isTaskOverdue(t)).toBe(false);
  });

  it('returns false when task is completed even if past due', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const t = task({ id: 't1', student_id: 's1', due_date: yesterday.toISOString(), status: 'completed' });
    expect(isTaskOverdue(t)).toBe(false);
  });

  it('returns true when due date is yesterday and status is assigned', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const t = task({ id: 't1', student_id: 's1', due_date: yesterday.toISOString(), status: 'assigned' });
    expect(isTaskOverdue(t)).toBe(true);
  });

  it('returns false for same-day task at 23:59 boundary', () => {
    const t = task({ id: 't1', student_id: 's1', due_date: new Date().toISOString(), status: 'assigned' });
    // Because due date is set to 23:59:59.999, it should NOT be overdue on the same calendar day
    expect(isTaskOverdue(t)).toBe(false);
  });
});

describe('updateStudentTask validation', () => {
  it('rejects missing taskId or studentId', async () => {
    const result = await updateStudentTask('', 'student', { status: 'in_progress' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('missing_ids');
  });

  it('rejects invalid status values', async () => {
    const result = await updateStudentTask('t1', 's1', { status: 'invalid' as TaskStatus });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('invalid_status');
  });

  it('rejects disallowed transitions', async () => {
    const result = await updateStudentTask('t1', 's1', { status: 'completed' }, 'submitted');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('invalid_transition');
  });

  it('allows valid assigned → in_progress transition', async () => {
    // This would need a Supabase mock for full integration; unit-test the guard only.
    const result = await updateStudentTask('t1', 's1', { status: 'in_progress' }, 'assigned');
    // Since we have no mock, Supabase will fail; we at least verify the guard passed.
    expect(result.error).not.toBe('invalid_transition');
    expect(result.error).not.toBe('invalid_status');
  });
});
