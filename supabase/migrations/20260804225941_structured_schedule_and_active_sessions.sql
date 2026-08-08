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
- Admin accounts must now be created and promoted manually (via the Students tab by an existing admin, or via SQL for the first admin).

## Security
- No RLS policy changes. Existing policies already allow admin CRUD on courses and sessions.
- The new columns inherit existing policies (courses_update allows admin, sessions_update allows admin).
*/