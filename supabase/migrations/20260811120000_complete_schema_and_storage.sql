/*
# Complete Schema Sync + Storage Buckets
#
# Idempotent migration for deployments that may be missing incremental updates.
# Safe to run on fresh or partially migrated databases.
#
# Covers:
#   • student_groups, group_enrollments
#   • student_evaluation_history (weekly Friday archive)
#   • student_categories
#   • financial_payments ledger
#   • tasks delivery-state columns + file attachment path
#   • financial_dues extended columns
#   • categories.is_hifz, profiles.avatar_url, settings.last_weekly_reset_at
#   • Storage buckets: avatars (public), files (private task/general uploads)
#   • Storage RLS policies for authenticated users and admins
#
# Prerequisites: base tables from 20260804214140_zad_al_ihsan_tables.sql
#                and is_admin() from 20260804214201_zad_al_ihsan_admin_policies.sql
*/

-- =============================================================================
-- HELPER: ensure is_admin() exists (required by RLS below)
-- =============================================================================
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

-- =============================================================================
-- PROFILES: avatar URL (synced from storage.objects avatars bucket)
-- =============================================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN avatar_url text;
  END IF;
END $$;

-- =============================================================================
-- CATEGORIES: Hifz flag
-- =============================================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'is_hifz'
  ) THEN
    ALTER TABLE public.categories ADD COLUMN is_hifz boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- =============================================================================
-- SETTINGS: weekly Friday reset timestamp
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  base_points integer NOT NULL DEFAULT 100,
  absence_deduction integer NOT NULL DEFAULT 5,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'settings' AND column_name = 'last_weekly_reset_at'
  ) THEN
    ALTER TABLE public.settings ADD COLUMN last_weekly_reset_at timestamptz;
  END IF;
END $$;

INSERT INTO public.settings (id, base_points, absence_deduction)
VALUES (1, 100, 5)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_settings" ON public.settings;
CREATE POLICY "admin_select_settings" ON public.settings FOR SELECT
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "admin_insert_settings" ON public.settings;
CREATE POLICY "admin_insert_settings" ON public.settings FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_settings" ON public.settings;
CREATE POLICY "admin_update_settings" ON public.settings FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_settings" ON public.settings;
CREATE POLICY "admin_delete_settings" ON public.settings FOR DELETE
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "student_select_settings" ON public.settings;
CREATE POLICY "student_select_settings" ON public.settings FOR SELECT
  TO authenticated USING (true);

-- =============================================================================
-- STUDENT GROUPS (الشُعب والقروبات)
-- =============================================================================
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

-- =============================================================================
-- GROUP ENROLLMENTS
-- =============================================================================
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

-- =============================================================================
-- STUDENT EVALUATION HISTORY (Friday weekly archive)
-- =============================================================================
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

-- =============================================================================
-- STUDENT CATEGORIES (category enrollment)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.student_categories (
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, category_id)
);

ALTER TABLE public.student_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "student_categories_select" ON public.student_categories;
CREATE POLICY "student_categories_select" ON public.student_categories FOR SELECT
  TO authenticated USING (auth.uid() = student_id OR public.is_admin());

DROP POLICY IF EXISTS "student_categories_insert" ON public.student_categories;
CREATE POLICY "student_categories_insert" ON public.student_categories FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "student_categories_update" ON public.student_categories;
CREATE POLICY "student_categories_update" ON public.student_categories FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "student_categories_delete" ON public.student_categories;
CREATE POLICY "student_categories_delete" ON public.student_categories FOR DELETE
  TO authenticated USING (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_student_categories_student ON public.student_categories(student_id);
CREATE INDEX IF NOT EXISTS idx_student_categories_category ON public.student_categories(category_id);

-- =============================================================================
-- TASKS: delivery states, submissions, file attachments
-- =============================================================================
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
    WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.tasks ADD COLUMN status text NOT NULL DEFAULT 'assigned'
      CHECK (status IN ('assigned', 'in_progress', 'submitted', 'completed'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'submission_text'
  ) THEN
    ALTER TABLE public.tasks ADD COLUMN submission_text text DEFAULT '';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'submitted_at'
  ) THEN
    ALTER TABLE public.tasks ADD COLUMN submitted_at timestamptz;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.tasks ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'submission_file_path'
  ) THEN
    ALTER TABLE public.tasks ADD COLUMN submission_file_path text;
  END IF;
END $$;

UPDATE public.tasks SET status = 'completed' WHERE completed = true AND status = 'assigned';

DROP POLICY IF EXISTS "tasks_student_update" ON public.tasks;
CREATE POLICY "tasks_student_update" ON public.tasks FOR UPDATE
  TO authenticated USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_student ON public.tasks(student_id);

