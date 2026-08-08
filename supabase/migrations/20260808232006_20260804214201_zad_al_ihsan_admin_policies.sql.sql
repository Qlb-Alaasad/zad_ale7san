/*
# Zad Al-Ihsan Academy — Admin Policies & Triggers

## Changes
1. Creates is_admin() SECURITY DEFINER helper that checks profiles table for role=admin, status=approved.
2. Replaces all restrictive RLS policies with admin-aware versions: admin gets full CRUD, students get own-row access only.
3. Creates a trigger that auto-inserts a profile row when a new auth.user is created (status=pending, role=student).

## Security
- is_admin() is SECURITY DEFINER so it can read profiles regardless of caller RLS context.
- All admin write policies check public.is_admin() in both USING and WITH CHECK.
- Students retain read access to their own rows and to shared reference data (courses, categories, sessions, qr_tokens).
*/

-- ============ HELPER FUNCTION ============
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin' AND status = 'approved'
  );
$$;

-- ============ PROFILES (admin-aware) ============
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT
  TO authenticated USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id OR public.is_admin())
  WITH CHECK (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;
CREATE POLICY "profiles_delete" ON public.profiles FOR DELETE
  TO authenticated USING (public.is_admin());

-- ============ COURSES (admin-aware) ============
DROP POLICY IF EXISTS "courses_insert" ON public.courses;
CREATE POLICY "courses_insert" ON public.courses FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "courses_update" ON public.courses;
CREATE POLICY "courses_update" ON public.courses FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "courses_delete" ON public.courses;
CREATE POLICY "courses_delete" ON public.courses FOR DELETE
  TO authenticated USING (public.is_admin());

-- ============ STUDENT_COURSES (admin-aware) ============
DROP POLICY IF EXISTS "student_courses_select" ON public.student_courses;
CREATE POLICY "student_courses_select" ON public.student_courses FOR SELECT
  TO authenticated USING (auth.uid() = student_id OR public.is_admin());

DROP POLICY IF EXISTS "student_courses_insert" ON public.student_courses;
CREATE POLICY "student_courses_insert" ON public.student_courses FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "student_courses_update" ON public.student_courses;
CREATE POLICY "student_courses_update" ON public.student_courses FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "student_courses_delete" ON public.student_courses;
CREATE POLICY "student_courses_delete" ON public.student_courses FOR DELETE
  TO authenticated USING (public.is_admin());

-- ============ CATEGORIES (admin-aware) ============
DROP POLICY IF EXISTS "categories_insert" ON public.categories;
CREATE POLICY "categories_insert" ON public.categories FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "categories_update" ON public.categories;
CREATE POLICY "categories_update" ON public.categories FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "categories_delete" ON public.categories;
CREATE POLICY "categories_delete" ON public.categories FOR DELETE
  TO authenticated USING (public.is_admin());

-- ============ EVALUATIONS (admin-aware) ============
DROP POLICY IF EXISTS "evaluations_select" ON public.evaluations;
CREATE POLICY "evaluations_select" ON public.evaluations FOR SELECT
  TO authenticated USING (auth.uid() = student_id OR public.is_admin());

DROP POLICY IF EXISTS "evaluations_insert" ON public.evaluations;
CREATE POLICY "evaluations_insert" ON public.evaluations FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "evaluations_update" ON public.evaluations;
CREATE POLICY "evaluations_update" ON public.evaluations FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "evaluations_delete" ON public.evaluations;
CREATE POLICY "evaluations_delete" ON public.evaluations FOR DELETE
  TO authenticated USING (public.is_admin());

-- ============ SESSIONS (admin-aware) ============
DROP POLICY IF EXISTS "sessions_insert" ON public.sessions;
CREATE POLICY "sessions_insert" ON public.sessions FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "sessions_update" ON public.sessions;
CREATE POLICY "sessions_update" ON public.sessions FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "sessions_delete" ON public.sessions;
CREATE POLICY "sessions_delete" ON public.sessions FOR DELETE
  TO authenticated USING (public.is_admin());

-- ============ ATTENDANCE (admin-aware) ============
DROP POLICY IF EXISTS "attendance_select" ON public.attendance;
CREATE POLICY "attendance_select" ON public.attendance FOR SELECT
  TO authenticated USING (auth.uid() = student_id OR public.is_admin());

DROP POLICY IF EXISTS "attendance_insert" ON public.attendance;
CREATE POLICY "attendance_insert" ON public.attendance FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = student_id OR public.is_admin());

DROP POLICY IF EXISTS "attendance_update" ON public.attendance;
CREATE POLICY "attendance_update" ON public.attendance FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "attendance_delete" ON public.attendance;
CREATE POLICY "attendance_delete" ON public.attendance FOR DELETE
  TO authenticated USING (public.is_admin());

-- ============ FINANCIAL_DUES (admin-aware) ============
DROP POLICY IF EXISTS "financial_dues_select" ON public.financial_dues;
CREATE POLICY "financial_dues_select" ON public.financial_dues FOR SELECT
  TO authenticated USING (auth.uid() = student_id OR public.is_admin());

DROP POLICY IF EXISTS "financial_dues_insert" ON public.financial_dues;
CREATE POLICY "financial_dues_insert" ON public.financial_dues FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "financial_dues_update" ON public.financial_dues;
CREATE POLICY "financial_dues_update" ON public.financial_dues FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "financial_dues_delete" ON public.financial_dues;
CREATE POLICY "financial_dues_delete" ON public.financial_dues FOR DELETE
  TO authenticated USING (public.is_admin());

-- ============ TASKS (admin-aware) ============
DROP POLICY IF EXISTS "tasks_select" ON public.tasks;
CREATE POLICY "tasks_select" ON public.tasks FOR SELECT
  TO authenticated USING (auth.uid() = student_id OR public.is_admin());

DROP POLICY IF EXISTS "tasks_insert" ON public.tasks;
CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "tasks_update" ON public.tasks;
CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "tasks_delete" ON public.tasks;
CREATE POLICY "tasks_delete" ON public.tasks FOR DELETE
  TO authenticated USING (public.is_admin());

-- ============ NOTIFICATIONS (admin-aware) ============
DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
CREATE POLICY "notifications_select" ON public.notifications FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
CREATE POLICY "notifications_insert" ON public.notifications FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
CREATE POLICY "notifications_update" ON public.notifications FOR UPDATE
  TO authenticated USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "notifications_delete" ON public.notifications;
CREATE POLICY "notifications_delete" ON public.notifications FOR DELETE
  TO authenticated USING (auth.uid() = user_id OR public.is_admin());

-- ============ QR_TOKENS (admin-aware) ============
DROP POLICY IF EXISTS "qr_tokens_insert" ON public.qr_tokens;
CREATE POLICY "qr_tokens_insert" ON public.qr_tokens FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "qr_tokens_update" ON public.qr_tokens;
CREATE POLICY "qr_tokens_update" ON public.qr_tokens FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "qr_tokens_delete" ON public.qr_tokens;
CREATE POLICY "qr_tokens_delete" ON public.qr_tokens FOR DELETE
  TO authenticated USING (public.is_admin());

-- ============ TRIGGER: auto-create profile on signup ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'طالب جديد'),
    'student',
    'pending'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
