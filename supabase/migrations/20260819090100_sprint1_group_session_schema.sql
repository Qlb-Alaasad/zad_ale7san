/*
# Sprint 1 — Group Configuration & Group-Centric Sessions Schema

## Changes

### 1. Group configuration (إعدادات الشعب)
- `student_groups.capacity` — max students (NULL = unlimited).
- `student_groups.schedule_days` — integer[] of JS weekdays (0=Sun … 6=Sat).
- `student_groups.schedule_start_time` / `schedule_end_time` (time).
- `student_groups.location`, `is_online`, `meeting_url`.
- `student_groups.primary_teacher_id` — the group's default primary teacher.

### 2. Teacher assignment roles
- `class_teachers.assignment_role` ('primary' | 'assistant' | 'substitute').
  `primary_teacher_id` on the group is the canonical primary; class_teachers
  rows cover assistants and named substitutes.

### 3. Group-centric sessions + per-session substitute override
- `sessions.group_id` — sessions can now belong to a class circle.
- `sessions.substitute_teacher_id` — override the teacher for ONE session
  without changing the group's default primary teacher.
- `sessions.scheduled_date` — calendar date for generated/planned sessions.
- Sessions RLS rebuilt: teachers can create/manage sessions for their own
  classes; substitutes can manage sessions assigned to them.

### 4. Per-session quick evaluations (daily → weekly rollup)
- `session_scores` — per student per session: attendance/recitation/behavior
  (0–5 each) + note. UNIQUE(session_id, student_id).
- `get_student_session_rollup(student, week_start, week_end)` RPC aggregates
  session scores into weekly averages to feed the Friday evaluation.

### 5. Session generation
- `generate_group_sessions(group_id, week_start)` RPC materializes session
  rows from the group's recurring schedule for an academy week
  (week_start = Friday). Idempotent — skips dates that already exist.
*/

-- =============================================================================
-- 1. GROUP CONFIGURATION COLUMNS
-- =============================================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='student_groups' AND column_name='capacity') THEN
    ALTER TABLE public.student_groups ADD COLUMN capacity integer CHECK (capacity IS NULL OR capacity > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='student_groups' AND column_name='schedule_days') THEN
    ALTER TABLE public.student_groups ADD COLUMN schedule_days integer[];
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='student_groups' AND column_name='schedule_start_time') THEN
    ALTER TABLE public.student_groups ADD COLUMN schedule_start_time time;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='student_groups' AND column_name='schedule_end_time') THEN
    ALTER TABLE public.student_groups ADD COLUMN schedule_end_time time;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='student_groups' AND column_name='location') THEN
    ALTER TABLE public.student_groups ADD COLUMN location text NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='student_groups' AND column_name='is_online') THEN
    ALTER TABLE public.student_groups ADD COLUMN is_online boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='student_groups' AND column_name='meeting_url') THEN
    ALTER TABLE public.student_groups ADD COLUMN meeting_url text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='student_groups' AND column_name='primary_teacher_id') THEN
    ALTER TABLE public.student_groups ADD COLUMN primary_teacher_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- =============================================================================
-- 2. CLASS_TEACHERS ASSIGNMENT ROLES
-- =============================================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='class_teachers' AND column_name='assignment_role') THEN
    ALTER TABLE public.class_teachers
      ADD COLUMN assignment_role text NOT NULL DEFAULT 'assistant'
      CHECK (assignment_role IN ('primary', 'assistant', 'substitute'));
  END IF;
END $$;

-- =============================================================================
-- 3. SESSIONS ↔ GROUPS + SUBSTITUTE OVERRIDE
-- =============================================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sessions' AND column_name='group_id') THEN
    ALTER TABLE public.sessions ADD COLUMN group_id uuid REFERENCES public.student_groups(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sessions' AND column_name='substitute_teacher_id') THEN
    ALTER TABLE public.sessions ADD COLUMN substitute_teacher_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sessions' AND column_name='scheduled_date') THEN
    ALTER TABLE public.sessions ADD COLUMN scheduled_date date;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sessions_group ON public.sessions(group_id);
CREATE INDEX IF NOT EXISTS idx_sessions_scheduled_date ON public.sessions(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_sessions_substitute ON public.sessions(substitute_teacher_id);

-- Who may manage a session row.
CREATE OR REPLACE FUNCTION public.teacher_can_manage_session(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = p_session_id
        AND (
          (s.group_id IS NOT NULL AND public.teacher_can_access_class(s.group_id))
          OR s.substitute_teacher_id = auth.uid()
        )
    );
$$;

-- Sessions write policies rebuilt (drop whatever exists, recreate).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname, cmd FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'sessions'
             AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.sessions', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "sessions_staff_insert" ON public.sessions FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      public.is_teacher()
      AND group_id IS NOT NULL
      AND public.teacher_can_access_class(group_id)
    )
  );

CREATE POLICY "sessions_staff_update" ON public.sessions FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR (public.is_teacher() AND group_id IS NOT NULL AND public.teacher_can_access_class(group_id))
    OR (public.is_teacher() AND substitute_teacher_id = auth.uid())
  )
  WITH CHECK (
    public.is_admin()
    OR (public.is_teacher() AND group_id IS NOT NULL AND public.teacher_can_access_class(group_id))
    OR (public.is_teacher() AND substitute_teacher_id = auth.uid())
  );

CREATE POLICY "sessions_admin_delete" ON public.sessions FOR DELETE
  TO authenticated USING (public.is_admin());

