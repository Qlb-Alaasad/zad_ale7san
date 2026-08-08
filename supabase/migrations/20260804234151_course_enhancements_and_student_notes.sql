/*
# Course Enhancements and Student Notes

## Changes

### 1. Courses — new scheduling and management fields
- `session_duration_hours` (numeric, default 1.5): Duration of each session in hours (e.g., 1.5 = ساعة ونصف).
- `time_notes` (text, default ''): Free-text context for session timing (e.g., "بعد صلاة الفجر مباشرة").
- `total_sessions` (integer, default 0): Total number of sessions/repeats planned for the course.
- `supervisor_notes` (text, default ''): Supervisor's general notes about the course.

### 2. Student notes table (new)
- Tracks supervisor notes and automated absence flags on student profiles.
- `note_type`: 'supervisor' | 'absence' | 'general'.
- Linked to student (required), optionally to course and session.
- Used by the attendance auto-absence feature: when a session timer ends, students without attendance get an 'absence' note.

### 3. Security
- RLS enabled on `student_notes`.
- Admin: full CRUD on all notes (policies check profiles.role = 'admin').
- Students: read only their own notes.
*/

-- ============ COURSES: new columns ============
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='courses' AND column_name='session_duration_hours') THEN
    ALTER TABLE public.courses ADD COLUMN session_duration_hours numeric DEFAULT 1.5;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='courses' AND column_name='time_notes') THEN
    ALTER TABLE public.courses ADD COLUMN time_notes text DEFAULT '';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='courses' AND column_name='total_sessions') THEN
    ALTER TABLE public.courses ADD COLUMN total_sessions integer DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='courses' AND column_name='supervisor_notes') THEN
    ALTER TABLE public.courses ADD COLUMN supervisor_notes text DEFAULT '';
  END IF;
END $$;

-- ============ STUDENT_NOTES table ============
CREATE TABLE IF NOT EXISTS public.student_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  session_id uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  note text NOT NULL,
  note_type text NOT NULL DEFAULT 'general' CHECK (note_type IN ('supervisor', 'absence', 'general')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.student_notes ENABLE ROW LEVEL SECURITY;

-- Admin: full CRUD
DROP POLICY IF EXISTS "admin_select_student_notes" ON public.student_notes;
CREATE POLICY "admin_select_student_notes"
ON public.student_notes FOR SELECT
TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "admin_insert_student_notes" ON public.student_notes;
CREATE POLICY "admin_insert_student_notes"
ON public.student_notes FOR INSERT
TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "admin_update_student_notes" ON public.student_notes;
CREATE POLICY "admin_update_student_notes"
ON public.student_notes FOR UPDATE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "admin_delete_student_notes" ON public.student_notes;
CREATE POLICY "admin_delete_student_notes"
ON public.student_notes FOR DELETE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Students: read only their own notes
DROP POLICY IF EXISTS "student_select_own_notes" ON public.student_notes;
CREATE POLICY "student_select_own_notes"
ON public.student_notes FOR SELECT
TO authenticated
USING (auth.uid() = student_id);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_student_notes_student ON public.student_notes(student_id);
CREATE INDEX IF NOT EXISTS idx_student_notes_course ON public.student_notes(course_id);