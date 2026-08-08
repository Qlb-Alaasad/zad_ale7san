/*
# Zad Al-Ihsan Academy Schema — Tables

Creates all tables with RLS policies. Admin access is granted via a second migration
that installs the is_admin() SECURITY DEFINER function and replaces the restrictive policies.
*/

-- ============ PROFILES ============
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  age int,
  parent_phone text,
  role text NOT NULL DEFAULT 'student' CHECK (role IN ('admin','student')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  quran_progress int NOT NULL DEFAULT 0 CHECK (quran_progress >= 0 AND quran_progress <= 100),
  current_module text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;
CREATE POLICY "profiles_delete" ON public.profiles FOR DELETE
  TO authenticated USING (auth.uid() = id);

-- ============ COURSES ============
CREATE TABLE IF NOT EXISTS public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text DEFAULT '',
  schedule text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "courses_select" ON public.courses;
CREATE POLICY "courses_select" ON public.courses FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "courses_insert" ON public.courses;
CREATE POLICY "courses_insert" ON public.courses FOR INSERT
  TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "courses_update" ON public.courses;
CREATE POLICY "courses_update" ON public.courses FOR UPDATE
  TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "courses_delete" ON public.courses;
CREATE POLICY "courses_delete" ON public.courses FOR DELETE
  TO authenticated USING (false);

-- ============ STUDENT_COURSES ============
CREATE TABLE IF NOT EXISTS public.student_courses (
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, course_id)
);

ALTER TABLE public.student_courses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "student_courses_select" ON public.student_courses;
CREATE POLICY "student_courses_select" ON public.student_courses FOR SELECT
  TO authenticated USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "student_courses_insert" ON public.student_courses;
CREATE POLICY "student_courses_insert" ON public.student_courses FOR INSERT
  TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "student_courses_update" ON public.student_courses;
CREATE POLICY "student_courses_update" ON public.student_courses FOR UPDATE
  TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "student_courses_delete" ON public.student_courses;
CREATE POLICY "student_courses_delete" ON public.student_courses FOR DELETE
  TO authenticated USING (false);

-- ============ CATEGORIES ============
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  max_points int NOT NULL DEFAULT 25 CHECK (max_points > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "categories_select" ON public.categories;
CREATE POLICY "categories_select" ON public.categories FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "categories_insert" ON public.categories;
CREATE POLICY "categories_insert" ON public.categories FOR INSERT
  TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "categories_update" ON public.categories;
CREATE POLICY "categories_update" ON public.categories FOR UPDATE
  TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "categories_delete" ON public.categories;
CREATE POLICY "categories_delete" ON public.categories FOR DELETE
  TO authenticated USING (false);

-- ============ EVALUATIONS ============
CREATE TABLE IF NOT EXISTS public.evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  week_number int NOT NULL DEFAULT EXTRACT(WEEK FROM now())::int,
  year int NOT NULL DEFAULT EXTRACT(YEAR FROM now())::int,
  points_deducted int NOT NULL DEFAULT 0 CHECK (points_deducted >= 0 AND points_deducted <= 25),
  note text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, category_id, week_number, year)
);

ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "evaluations_select" ON public.evaluations;
CREATE POLICY "evaluations_select" ON public.evaluations FOR SELECT
  TO authenticated USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "evaluations_insert" ON public.evaluations;
CREATE POLICY "evaluations_insert" ON public.evaluations FOR INSERT
  TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "evaluations_update" ON public.evaluations;
CREATE POLICY "evaluations_update" ON public.evaluations FOR UPDATE
  TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "evaluations_delete" ON public.evaluations;
CREATE POLICY "evaluations_delete" ON public.evaluations FOR DELETE
  TO authenticated USING (false);

-- ============ SESSIONS ============
CREATE TABLE IF NOT EXISTS public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text DEFAULT '',
  session_type text NOT NULL DEFAULT 'class' CHECK (session_type IN ('class','match','event')),
  location text DEFAULT '',
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sessions_select" ON public.sessions;
CREATE POLICY "sessions_select" ON public.sessions FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "sessions_insert" ON public.sessions;
CREATE POLICY "sessions_insert" ON public.sessions FOR INSERT
  TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "sessions_update" ON public.sessions;
