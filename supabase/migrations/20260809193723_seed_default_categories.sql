/*
# Seed Default Challenge Categories

## Summary
Inserts six default evaluation categories into the `categories` table so they
appear under the "الفئات" tab in the admin dashboard and student portal.

## Categories Added
1. القرآن — حفظ ومراجعة الآيات
2. الأخلاق — الالتزام بالأخلاق الحسنة
3. الرياضة — الالتزام بالتدريب والجهد
4. المهام — إنجاز المهام المطلوبة
5. التعاون — التعاون واحترام الآخرين
6. الحضور — الالتزام بالحضور في الوقت

## Idempotency
Uses `ON CONFLICT DO NOTHING` on a uniqueness constraint on the category name
so re-running this migration is safe and won't create duplicates.

## Security
No RLS policy changes. The existing `categories_select` policy allows all
authenticated users to read categories, and admin writes are handled by the
`is_admin()` SECURITY DEFINER function installed in an earlier migration.
*/

-- Ensure name uniqueness so the seed is idempotent
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'categories_name_key'
  ) THEN
    ALTER TABLE public.categories ADD CONSTRAINT categories_name_key UNIQUE (name);
  END IF;
END $$;

INSERT INTO public.categories (name, description, max_points) VALUES
  ('القرآن', 'حفظ ومراجعة الآيات', 25),
  ('الأخلاق', 'الالتزام بالأخلاق الحسنة', 25),
  ('الرياضة', 'الالتزام بالتدريب والجهد', 25),
  ('المهام', 'إنجاز المهام المطلوبة', 25),
  ('التعاون', 'التعاون واحترام الآخرين', 25),
  ('الحضور', 'الالتزام بالحضور في الوقت', 25)
ON CONFLICT (name) DO NOTHING;