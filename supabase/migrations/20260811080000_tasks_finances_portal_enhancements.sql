/*
# Tasks, Finances & Portal Enhancements

1. student_categories — links students to evaluation categories
2. tasks — delivery states, submission text, timestamps
3. financial_dues — due_date and admin notes
4. financial_payments — payment ledger for audit trail
5. RLS — students can update their own task progress/submissions
*/

-- ============ student_categories ============
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

-- ============ tasks enhancements ============
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

UPDATE public.tasks SET status = 'completed' WHERE completed = true AND status = 'assigned';

-- ============ financial_dues enhancements ============
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

-- ============ financial_payments ledger ============
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

-- ============ students can update own task progress ============
DROP POLICY IF EXISTS "tasks_student_update" ON public.tasks;
CREATE POLICY "tasks_student_update" ON public.tasks FOR UPDATE
  TO authenticated USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
