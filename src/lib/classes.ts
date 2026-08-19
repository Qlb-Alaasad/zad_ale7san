import { supabase } from './supabase';
import type { ClassAssignmentRole, Profile, StudentGroup } from './types';

/** classes view / student_groups table row */
export type AcademyClass = StudentGroup;

export type ClassWithTeachers = AcademyClass & {
  teachers?: Pick<Profile, 'id' | 'full_name'>[];
};

/** Sprint 1: teacher row with assignment role. */
export interface ClassTeacherDetail {
  teacher_id: string;
  full_name: string;
  assignment_role: ClassAssignmentRole;
}

export const CLASS_ASSIGNMENT_ROLE_LABELS: Record<ClassAssignmentRole, string> = {
  primary: 'معلّم أساسي',
  assistant: 'معلّم مساعد',
  substitute: 'معلّم بديل',
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

/** Sprint 1: classes where the teacher is attached, with their role per class. */
export async function getTeacherClassesWithRoles(
  teacherId: string
): Promise<{ classInfo: AcademyClass; role: ClassAssignmentRole }[]> {
  const { data, error } = await supabase
    .from('class_teachers')
    .select('class_id, assignment_role, student_groups(*)')
    .eq('teacher_id', teacherId);

  if (error) {
    console.error('[classes] getTeacherClassesWithRoles failed:', error.message);
    return [];
  }

  return (data || [])
    .map((row: {
      assignment_role: ClassAssignmentRole;
      student_groups: AcademyClass | AcademyClass[] | null;
    }) => {
      const g = Array.isArray(row.student_groups) ? row.student_groups[0] : row.student_groups;
      return g ? { classInfo: g, role: row.assignment_role ?? 'assistant' } : null;
    })
    .filter(Boolean) as { classInfo: AcademyClass; role: ClassAssignmentRole }[];
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

/**
 * Replace a class's teacher list (legacy behavior — assigns every teacher as
 * 'assistant'). Prefer assignTeacherToClass() for role-aware assignment.
 */
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

/** Sprint 1: attach a teacher to a class with an explicit role. */
export async function assignTeacherToClass(
  classId: string,
  teacherId: string,
  role: ClassAssignmentRole = 'assistant'
): Promise<boolean> {
  const { error } = await supabase
    .from('class_teachers')
    .upsert(
      { class_id: classId, teacher_id: teacherId, assignment_role: role },
      { onConflict: 'class_id,teacher_id' }
    );
  if (error) {
    console.error('[classes] assignTeacherToClass failed:', error.message);
    return false;
  }
  return true;
}

/** Sprint 1: detach a teacher from a class. */
export async function removeTeacherFromClass(classId: string, teacherId: string): Promise<boolean> {
  const { error } = await supabase
    .from('class_teachers')
    .delete()
    .eq('class_id', classId)
    .eq('teacher_id', teacherId);
  if (error) {
    console.error('[classes] removeTeacherFromClass failed:', error.message);
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

/** Sprint 1: teachers of a class with their assignment roles. */
export async function getClassTeachersDetailed(classId: string): Promise<ClassTeacherDetail[]> {
  const { data, error } = await supabase
    .from('class_teachers')
    .select('teacher_id, assignment_role, profiles:teacher_id(full_name)')
    .eq('class_id', classId);

  if (error) {
    console.error('[classes] getClassTeachersDetailed failed:', error.message);
    return [];
  }

  return (data || [])
    .map((row: {
      teacher_id: string;
      assignment_role: ClassAssignmentRole;
      profiles: { full_name: string } | { full_name: string }[] | null;
    }) => {
      const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      if (!p) return null;
      return {
        teacher_id: row.teacher_id,
        full_name: p.full_name,
        assignment_role: row.assignment_role ?? 'assistant',
      };
    })
    .filter(Boolean) as ClassTeacherDetail[];
}

/** Sprint 1: the calling teacher's role in a given class (null if not attached). */
export async function getMyClassRole(classId: string, teacherId: string): Promise<ClassAssignmentRole | null> {
  const { data, error } = await supabase
    .from('class_teachers')
    .select('assignment_role')
    .eq('class_id', classId)
    .eq('teacher_id', teacherId)
    .maybeSingle();

  if (error) {
    console.error('[classes] getMyClassRole failed:', error.message);
    return null;
  }
  return (data?.assignment_role as ClassAssignmentRole | undefined) ?? null;
}

/** Bulk assign task/dues targets: all approved students in class. */
export async function getBulkTargetsForClass(classId: string): Promise<Profile[]> {
  return getClassStudents(classId);
}
