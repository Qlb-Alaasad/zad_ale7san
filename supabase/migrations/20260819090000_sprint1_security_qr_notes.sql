/*
# Sprint 1 — Security Hardening: Server-Verified QR + Attendance Lockdown + Note Visibility

## Changes

### 1. Server-side QR signing (closes F1/F2 audit findings)
- `app_secrets` table holds the QR signing key server-side only
  (RLS enabled, ZERO policies for API roles, privileges revoked).
- `issue_qr_token(session_id)` RPC — staff-only, returns the 60-second window
  payload and records it in `qr_tokens` for audit.
- `check_in_with_qr(payload)` RPC — the ONLY way a student can create an
  attendance row. Verifies signature + time window server-side, enforces
  approved-student status, active session, 15-minute late threshold, and
  idempotent check-in (ON CONFLICT DO NOTHING).

### 2. Attendance RLS lockdown
- Drops the legacy `attendance_insert` policy that allowed
  `auth.uid() = student_id` (students could self-mark present via the API).
- Direct INSERT is now staff-only (admin or scoped teacher).
  Students check in exclusively through `check_in_with_qr`.

### 3. qr_tokens lockdown
- No direct API access; admin-only read for audit.

### 4. student_notes: visibility + authorship
- `visibility` ('private_staff' | 'student' | 'shared_parent'), default 'student'.
- `created_by` author attribution, auto-filled by trigger.
- RLS rebuilt: students can no longer read `private_staff` notes;
  teacher-scoped access preserved.

### 5. student_groups SELECT tightened
- Students see only groups they are enrolled in (was: all authenticated).

Prerequisites: base schema + is_admin()/is_staff()/teacher_can_access_*()
*/

