export type UserRole = 'admin' | 'teacher' | 'student';
export type UserStatus = 'pending' | 'approved' | 'rejected';
export type AttendanceStatus = 'present' | 'late' | 'absent';
export type SessionType = 'class' | 'match' | 'event';
export type DueStatus = 'unpaid' | 'paid';
export type TaskStatus = 'assigned' | 'in_progress' | 'submitted' | 'completed';
export type NotificationType = 'general' | 'note' | 'schedule' | 'financial' | 'attendance';

export interface Profile {
  id: string;
  full_name: string;
  age: number | null;
  parent_phone: string | null;
  role: UserRole;
  status: UserStatus;
  quran_progress: number;
  current_module: string;
  created_at: string;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  schedule: string;
  schedule_days: string[] | null;
  schedule_start_time: string | null;
  schedule_end_time: string | null;
  session_duration_hours: number | null;
  time_notes: string | null;
  total_sessions: number | null;
  supervisor_notes: string | null;
  created_at: string;
}

export interface StudentCourse {
  student_id: string;
  course_id: string;
  enrolled_at: string;
}

export interface StudentCategory {
  student_id: string;
  category_id: string;
  enrolled_at: string;
}

export interface Category {
  id: string;
  name: string;
  description: string;
  max_points: number;
  is_hifz?: boolean;
  created_at: string;
}

export interface Evaluation {
  id: string;
  student_id: string;
  category_id: string;
  course_id: string | null;
  week_number: number;
  year: number;
  points_deducted: number;
  note: string;
  created_at: string;
  category?: Category;
  course?: Course;
}

export interface Session {
  id: string;
  course_id: string | null;
  category_id: string | null;
  title: string;
  description: string;
  session_type: SessionType;
  location: string;
  start_time: string | null;
  end_time: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Attendance {
  id: string;
  student_id: string;
  session_id: string;
  status: AttendanceStatus;
  points_deducted: number;
  timestamp: string;
  created_at: string;
  session?: Session;
}

export interface FinancialDue {
  id: string;
  student_id: string;
  category_id: string | null;
  description: string;
  amount: number;
  status: DueStatus;
  due_date: string | null;
  notes: string;
  created_at: string;
  category?: Category;
}

export interface FinancialPayment {
  id: string;
  student_id: string;
  due_id: string | null;
  amount: number;
  payment_method: string;
  notes: string;
  recorded_by: string | null;
  created_at: string;
  due?: FinancialDue;
}

export interface Task {
  id: string;
  student_id: string;
  category_id: string | null;
  title: string;
  description: string;
  due_date: string | null;
  status: TaskStatus;
  completed: boolean;
  submission_text: string;
  submitted_at: string | null;
  updated_at: string;
  created_at: string;
  category?: Category;
  student?: Profile;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: NotificationType;
  is_read: boolean;
  created_at: string;
}

export interface QrToken {
  id: string;
  session_id: string;
  token_hash: string;
  valid_from: string;
  valid_until: string;
  created_at: string;
}

export type NoteType = 'supervisor' | 'absence' | 'general' | 'excuse' | 'custom';

export interface StudentNote {
  id: string;
  student_id: string;
  course_id: string | null;
  session_id: string | null;
  note: string;
  note_type: NoteType;
  points_impact: number;
  excused: boolean;
  created_at: string;
  course?: Course;
}

export interface AppSettings {
  id: number;
  base_points: number;
  absence_deduction: number;
  last_weekly_reset_at: string | null;
  updated_at: string;
}

export interface StudentGroup {
  id: string;
  name: string;
  description: string;
  is_hifz: boolean;
  created_at: string;
}

export interface GroupEnrollment {
  student_id: string;
  group_id: string;
  enrolled_at: string;
}

/** Alias: classes = student_groups (see class_teachers, group_enrollments) */
export type AcademyClass = StudentGroup;

export interface ClassTeacher {
  class_id: string;
  teacher_id: string;
  assigned_at: string;
}

export interface EvaluationHistoryRecord {
  id: string;
  student_id: string;
  week_number: number;
  year: number;
  week_start: string;
  week_end: string;
  evaluations: Evaluation[];
  notes: StudentNote[];
  attendance: Attendance[];
  quran_progress: number | null;
  current_module: string | null;
  archived_at: string;
}
