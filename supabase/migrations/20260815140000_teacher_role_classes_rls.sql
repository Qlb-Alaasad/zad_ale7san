/*
# Teacher Role, Class Teachers & Scoped RLS

1. Adds `teacher` role to profiles
2. class_teachers — links instructors to classes (student_groups)
3. SQL views: classes, class_students (aliases for student_groups / group_enrollments)
4. Helper functions: is_teacher(), teacher_can_access_student(), teacher_can_access_class()
5. RLS — teachers scoped to students in assigned classes only
6. Trigger — block non-admin role/status escalation on profiles
7. Performance indexes on class_id, teacher_id, student_id
*/

-- ============ TEACHER ROLE ============
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'teacher', 'student'));

-- ============ CLASS TEACHERS (student_groups = classes) ============
CREATE TABLE IF NOT EXISTS public.class_teachers (
  class_id uuid NOT NULL REFERENCES public.student_groups(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, teacher_id)
);

ALTER TABLE public.class_teachers ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_class_teachers_teacher ON public.class_teachers(teacher_id);
CREATE INDEX IF NOT EXISTS idx_class_teachers_class ON public.class_teachers(class_id);
CREATE INDEX IF NOT EXISTS idx_group_enrollments_class_student ON public.group_enrollments(group_id, student_id);

-- Readable aliases (classes = student_groups)
CREATE OR REPLACE VIEW public.classes AS
  SELECT id, name, description, is_hifz, created_at FROM public.student_groups;

CREATE OR REPLACE VIEW public.class_students AS
  SELECT group_id AS class_id, student_id, enrolled_at FROM public.group_enrollments;

-- ============ HELPER FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.is_teacher()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'teacher' AND status = 'approved'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_admin() OR public.is_teacher();
$$;