-- =============================================================================
-- 0. EXTENSION
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- 1. APP SECRETS (server-only key storage)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.app_secrets (
  key text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies: unreadable/unwritable by anon & authenticated.
REVOKE ALL ON public.app_secrets FROM anon, authenticated;

INSERT INTO public.app_secrets (key, value)
VALUES ('qr_signing_key', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;

-- Internal helper — definer-only, not callable by API roles.
CREATE OR REPLACE FUNCTION public.get_qr_signing_key()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT value FROM public.app_secrets WHERE key = 'qr_signing_key';
$$;

REVOKE ALL ON FUNCTION public.get_qr_signing_key() FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 2. QR RPCs
-- =============================================================================

-- Staff: issue the current 60-second window token for a session.
CREATE OR REPLACE FUNCTION public.issue_qr_token(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window bigint;
  v_secret text;
  v_hash   text;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Only staff can issue QR tokens';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.sessions WHERE id = p_session_id) THEN
    RAISE EXCEPTION 'Session not found';
  END IF;

  v_secret := public.get_qr_signing_key();
  v_window := floor(extract(epoch FROM now()) / 60);
  v_hash   := left(encode(digest(p_session_id::text || ':' || v_window || ':' || v_secret, 'sha256'), 'hex'), 16);

  INSERT INTO public.qr_tokens (session_id, token_hash, valid_from, valid_until)
  VALUES (
    p_session_id,
    v_hash,
    to_timestamp(v_window * 60),
    to_timestamp((v_window + 2) * 60)
  );

  RETURN jsonb_build_object('s', p_session_id, 'w', v_window, 'h', v_hash);
END;
$$;

-- Student: server-verified check-in. The ONLY path that creates student attendance.
CREATE OR REPLACE FUNCTION public.check_in_with_qr(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_session_id uuid;
  v_window     bigint;
  v_hash       text;
  v_current    bigint;
  v_secret     text;
  v_session    public.sessions%ROWTYPE;
  v_status     text;
  v_inserted   uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_uid AND role = 'student' AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Only approved students can check in';
  END IF;

  -- Parse defensively: malformed payloads must not raise.
  BEGIN
    v_session_id := (p_payload->>'s')::uuid;
    v_window     := (p_payload->>'w')::bigint;
    v_hash       := p_payload->>'h';
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload');
  END;

  IF v_session_id IS NULL OR v_window IS NULL OR v_hash IS NULL OR length(v_hash) <> 16 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload');
  END IF;

  -- Time-window tolerance: current or previous 60s window (120s scan latency).
  v_current := floor(extract(epoch FROM now()) / 60);
  IF abs(v_current - v_window) > 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'expired');
  END IF;

  -- Signature verification against the server-side secret.
  v_secret := public.get_qr_signing_key();
  IF left(encode(digest(v_session_id::text || ':' || v_window || ':' || v_secret, 'sha256'), 'hex'), 16)
     IS DISTINCT FROM v_hash THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_signature');
  END IF;

  SELECT * INTO v_session FROM public.sessions WHERE id = v_session_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'session_not_found');
  END IF;

  IF NOT v_session.is_active THEN
    RETURN jsonb_build_object('ok', false, 'code', 'session_inactive');
  END IF;

  v_status := CASE
    WHEN v_session.start_time IS NOT NULL
         AND now() > v_session.start_time + interval '15 minutes'
    THEN 'late'
    ELSE 'present'
  END;

  INSERT INTO public.attendance (student_id, session_id, status, points_deducted)
  VALUES (v_uid, v_session_id, v_status, 0)
  ON CONFLICT (student_id, session_id) DO NOTHING
  RETURNING id INTO v_inserted;

  IF v_inserted IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'already_recorded');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'checked_in',
    'status', v_status,
    'session_id', v_session_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.issue_qr_token(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_in_with_qr(jsonb) TO authenticated;

-- =============================================================================
-- 3. ATTENDANCE RLS LOCKDOWN
--    Students can no longer INSERT attendance directly (self-marking hole).
-- =============================================================================
DROP POLICY IF EXISTS "attendance_insert" ON public.attendance;
CREATE POLICY "attendance_staff_insert" ON public.attendance FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (public.is_teacher() AND public.teacher_can_access_student(student_id))
  );

-- Student SELECT of own rows and teacher/admin policies remain as-is.

-- =============================================================================
-- 4. QR_TOKENS LOCKDOWN (audit-only table, written by SECURITY DEFINER RPC)
-- =============================================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'qr_tokens'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.qr_tokens', r.policyname);
  END LOOP;
END $$;

ALTER TABLE public.qr_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qr_tokens_admin_select" ON public.qr_tokens FOR SELECT
  TO authenticated USING (public.is_admin());
-- No INSERT/UPDATE/DELETE policies for API roles on purpose.

-- =============================================================================
-- 5. STUDENT_NOTES: VISIBILITY + AUTHORSHIP
-- =============================================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'student_notes' AND column_name = 'visibility'
  ) THEN
    ALTER TABLE public.student_notes
      ADD COLUMN visibility text NOT NULL DEFAULT 'student'
      CHECK (visibility IN ('private_staff', 'student', 'shared_parent'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'student_notes' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE public.student_notes
      ADD COLUMN created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_student_notes_visibility ON public.student_notes(visibility);

-- Auto-author attribution.
CREATE OR REPLACE FUNCTION public.set_student_note_created_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_student_notes_created_by ON public.student_notes;
CREATE TRIGGER trg_student_notes_created_by
  BEFORE INSERT ON public.student_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_student_note_created_by();

-- Rebuild ALL student_notes policies with visibility awareness.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'student_notes'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.student_notes', r.policyname);
  END LOOP;
END $$;

-- Students: own notes, staff-private ones hidden.
CREATE POLICY "student_notes_student_select" ON public.student_notes FOR SELECT
  TO authenticated
  USING (auth.uid() = student_id AND visibility <> 'private_staff');

-- Admin: full access.
CREATE POLICY "student_notes_admin_select" ON public.student_notes FOR SELECT
  TO authenticated USING (public.is_admin());
CREATE POLICY "student_notes_admin_insert" ON public.student_notes FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "student_notes_admin_update" ON public.student_notes FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "student_notes_admin_delete" ON public.student_notes FOR DELETE
  TO authenticated USING (public.is_admin());

-- Teacher: scoped to students in assigned classes.
CREATE POLICY "student_notes_teacher_select" ON public.student_notes FOR SELECT
  TO authenticated
  USING (public.is_teacher() AND public.teacher_can_access_student(student_id));
CREATE POLICY "student_notes_teacher_insert" ON public.student_notes FOR INSERT
  TO authenticated
  WITH CHECK (public.is_teacher() AND public.teacher_can_access_student(student_id));
CREATE POLICY "student_notes_teacher_update" ON public.student_notes FOR UPDATE
  TO authenticated
  USING (public.is_teacher() AND public.teacher_can_access_student(student_id))
  WITH CHECK (public.is_teacher() AND public.teacher_can_access_student(student_id));
CREATE POLICY "student_notes_teacher_delete" ON public.student_notes FOR DELETE
  TO authenticated
  USING (public.is_teacher() AND public.teacher_can_access_student(student_id));

-- =============================================================================
-- 6. STUDENT_GROUPS SELECT TIGHTENED
--    Students see only their own groups; staff see all / assigned.
-- =============================================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'student_groups' AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.student_groups', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "student_groups_select" ON public.student_groups FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR (public.is_teacher() AND public.teacher_can_access_class(id))
    OR EXISTS (
      SELECT 1 FROM public.group_enrollments ge
      WHERE ge.group_id = id AND ge.student_id = auth.uid()
    )
  );
