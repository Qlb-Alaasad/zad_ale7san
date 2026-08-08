/*
# Update trigger: auto-promote admin@zad.com on signup

## Changes
- Updates handle_new_user() to check if the registering email is admin@zad.com.
- If so, sets role='admin' and status='approved' instead of the default student/pending.
- All other emails still default to role='student', status='pending'.
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email = 'admin@zad.com' THEN
    INSERT INTO public.profiles (id, full_name, role, status)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', 'الشيخ — مدير الأكاديمية'),
      'admin',
      'approved'
    );
  ELSE
    INSERT INTO public.profiles (id, full_name, role, status)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', 'طالب جديد'),
      'student',
      'pending'
    );
  END IF;
  RETURN NEW;
END;
$$;