CREATE OR REPLACE FUNCTION public.teacher_can_access_class(p_class_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_admin() OR (
    public.is_teacher() AND EXISTS (
      SELECT 1 FROM public.class_teachers ct
      WHERE ct.class_id = p_class_id AND ct.teacher_id = auth.uid()
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.teacher_can_access_student(p_student_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_admin()
    OR auth.uid() = p_student_id
    OR (
      public.is_teacher() AND EXISTS (
        SELECT 1
        FROM public.group_enrollments ge
        INNER JOIN public.class_teachers ct ON ct.class_id = ge.group_id
        WHERE ge.student_id = p_student_id AND ct.teacher_id = auth.uid()
      )
    );
$$;

-- ============ PRIVILEGE ESCALATION GUARD ============
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Unauthorized role change';
  END IF;

  IF auth.uid() = OLD.id AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Unauthorized status change';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- ============ CLASS_TEACHERS RLS ============
DROP POLICY IF EXISTS "class_teachers_select" ON public.class_teachers;
CREATE POLICY "class_teachers_select" ON public.class_teachers FOR SELECT
  TO authenticated USING (
    public.is_admin()
    OR teacher_id = auth.uid()
    OR public.teacher_can_access_class(class_id)
  );

DROP POLICY IF EXISTS "class_teachers_insert" ON public.class_teachers;
CREATE POLICY "class_teachers_insert" ON public.class_teachers FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "class_teachers_update" ON public.class_teachers;
CREATE POLICY "class_teachers_update" ON public.class_teachers FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "class_teachers_delete" ON public.class_teachers;
CREATE POLICY "class_teachers_delete" ON public.class_teachers FOR DELETE
  TO authenticated USING (public.is_admin());

-- ============ PROFILES (teacher read scoped students) ============
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT
  TO authenticated USING (
    auth.uid() = id
    OR public.is_admin()
    OR (public.is_teacher() AND role = 'student' AND public.teacher_can_access_student(id))
  );

-- ============ STUDENT_GROUPS / CLASSES (teacher sees assigned) ============
DROP POLICY IF EXISTS "student_groups_select" ON public.student_groups;
CREATE POLICY "student_groups_select" ON public.student_groups FOR SELECT
  TO authenticated USING (
    true
    AND (
      public.is_admin()
      OR NOT public.is_teacher()
      OR public.teacher_can_access_class(id)
    )
  );

DROP POLICY IF EXISTS "group_enrollments_select" ON public.group_enrollments;
CREATE POLICY "group_enrollments_select" ON public.group_enrollments FOR SELECT
  TO authenticated USING (
    auth.uid() = student_id
    OR public.is_admin()
    OR public.teacher_can_access_class(group_id)
  );

-- ============ TASKS (teacher scoped CRUD) ============
DROP POLICY IF EXISTS "tasks_teacher_select" ON public.tasks;
CREATE POLICY "tasks_teacher_select" ON public.tasks FOR SELECT
  TO authenticated USING (public.is_teacher() AND public.teacher_can_access_student(student_id));

DROP POLICY IF EXISTS "tasks_teacher_insert" ON public.tasks;
CREATE POLICY "tasks_teacher_insert" ON public.tasks FOR INSERT
  TO authenticated WITH CHECK (public.is_teacher() AND public.teacher_can_access_student(student_id));

DROP POLICY IF EXISTS "tasks_teacher_update" ON public.tasks;
CREATE POLICY "tasks_teacher_update" ON public.tasks FOR UPDATE
  TO authenticated USING (public.is_teacher() AND public.teacher_can_access_student(student_id))
  WITH CHECK (public.is_teacher() AND public.teacher_can_access_student(student_id));

DROP POLICY IF EXISTS "tasks_teacher_delete" ON public.tasks;
CREATE POLICY "tasks_teacher_delete" ON public.tasks FOR DELETE
  TO authenticated USING (public.is_teacher() AND public.teacher_can_access_student(student_id));

-- ============ FINANCIAL_DUES (teacher scoped) ============
DROP POLICY IF EXISTS "financial_dues_teacher_select" ON public.financial_dues;
CREATE POLICY "financial_dues_teacher_select" ON public.financial_dues FOR SELECT
  TO authenticated USING (public.is_teacher() AND public.teacher_can_access_student(student_id));

DROP POLICY IF EXISTS "financial_dues_teacher_insert" ON public.financial_dues;
CREATE POLICY "financial_dues_teacher_insert" ON public.financial_dues FOR INSERT
  TO authenticated WITH CHECK (public.is_teacher() AND public.teacher_can_access_student(student_id));

DROP POLICY IF EXISTS "financial_dues_teacher_update" ON public.financial_dues;
CREATE POLICY "financial_dues_teacher_update" ON public.financial_dues FOR UPDATE
  TO authenticated USING (public.is_teacher() AND public.teacher_can_access_student(student_id))
  WITH CHECK (public.is_teacher() AND public.teacher_can_access_student(student_id));

DROP POLICY IF EXISTS "financial_dues_teacher_delete" ON public.financial_dues;
CREATE POLICY "financial_dues_teacher_delete" ON public.financial_dues FOR DELETE
  TO authenticated USING (public.is_teacher() AND public.teacher_can_access_student(student_id));

-- ============ FINANCIAL_PAYMENTS (teacher scoped insert/read) ============
DROP POLICY IF EXISTS "financial_payments_teacher_select" ON public.financial_payments;
CREATE POLICY "financial_payments_teacher_select" ON public.financial_payments FOR SELECT
  TO authenticated USING (public.is_teacher() AND public.teacher_can_access_student(student_id));

DROP POLICY IF EXISTS "financial_payments_teacher_insert" ON public.financial_payments;
CREATE POLICY "financial_payments_teacher_insert" ON public.financial_payments FOR INSERT
  TO authenticated WITH CHECK (public.is_teacher() AND public.teacher_can_access_student(student_id));

DROP POLICY IF EXISTS "financial_payments_teacher_update" ON public.financial_payments;
CREATE POLICY "financial_payments_teacher_update" ON public.financial_payments FOR UPDATE
  TO authenticated USING (public.is_teacher() AND public.teacher_can_access_student(student_id))
  WITH CHECK (public.is_teacher() AND public.teacher_can_access_student(student_id));

-- ============ STUDENT_NOTES (teacher scoped) ============
DROP POLICY IF EXISTS "student_notes_teacher_select" ON public.student_notes;
CREATE POLICY "student_notes_teacher_select" ON public.student_notes FOR SELECT
  TO authenticated USING (public.is_teacher() AND public.teacher_can_access_student(student_id));

DROP POLICY IF EXISTS "student_notes_teacher_insert" ON public.student_notes;
CREATE POLICY "student_notes_teacher_insert" ON public.student_notes FOR INSERT
  TO authenticated WITH CHECK (public.is_teacher() AND public.teacher_can_access_student(student_id));

DROP POLICY IF EXISTS "student_notes_teacher_update" ON public.student_notes;
CREATE POLICY "student_notes_teacher_update" ON public.student_notes FOR UPDATE
  TO authenticated USING (public.is_teacher() AND public.teacher_can_access_student(student_id))
  WITH CHECK (public.is_teacher() AND public.teacher_can_access_student(student_id));

DROP POLICY IF EXISTS "student_notes_teacher_delete" ON public.student_notes;
CREATE POLICY "student_notes_teacher_delete" ON public.student_notes FOR DELETE
  TO authenticated USING (public.is_teacher() AND public.teacher_can_access_student(student_id));

-- ============ ATTENDANCE (teacher scoped) ============
DROP POLICY IF EXISTS "attendance_teacher_select" ON public.attendance;
CREATE POLICY "attendance_teacher_select" ON public.attendance FOR SELECT
  TO authenticated USING (public.is_teacher() AND public.teacher_can_access_student(student_id));

DROP POLICY IF EXISTS "attendance_teacher_insert" ON public.attendance;
CREATE POLICY "attendance_teacher_insert" ON public.attendance FOR INSERT
  TO authenticated WITH CHECK (public.is_teacher() AND public.teacher_can_access_student(student_id));

DROP POLICY IF EXISTS "attendance_teacher_update" ON public.attendance;
CREATE POLICY "attendance_teacher_update" ON public.attendance FOR UPDATE
  TO authenticated USING (public.is_teacher() AND public.teacher_can_access_student(student_id))
  WITH CHECK (public.is_teacher() AND public.teacher_can_access_student(student_id));

-- ============ TASK UPDATE TRIGGER — allow teacher metadata edits ============
CREATE OR REPLACE FUNCTION public.enforce_student_task_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() OR public.is_teacher() THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM OLD.student_id THEN
    RAISE EXCEPTION 'Unauthorized task update';
  END IF;

  NEW.student_id := OLD.student_id;
  NEW.title := OLD.title;
  NEW.description := OLD.description;
  NEW.due_date := OLD.due_date;
  NEW.category_id := OLD.category_id;
  NEW.created_at := OLD.created_at;

  IF NEW.status IS NOT NULL AND NEW.status NOT IN ('assigned', 'in_progress', 'submitted', 'completed') THEN
    RAISE EXCEPTION 'Invalid task status';
  END IF;

  RETURN NEW;
END;
$$;
