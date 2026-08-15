import { describe, expect, it } from 'vitest';
import {
  normalizeTaskStatus,
  taskProgressPercent,
  TASK_STATUS_LABELS,
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
