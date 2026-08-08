/*
# Structured Course Scheduling, Active Sessions, and Trigger Cleanup

## Changes

### 1. Courses — structured schedule columns
- Added `schedule_days text[]` — array of Arabic day names (e.g. ['السبت','الأربعاء']) for recurring weekly schedule.
- Added `schedule_start_time text` — start time in HH:MM format (e.g. '16:00').
- Added `schedule_end_time text` — end time in HH:MM format (e.g. '18:00').
- The existing `schedule` text column is kept for backward compatibility / display fallback.

### 2. Sessions — is_active flag
- Added `is_active boolean NOT NULL DEFAULT false` — allows the admin to explicitly mark a session as active for QR attendance.
- This replaces the broken time-window check that rejected valid scans when `now` was outside `start_time`/`end_time`.
- Admin toggles `is_active` from the Attendance tab; only active sessions accept QR scans.

### 3. Trigger — remove admin@zad.com auto-promotion
- Updated `handle_new_user()` so ALL new signups default to role='student', status='pending'.
- Removed the special case that auto-promoted admin@zad.com to admin/approved.
- Added bootstrap: if no admin profile exists yet, the first signup is auto-promoted to admin+approved. This ensures the first real user can manage the academy without a hardcoded mock account.

## Security
- No RLS policy changes. Existing policies already allow admin CRUD on courses and sessions.
- The new columns inherit existing policies (courses_update allows admin, sessions_update allows admin).
*/

-- ============ COURSES: structured schedule columns ============
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='courses' AND column_name='schedule_days') THEN
    ALTER TABLE public.courses ADD COLUMN schedule_days text[] DEFAULT '{}';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='courses' AND column_name='schedule_start_time') THEN
    ALTER TABLE public.courses ADD COLUMN schedule_start_time text DEFAULT '';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='courses' AND column_name='schedule_end_time') THEN
    ALTER TABLE public.courses ADD COLUMN schedule_end_time text DEFAULT '';
  END IF;
END $$;

-- ============ SESSIONS: is_active flag ============
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sessions' AND column_name='is_active') THEN
    ALTER TABLE public.sessions ADD COLUMN is_active boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- ============ TRIGGER: remove admin@zad.com special case, add first-admin bootstrap ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_count int;
BEGIN
  SELECT count(*) INTO admin_count FROM public.profiles WHERE role = 'admin';

  IF admin_count = 0 THEN
    -- No admin exists yet — promote the first real signup to admin.
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
