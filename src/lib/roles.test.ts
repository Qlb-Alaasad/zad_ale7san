import { describe, expect, it } from 'vitest';
import {
  dashboardPathForRole,
  isAdmin,
  isStaff,
  isStudent,
  isTeacher,
  roleLabel,
} from './roles';
import type { Profile } from './types';

function profile(overrides: Partial<Profile> & Pick<Profile, 'role'>): Profile {
  return {
    id: 'user-1',
    full_name: 'Test User',
    age: null,
    parent_phone: null,
    status: 'approved',
    quran_progress: 0,
    current_module: '',
    created_at: '',
    ...overrides,
  };
}

describe('admin role journey', () => {
  it('routes approved admins to the admin dashboard', () => {
    const admin = profile({ role: 'admin' });
    expect(isAdmin(admin)).toBe(true);
    expect(isStaff(admin)).toBe(true);
    expect(dashboardPathForRole('admin')).toBe('/admin');
  });

  it('rejects pending admins from staff privileges', () => {
    const pendingAdmin = profile({ role: 'admin', status: 'pending' });
    expect(isAdmin(pendingAdmin)).toBe(false);
    expect(isStaff(pendingAdmin)).toBe(false);
  });
});

describe('teacher role journey', () => {
  it('routes approved teachers to the teacher dashboard', () => {
    const teacher = profile({ role: 'teacher' });
    expect(isTeacher(teacher)).toBe(true);
    expect(isStaff(teacher)).toBe(true);
    expect(isAdmin(teacher)).toBe(false);
    expect(dashboardPathForRole('teacher')).toBe('/teacher');
  });

  it('labels teacher role in Arabic UI copy', () => {
    expect(roleLabel('teacher')).toBe('معلّم / مشرف شعبة');
  });
});

describe('student role journey', () => {
  it('routes students to the student portal', () => {
    const student = profile({ role: 'student' });
    expect(isStudent(student)).toBe(true);
    expect(isStaff(student)).toBe(false);
    expect(dashboardPathForRole('student')).toBe('/portal');
  });

  it('allows pending students to remain students for routing checks', () => {
    const pendingStudent = profile({ role: 'student', status: 'pending' });
    expect(isStudent(pendingStudent)).toBe(true);
  });
});
