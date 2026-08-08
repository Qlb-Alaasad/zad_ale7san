export type UserRole = 'admin' | 'student';
export type UserStatus = 'pending' | 'approved' | 'rejected';
export type AttendanceStatus = 'present' | 'late' | 'absent';
export type SessionType = 'class' | 'match' | 'event';
export type DueStatus = 'unpaid' | 'paid';
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

export interface Category {
  id: string;
  name: string;
  description: string;
  max_points: number;
  created_at: string;
}

export interface Evaluation {
  id: string;
  student_id: string;
  category_id: string;
  week_number: number;
  year: number;
  points_deducted: number;
  note: string;
  created_at: string;
  category?: Category;
}

export interface Session {
  id: string;
  course_id: string | null;
  title: string;
  description: string;
  session_type: SessionType;
  location: string;
  start_time: string;
  end_time: string;
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
  description: string;
  amount: number;
  status: DueStatus;
  created_at: string;
}

export interface Task {
  id: string;
  student_id: string;
  title: string;
  description: string;
  due_date: string | null;
  completed: boolean;
  created_at: string;
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

export type NoteType = 'supervisor' | 'absence' | 'general';

export interface StudentNote {
  id: string;
  student_id: string;
  course_id: string | null;
  session_id: string | null;
  note: string;
  note_type: NoteType;
  created_at: string;
}
