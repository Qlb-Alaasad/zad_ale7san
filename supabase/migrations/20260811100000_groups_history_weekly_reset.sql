/*
# Groups, evaluation history, Hifz flags, and weekly reset metadata

1. student_groups — custom classes/sections (e.g. شعبة الشيخ أحمد)
2. group_enrollments — many-to-many student ↔ group
3. student_evaluation_history — archived weekly snapshots (Friday reset)
4. categories.is_hifz — marks Quran/Hifz evaluation categories
5. settings.last_weekly_reset_at — tracks last Friday archive run
*/

-- ============ categories: Hifz flag ============
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'is_hifz'
  ) THEN
    ALTER TABLE public.categories ADD COLUMN is_hifz boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- ============ settings: last weekly reset timestamp ============
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'settings' AND column_name = 'last_weekly_reset_at'
  ) THEN
    ALTER TABLE public.settings ADD COLUMN last_weekly_reset_at timestamptz;
  END IF;
END $$;

-- ============ student_groups ============
CREATE TABLE IF NOT EXISTS public.student_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  is_hifz boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.student_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "student_groups_select" ON public.student_groups;
CREATE POLICY "student_groups_select" ON public.student_groups FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "student_groups_insert" ON public.student_groups;
CREATE POLICY "student_groups_insert" ON public.student_groups FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "student_groups_update" ON public.student_groups;
CREATE POLICY "student_groups_update" ON public.student_groups FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "student_groups_delete" ON public.student_groups;
CREATE POLICY "student_groups_delete" ON public.student_groups FOR DELETE
  TO authenticated USING (public.is_admin());

-- ============ group_enrollments ============
CREATE TABLE IF NOT EXISTS public.group_enrollments (
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.student_groups(id) ON DELETE CASCADE,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, group_id)
);

ALTER TABLE public.group_enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "group_enrollments_select" ON public.group_enrollments;
CREATE POLICY "group_enrollments_select" ON public.group_enrollments FOR SELECT
  TO authenticated USING (auth.uid() = student_id OR public.is_admin());

DROP POLICY IF EXISTS "group_enrollments_insert" ON public.group_enrollments;
CREATE POLICY "group_enrollments_insert" ON public.group_enrollments FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "group_enrollments_update" ON public.group_enrollments;
CREATE POLICY "group_enrollments_update" ON public.group_enrollments FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "group_enrollments_delete" ON public.group_enrollments;
CREATE POLICY "group_enrollments_delete" ON public.group_enrollments FOR DELETE
  TO authenticated USING (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_group_enrollments_student ON public.group_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_group_enrollments_group ON public.group_enrollments(group_id);

-- ============ student_evaluation_history ============
CREATE TABLE IF NOT EXISTS public.student_evaluation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  week_number int NOT NULL,
  year int NOT NULL,
  week_start date NOT NULL,
  week_end date NOT NULL,
  evaluations jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes jsonb NOT NULL DEFAULT '[]'::jsonb,
  attendance jsonb NOT NULL DEFAULT '[]'::jsonb,
  quran_progress int,
  current_module text,
  archived_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, week_number, year)
);

ALTER TABLE public.student_evaluation_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "eval_history_select" ON public.student_evaluation_history;
CREATE POLICY "eval_history_select" ON public.student_evaluation_history FOR SELECT
  TO authenticated USING (auth.uid() = student_id OR public.is_admin());

DROP POLICY IF EXISTS "eval_history_insert" ON public.student_evaluation_history;
CREATE POLICY "eval_history_insert" ON public.student_evaluation_history FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "eval_history_update" ON public.student_evaluation_history;
CREATE POLICY "eval_history_update" ON public.student_evaluation_history FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "eval_history_delete" ON public.student_evaluation_history;
CREATE POLICY "eval_history_delete" ON public.student_evaluation_history FOR DELETE
  TO authenticated USING (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_eval_history_student ON public.student_evaluation_history(student_id);
CREATE INDEX IF NOT EXISTS idx_eval_history_week ON public.student_evaluation_history(year, week_number);

-- Seed default Hifz group if none exists
INSERT INTO public.student_groups (name, description, is_hifz)
SELECT 'الحفظ / القرآن', 'شعبة حفظ القرآن الكريم — تفعّل تتبع الحفظ والتقييمات القرآنية', true
WHERE NOT EXISTS (SELECT 1 FROM public.student_groups WHERE is_hifz = true);
