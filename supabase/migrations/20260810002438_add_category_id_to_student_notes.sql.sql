/*
# Add category_id to student_notes

Links absence notes to the specific evaluation category the session belongs to,
so the student portal can show absence notes under the correct category.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'student_notes' AND column_name = 'category_id'
  ) THEN
    ALTER TABLE public.student_notes ADD COLUMN category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_student_notes_category ON public.student_notes(category_id);
