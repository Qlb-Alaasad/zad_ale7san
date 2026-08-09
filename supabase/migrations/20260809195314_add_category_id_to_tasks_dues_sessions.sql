/*
# Add category_id to tasks, financial_dues, and sessions

1. Purpose
   Links tasks and financial dues to specific evaluation categories so admins
   can assign per-category tasks and dues to students, and so the student portal
   can filter them by enrolled categories. Sessions already had a category_id
   column referenced in code but not in the DB — we add it here too.

2. Changes
   - `tasks.category_id` (uuid, nullable, FK → categories(id) ON DELETE SET NULL)
   - `financial_dues.category_id` (uuid, nullable, FK → categories(id) ON DELETE SET NULL)
   - `sessions.category_id` (uuid, nullable, FK → categories(id) ON DELETE SET NULL)

   All three are nullable so existing rows remain valid; NULL means "general /
   not tied to a specific category" and is visible to all students.

3. Security
   - No policy changes needed — existing RLS policies on these tables already
     cover the new column since policies are row-level, not column-level.
   - No new indexes needed for the nullable FK columns at this scale.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'category_id'
  ) THEN
    ALTER TABLE public.tasks ADD COLUMN category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'financial_dues' AND column_name = 'category_id'
  ) THEN
    ALTER TABLE public.financial_dues ADD COLUMN category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'category_id'
  ) THEN
    ALTER TABLE public.sessions ADD COLUMN category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL;
  END IF;
END $$;