-- =============================================================================
-- 4. SESSION_SCORES (per-session quick evaluation)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.session_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  teacher_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  attendance_score smallint CHECK (attendance_score BETWEEN 0 AND 5),
  recitation_score smallint CHECK (recitation_score BETWEEN 0 AND 5),
  behavior_score   smallint CHECK (behavior_score BETWEEN 0 AND 5),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, student_id)
);

ALTER TABLE public.session_scores ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_session_scores_session ON public.session_scores(session_id);
CREATE INDEX IF NOT EXISTS idx_session_scores_student ON public.session_scores(student_id);

CREATE POLICY "session_scores_student_select" ON public.session_scores FOR SELECT
  TO authenticated USING (auth.uid() = student_id);

CREATE POLICY "session_scores_staff_select" ON public.session_scores FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR (public.is_teacher() AND public.teacher_can_access_student(student_id))
    OR (public.is_teacher() AND public.teacher_can_manage_session(session_id))
  );

CREATE POLICY "session_scores_staff_insert" ON public.session_scores FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (public.is_teacher() AND public.teacher_can_access_student(student_id))
  );

CREATE POLICY "session_scores_staff_update" ON public.session_scores FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR (public.is_teacher() AND public.teacher_can_access_student(student_id))
  )
  WITH CHECK (
    public.is_admin()
    OR (public.is_teacher() AND public.teacher_can_access_student(student_id))
  );

CREATE POLICY "session_scores_admin_delete" ON public.session_scores FOR DELETE
  TO authenticated USING (public.is_admin());

-- Auto-stamp teacher + updated_at on score writes.
CREATE OR REPLACE FUNCTION public.set_session_score_meta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.teacher_id IS NULL THEN
    NEW.teacher_id := auth.uid();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_session_scores_meta ON public.session_scores;
CREATE TRIGGER trg_session_scores_meta
  BEFORE INSERT OR UPDATE ON public.session_scores
  FOR EACH ROW
  EXECUTE FUNCTION public.set_session_score_meta();

-- =============================================================================
-- 5. SESSION GENERATION FROM GROUP SCHEDULE (academy week, Friday start)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.generate_group_sessions(p_group_id uuid, p_week_start date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group  public.student_groups%ROWTYPE;
  v_day    integer;
  v_date   date;
  v_count  integer := 0;
BEGIN
  IF NOT (public.is_admin() OR public.teacher_can_access_class(p_group_id)) THEN
    RAISE EXCEPTION 'Not authorized to generate sessions for this group';
  END IF;

  SELECT * INTO v_group FROM public.student_groups WHERE id = p_group_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group not found';
  END IF;

  IF v_group.schedule_days IS NULL OR array_length(v_group.schedule_days, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- p_week_start must be a Friday (academy week). JS weekday 5 = Friday.
  FOREACH v_day IN ARRAY v_group.schedule_days LOOP
    -- Offset of weekday v_day within a Friday-anchored week.
    v_date := p_week_start + ((v_day - 5 + 7) % 7);

    IF EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.group_id = p_group_id AND s.scheduled_date = v_date
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.sessions (
      group_id, title, description, session_type, location,
      scheduled_date, start_time, end_time, is_active
    ) VALUES (
      p_group_id,
      v_group.name || ' — ' || to_char(v_date, 'YYYY-MM-DD'),
      '', 'class',
      CASE WHEN v_group.is_online THEN coalesce(v_group.meeting_url, '') ELSE v_group.location END,
      v_date,
      CASE WHEN v_group.schedule_start_time IS NOT NULL
           THEN ((v_date::text || ' ' || v_group.schedule_start_time)::timestamp AT TIME ZONE 'Asia/Riyadh')
           ELSE NULL END,
      CASE WHEN v_group.schedule_end_time IS NOT NULL
           THEN ((v_date::text || ' ' || v_group.schedule_end_time)::timestamp AT TIME ZONE 'Asia/Riyadh')
           ELSE NULL END,
      false
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- =============================================================================
-- 6. WEEKLY ROLLUP OF SESSION SCORES
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_student_session_rollup(
  p_student_id uuid,
  p_week_start date,
  p_week_end date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT (
    auth.uid() = p_student_id
    OR public.is_admin()
    OR (public.is_teacher() AND public.teacher_can_access_student(p_student_id))
  ) THEN
    RAISE EXCEPTION 'Not authorized to view this rollup';
  END IF;

  SELECT jsonb_build_object(
    'sessions_count',  count(*),
    'avg_attendance',  coalesce(round(avg(ss.attendance_score)::numeric, 2), 0),
    'avg_recitation',  coalesce(round(avg(ss.recitation_score)::numeric, 2), 0),
    'avg_behavior',    coalesce(round(avg(ss.behavior_score)::numeric, 2), 0),
    'avg_overall',     coalesce(round(avg(
                         (coalesce(ss.attendance_score, 0)
                        + coalesce(ss.recitation_score, 0)
                        + coalesce(ss.behavior_score, 0)) / 3.0)::numeric, 2), 0)
  )
  INTO v_result
  FROM public.session_scores ss
  JOIN public.sessions s ON s.id = ss.session_id
  WHERE ss.student_id = p_student_id
    AND s.scheduled_date BETWEEN p_week_start AND p_week_end;

  RETURN coalesce(v_result, jsonb_build_object(
    'sessions_count', 0, 'avg_attendance', 0, 'avg_recitation', 0, 'avg_behavior', 0, 'avg_overall', 0
  ));
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_group_sessions(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_session_rollup(uuid, date, date) TO authenticated;
