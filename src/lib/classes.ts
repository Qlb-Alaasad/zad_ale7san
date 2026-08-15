import { supabase } from './supabase';
import type { Profile, StudentGroup } from './types';

/** classes view / student_groups table row */
export type AcademyClass = StudentGroup;

export type ClassWithTeachers = AcademyClass & {
  teachers?: Pick<Profile, 'id' | 'full_name'>[];
};

/** All classes (admin) or classes table read. */
export async function getAllClasses(): Promise<AcademyClass[]> {
  const { data, error } = await supabase.from('student_groups').select('*').order('name');
  if (error) {
    console.error('[classes] getAllClasses failed:', error.message);
    return [];
  }
  return (data as AcademyClass[]) || [];
}

/** Classes assigned to a teacher (RLS filters automatically). */
export async function getTeacherClasses(teacherId: string): Promise<AcademyClass[]> {
  const { data, error } = await supabase
    .from('class_teachers')
    .select('class_id, student_groups(*)')
    .eq('teacher_id', teacherId);

  if (error) {
    console.error('[classes] getTeacherClasses failed:', error.message);
    return [];
  }

  return (data || [])
    .map((row: { student_groups: AcademyClass | AcademyClass[] | null }) => {
      const g = row.student_groups;
      return Array.isArray(g) ? g[0] : g;
    })
    .filter(Boolean) as AcademyClass[];
}

/** Student IDs enrolled in a class. */
export async function getClassStudentIds(classId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('group_enrollments')
    .select('student_id')
    .eq('group_id', classId);

  if (error) {
    console.error('[classes] getClassStudentIds failed:', error.message);
    return [];
  }

  return (data || []).map((r: { student_id: string }) => r.student_id);
}

/** All student IDs across teacher's assigned classes. */
export async function getTeacherStudentIds(teacherId: string): Promise<string[]> {
  const classes = await getTeacherClasses(teacherId);
  const ids = new Set<string>();
  for (const c of classes) {
    const students = await getClassStudentIds(c.id);
    students.forEach((id) => ids.add(id));
  }
  return [...ids];
}

/** Approved student profiles in a class. */
export async function getClassStudents(classId: string): Promise<Profile[]> {
  const studentIds = await getClassStudentIds(classId);
  if (studentIds.length === 0) return [];

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .in('id', studentIds)
    .eq('role', 'student')
    .eq('status', 'approved')
    .order('full_name');

  if (error) {
    console.error('[classes] getClassStudents failed:', error.message);
    return [];
  }

  return (data as Profile[]) || [];
}

export async function assignTeachersToClass(classId: string, teacherIds: string[]): Promise<boolean> {
  await supabase.from('class_teachers').delete().eq('class_id', classId);
  if (teacherIds.length === 0) return true;

  const rows = teacherIds.map((teacher_id) => ({ class_id: classId, teacher_id }));
  const { error } = await supabase.from('class_teachers').insert(rows);
  if (error) {
    console.error('[classes] assignTeachersToClass failed:', error.message);
    return false;
  }
  return true;
}

export async function getClassTeachers(classId: string): Promise<Pick<Profile, 'id' | 'full_name'>[]> {
  const { data, error } = await supabase
    .from('class_teachers')
    .select('teacher_id, profiles:teacher_id(id, full_name)')
    .eq('class_id', classId);

  if (error) {
    console.error('[classes] getClassTeachers failed:', error.message);
    return [];
  }

  return (data || [])
    .map((row: { profiles: Pick<Profile, 'id' | 'full_name'> | Pick<Profile, 'id' | 'full_name'>[] | null }) => {
      const p = row.profiles;
      return Array.isArray(p) ? p[0] : p;
    })
    .filter(Boolean) as Pick<Profile, 'id' | 'full_name'>[];
}

/** Bulk assign task/dues targets: all approved students in class. */
export async function getBulkTargetsForClass(classId: string): Promise<Profile[]> {
  return getClassStudents(classId);
}
