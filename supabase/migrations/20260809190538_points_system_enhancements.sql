/*
# Points System Enhancements

## Changes

### 1. student_notes — new columns
- `points_impact` (integer, default 0): positive = bonus, negative = deduction.
- `excused` (boolean, default false): when true, points_impact is treated as 0.
- `note_type` check constraint expanded to include 'excuse' and 'custom'.

### 2. evaluations — new column
- `course_id` (uuid, nullable, FK to courses): allows evaluations to be scoped per course.

### 3. settings table (new)
- Single-row table (id = 1) for app-wide configuration.
- `base_points` (integer, default 100): starting points each student begins with.
- `absence_deduction` (integer, default 5): points deducted per unexcused absence.
- Admin-only CRUD via RLS.
*/

-- ============ student_notes: new columns ============
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='student_notes' AND column_name='points_impact') THEN
    ALTER TABLE public.student_notes ADD COLUMN points_impact integer NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='student_notes' AND column_name='excused') THEN
    ALTER TABLE public.student_notes ADD COLUMN excused boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Expand note_type check constraint
ALTER TABLE public.student_notes DROP CONSTRAINT IF EXISTS student_notes_note_type_check;
ALTER TABLE public.student_notes ADD CONSTRAINT student_notes_note_type_check
  CHECK (note_type IN ('supervisor', 'absence', 'general', 'excuse', 'custom'));

-- ============ evaluations: course_id ============
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='evaluations' AND column_name='course_id') THEN
    ALTER TABLE public.evaluations ADD COLUMN course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_evaluations_course ON public.evaluations(course_id);

-- ============ settings table ============
CREATE TABLE IF NOT EXISTS public.settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  base_points integer NOT NULL DEFAULT 100,
  absence_deduction integer NOT NULL DEFAULT 5,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.settings (id, base_points, absence_deduction)
VALUES (1, 100, 5)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Admin: full CRUD
DROP POLICY IF EXISTS "admin_select_settings" ON public.settings;
CREATE POLICY "admin_select_settings"
ON public.settings FOR SELECT
TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "admin_insert_settings" ON public.settings;
CREATE POLICY "admin_insert_settings"
ON public.settings FOR INSERT
TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "admin_update_settings" ON public.settings;
CREATE POLICY "admin_update_settings"
ON public.settings FOR UPDATE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "admin_delete_settings" ON public.settings;
CREATE POLICY "admin_delete_settings"
ON public.settings FOR DELETE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Students: read settings (so they can see base_points etc.)
DROP POLICY IF EXISTS "student_select_settings" ON public.settings;
CREATE POLICY "student_select_settings"
ON public.settings FOR SELECT
TO authenticated
USING (true);
