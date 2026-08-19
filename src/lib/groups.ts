import { supabase } from './supabase';
import type { StudentGroup } from './types';

/** Sprint 1: group configuration payload (إعدادات الشعبة). */
export type GroupConfigInput = {
  capacity?: number | null;
  /** JS weekday numbers: 0=Sunday … 6=Saturday. */
  schedule_days?: number[] | null;
  schedule_start_time?: string | null;
  schedule_end_time?: string | null;
  location?: string;
  is_online?: boolean;
  meeting_url?: string | null;
  primary_teacher_id?: string | null;
};

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

/** Sprint 1: create a group with its full configuration in one call. */
export async function createGroupWithConfig(
  name: string,
  description: string,
  isHifz: boolean,
  config: GroupConfigInput = {}
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { data, error } = await supabase
    .from('student_groups')
    .insert({
      name,
      description,
      is_hifz: isHifz,
      capacity: config.capacity ?? null,
      schedule_days: config.schedule_days ?? null,
      schedule_start_time: config.schedule_start_time ?? null,
      schedule_end_time: config.schedule_end_time ?? null,
      location: config.location ?? '',
      is_online: config.is_online ?? false,
      meeting_url: config.meeting_url ?? null,
      primary_teacher_id: config.primary_teacher_id ?? null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[groups] createGroupWithConfig failed:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, id: data?.id as string | undefined };
}

/** Sprint 1: update group configuration (schedule, capacity, primary teacher…). */
export async function updateGroupConfig(groupId: string, config: GroupConfigInput): Promise<boolean> {
  const payload: Record<string, unknown> = {};
  if (config.capacity !== undefined) payload.capacity = config.capacity;
  if (config.schedule_days !== undefined) payload.schedule_days = config.schedule_days;
  if (config.schedule_start_time !== undefined) payload.schedule_start_time = config.schedule_start_time;
  if (config.schedule_end_time !== undefined) payload.schedule_end_time = config.schedule_end_time;
  if (config.location !== undefined) payload.location = config.location;
  if (config.is_online !== undefined) payload.is_online = config.is_online;
  if (config.meeting_url !== undefined) payload.meeting_url = config.meeting_url;
  if (config.primary_teacher_id !== undefined) payload.primary_teacher_id = config.primary_teacher_id;

  const { error } = await supabase.from('student_groups').update(payload).eq('id', groupId);
  if (error) {
    console.error('[groups] updateGroupConfig failed:', error.message);
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

/** Sprint 1: capacity info for a group (enrolled vs. limit; null limit = unlimited). */
export async function getGroupCapacityInfo(
  groupId: string
): Promise<{ enrolled: number; capacity: number | null; full: boolean }> {
  const [{ data: group }, { count }] = await Promise.all([
    supabase.from('student_groups').select('capacity').eq('id', groupId).maybeSingle(),
    supabase
      .from('group_enrollments')
      .select('student_id', { count: 'exact', head: true })
      .eq('group_id', groupId),
  ]);

  const capacity = (group?.capacity as number | null) ?? null;
  const enrolled = count ?? 0;
  return { enrolled, capacity, full: capacity !== null && enrolled >= capacity };
}

export function filterCategoriesForHifz<T extends { is_hifz?: boolean }>(
  categories: T[],
  inHifzGroup: boolean
): T[] {
  if (inHifzGroup) return categories;
  return categories.filter((c) => !(c.is_hifz ?? false));
}
