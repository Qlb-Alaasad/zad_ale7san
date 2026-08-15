import type { Profile, UserRole } from './types';

export function isAdmin(profile: Profile | null | undefined): boolean {
  return profile?.role === 'admin' && profile.status === 'approved';
}

export function isTeacher(profile: Profile | null | undefined): boolean {
  return profile?.role === 'teacher' && profile.status === 'approved';
}

export function isStaff(profile: Profile | null | undefined): boolean {
  return isAdmin(profile) || isTeacher(profile);
}

export function isStudent(profile: Profile | null | undefined): boolean {
  return profile?.role === 'student';
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'مدير تقني',
  teacher: 'معلّم / مشرف شعبة',
  student: 'طالب',
};

export function roleLabel(role: UserRole | string): string {
  return ROLE_LABELS[role as UserRole] ?? role;
}

/** Dashboard path by role — pending/rejected handled separately. */
export function dashboardPathForRole(role: UserRole): string {
  if (role === 'admin') return '/admin';
  if (role === 'teacher') return '/teacher';
  return '/portal';
}