-- =============================================================================
-- FINANCIAL DUES: extended columns
-- =============================================================================
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
    WHERE table_schema = 'public' AND table_name = 'financial_dues' AND column_name = 'due_date'
  ) THEN
    ALTER TABLE public.financial_dues ADD COLUMN due_date date;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'financial_dues' AND column_name = 'notes'
  ) THEN
    ALTER TABLE public.financial_dues ADD COLUMN notes text DEFAULT '';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_financial_dues_student ON public.financial_dues(student_id);
CREATE INDEX IF NOT EXISTS idx_financial_dues_status ON public.financial_dues(status);

-- =============================================================================
-- FINANCIAL PAYMENTS (ledger)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.financial_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  due_id uuid REFERENCES public.financial_dues(id) ON DELETE SET NULL,
  amount numeric(10,2) NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'cash',
  notes text DEFAULT '',
  recorded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.financial_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "financial_payments_select" ON public.financial_payments;
CREATE POLICY "financial_payments_select" ON public.financial_payments FOR SELECT
  TO authenticated USING (auth.uid() = student_id OR public.is_admin());

DROP POLICY IF EXISTS "financial_payments_insert" ON public.financial_payments;
CREATE POLICY "financial_payments_insert" ON public.financial_payments FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "financial_payments_update" ON public.financial_payments;
CREATE POLICY "financial_payments_update" ON public.financial_payments FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "financial_payments_delete" ON public.financial_payments;
CREATE POLICY "financial_payments_delete" ON public.financial_payments FOR DELETE
  TO authenticated USING (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_financial_payments_student ON public.financial_payments(student_id);
CREATE INDEX IF NOT EXISTS idx_financial_payments_due ON public.financial_payments(due_id);

-- =============================================================================
-- STUDENT NOTES: link absences to evaluation category
-- =============================================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'student_notes' AND column_name = 'category_id'
  ) THEN
    ALTER TABLE public.student_notes ADD COLUMN category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_student_notes_category ON public.student_notes(category_id);

-- =============================================================================
-- SEED DATA
-- =============================================================================
INSERT INTO public.student_groups (name, description, is_hifz)
SELECT 'الحفظ / القرآن', 'شعبة حفظ القرآن الكريم — تفعّل تتبع الحفظ والتقييمات القرآنية', true
WHERE NOT EXISTS (SELECT 1 FROM public.student_groups WHERE is_hifz = true);

-- =============================================================================
-- STORAGE BUCKETS
-- Path conventions:
--   avatars: {user_id}/avatar.{ext}          — public read, user-scoped write
--   files:   {user_id}/tasks/{task_id}/…     — private, user + admin read
--            {user_id}/uploads/…             — general user uploads
-- =============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'avatars',
    'avatars',
    true,
    2097152, -- 2 MB
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
  ),
  (
    'files',
    'files',
    false,
    10485760, -- 10 MB
    ARRAY[
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ]::text[]
  )
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- =============================================================================
-- STORAGE POLICIES — AVATARS
-- =============================================================================
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read" ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_user_insert" ON storage.objects;
CREATE POLICY "avatars_user_insert" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
    )
  );

DROP POLICY IF EXISTS "avatars_user_update" ON storage.objects;
CREATE POLICY "avatars_user_update" ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
    )
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
    )
  );

DROP POLICY IF EXISTS "avatars_user_delete" ON storage.objects;
CREATE POLICY "avatars_user_delete" ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
    )
  );

-- =============================================================================
-- STORAGE POLICIES — FILES (task submissions & general uploads)
-- =============================================================================
DROP POLICY IF EXISTS "files_select_own_or_admin" ON storage.objects;
CREATE POLICY "files_select_own_or_admin" ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'files'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
    )
  );

DROP POLICY IF EXISTS "files_insert_own_or_admin" ON storage.objects;
CREATE POLICY "files_insert_own_or_admin" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'files'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
    )
  );

DROP POLICY IF EXISTS "files_update_own_or_admin" ON storage.objects;
CREATE POLICY "files_update_own_or_admin" ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'files'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
    )
  )
  WITH CHECK (
    bucket_id = 'files'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
    )
  );

DROP POLICY IF EXISTS "files_delete_own_or_admin" ON storage.objects;
CREATE POLICY "files_delete_own_or_admin" ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'files'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin()
    )
  );

-- After uploading to avatars, set profiles.avatar_url via the client:
--   const { data } = supabase.storage.from('avatars').getPublicUrl(`${userId}/avatar.webp`)
--   await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', userId)