CREATE POLICY "sessions_update" ON public.sessions FOR UPDATE
  TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "sessions_delete" ON public.sessions;
CREATE POLICY "sessions_delete" ON public.sessions FOR DELETE
  TO authenticated USING (false);

-- ============ ATTENDANCE ============
CREATE TABLE IF NOT EXISTS public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'absent' CHECK (status IN ('present','late','absent')),
  points_deducted int NOT NULL DEFAULT 0,
  timestamp timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, session_id)
);

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "attendance_select" ON public.attendance;
CREATE POLICY "attendance_select" ON public.attendance FOR SELECT
  TO authenticated USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "attendance_insert" ON public.attendance;
CREATE POLICY "attendance_insert" ON public.attendance FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "attendance_update" ON public.attendance;
CREATE POLICY "attendance_update" ON public.attendance FOR UPDATE
  TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "attendance_delete" ON public.attendance;
CREATE POLICY "attendance_delete" ON public.attendance FOR DELETE
  TO authenticated USING (false);

-- ============ FINANCIAL_DUES ============
CREATE TABLE IF NOT EXISTS public.financial_dues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  description text NOT NULL,
  amount numeric(10,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','paid')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.financial_dues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "financial_dues_select" ON public.financial_dues;
CREATE POLICY "financial_dues_select" ON public.financial_dues FOR SELECT
  TO authenticated USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "financial_dues_insert" ON public.financial_dues;
CREATE POLICY "financial_dues_insert" ON public.financial_dues FOR INSERT
  TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "financial_dues_update" ON public.financial_dues;
CREATE POLICY "financial_dues_update" ON public.financial_dues FOR UPDATE
  TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "financial_dues_delete" ON public.financial_dues;
CREATE POLICY "financial_dues_delete" ON public.financial_dues FOR DELETE
  TO authenticated USING (false);

-- ============ TASKS ============
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text DEFAULT '',
  due_date date,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tasks_select" ON public.tasks;
CREATE POLICY "tasks_select" ON public.tasks FOR SELECT
  TO authenticated USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "tasks_insert" ON public.tasks;
CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT
  TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "tasks_update" ON public.tasks;
CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE
  TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "tasks_delete" ON public.tasks;
CREATE POLICY "tasks_delete" ON public.tasks FOR DELETE
  TO authenticated USING (false);

-- ============ NOTIFICATIONS ============
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text DEFAULT '',
  type text NOT NULL DEFAULT 'general' CHECK (type IN ('general','note','schedule','financial','attendance')),
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
CREATE POLICY "notifications_select" ON public.notifications FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
CREATE POLICY "notifications_insert" ON public.notifications FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
CREATE POLICY "notifications_update" ON public.notifications FOR UPDATE
  TO authenticated USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_delete" ON public.notifications;
CREATE POLICY "notifications_delete" ON public.notifications FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============ QR_TOKENS ============
CREATE TABLE IF NOT EXISTS public.qr_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.qr_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "qr_tokens_select" ON public.qr_tokens;
CREATE POLICY "qr_tokens_select" ON public.qr_tokens FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "qr_tokens_insert" ON public.qr_tokens;
CREATE POLICY "qr_tokens_insert" ON public.qr_tokens FOR INSERT
  TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "qr_tokens_update" ON public.qr_tokens;
CREATE POLICY "qr_tokens_update" ON public.qr_tokens FOR UPDATE
  TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "qr_tokens_delete" ON public.qr_tokens;
CREATE POLICY "qr_tokens_delete" ON public.qr_tokens FOR DELETE
  TO authenticated USING (false);

-- ============ INDEXES ============
CREATE INDEX IF NOT EXISTS idx_evaluations_student ON public.evaluations(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON public.attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_session ON public.attendance(session_id);
CREATE INDEX IF NOT EXISTS idx_financial_dues_student ON public.financial_dues(student_id);
CREATE INDEX IF NOT EXISTS idx_tasks_student ON public.tasks(student_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_qr_tokens_session ON public.qr_tokens(session_id);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);
CREATE INDEX IF NOT EXISTS idx_sessions_time ON public.sessions(start_time);
