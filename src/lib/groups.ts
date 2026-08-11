import { supabase } from './supabase';
import type { StudentGroup, GroupEnrollment } from './types';

export async function getAllGroups(): Promise<StudentGroup[]> {
  const { data, error } = await supabase.from('student_groups').select('*').order('name');
  if (error) {
    console.error('[groups] getAllGroups failed:', error.message);
    return [];
  }
  return (data as StudentGroup[]) || [];
}

export async function getStudentGroups(studentId: string): Promise<StudentGroup[]> {
  const { data, error } = await supabase
    .from('group_enrollments')
    .select('group_id, student_groups(*)')
    .eq('student_id', studentId);

  if (error) {
    console.error('[groups] getStudentGroups failed:', error.message);
    return [];
  }

  return (data || [])
    .map((row: { student_groups: StudentGroup | StudentGroup[] | null }) => {
      const g = row.student_groups;
      return Array.isArray(g) ? g[0] : g;
    })
    .filter(Boolean) as StudentGroup[];
}

export async function isStudentInHifzGroup(studentId: string): Promise<boolean> {
  const groups = await getStudentGroups(studentId);
  return groups.some((g) => g.is_hifz);
}

export async function createGroup(name: string, description: string, isHifz: boolean): Promise<boolean> {
  const { error } = await supabase.from('student_groups').insert({ name, description, is_hifz: isHifz });
  if (error) {
    console.error('[groups] createGroup failed:', error.message);
    return false;
  }
  return true;
}

export async function deleteGroup(groupId: string): Promise<boolean> {
  const { error } = await supabase.from('student_groups').delete().eq('id', groupId);
  if (error) {
    console.error('[groups] deleteGroup failed:', error.message);
    return false;
  }
  return true;
}

export async function bulkAssignToGroup(studentIds: string[], groupId: string): Promise<number> {
  const rows = studentIds.map((student_id) => ({ student_id, group_id: groupId }));
  const { error } = await supabase.from('group_enrollments').upsert(rows, { onConflict: 'student_id,group_id' });
  if (error) {
    console.error('[groups] bulkAssignToGroup failed:', error.message);
    return 0;
  }
  return studentIds.length;
}

export async function bulkRemoveFromGroup(studentIds: string[], groupId: string): Promise<void> {
  await supabase.from('group_enrollments').delete().eq('group_id', groupId).in('student_id', studentIds);
}

export async function bulkEnrollCourses(studentIds: string[], courseIds: string[]): Promise<number> {
  const courseRows = studentIds.flatMap((student_id) =>
    courseIds.map((course_id) => ({ student_id, course_id }))
  );
  if (courseRows.length === 0) return 0;
  const { error } = await supabase.from('student_courses').upsert(courseRows, { onConflict: 'student_id,course_id' });
  if (error) {
    console.error('[groups] bulkEnrollCourses failed:', error.message);
    return 0;
  }
  return courseRows.length;
}

export async function bulkUpdateStudentStatus(
  studentIds: string[],
  status: 'pending' | 'approved' | 'rejected'
): Promise<void> {
  await supabase.from('profiles').update({ status }).in('id', studentIds);
}

export function filterCategoriesForHifz<T extends { is_hifz?: boolean }>(
  categories: T[],
  inHifzGroup: boolean
): T[] {
  if (inHifzGroup) return categories;
  return categories.filter((c) => !(c.is_hifz ?? false));
}
