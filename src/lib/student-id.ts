import { supabase } from './supabase';
import type { Profile } from './types';

/**
 * Resolve the canonical student UUID for Supabase queries.
 * profiles.id === auth.users.id; prefer live auth user over cached profile.
 */
export async function resolveStudentId(profile: Profile | null): Promise<string | null> {
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) {
    console.error('[student-id] supabase.auth.getUser failed:', {
      message: error.message,
      status: error.status,
      name: error.name,
    });
  }

  if (user?.id) {
    if (profile?.id && profile.id !== user.id) {
      console.warn('[student-id] Cached profile.id differs from auth user id — using auth user id', {
        profileId: profile.id,
        authUserId: user.id,
      });
    }
    return user.id;
  }

  if (profile?.id) {
    console.warn('[student-id] No auth user session; falling back to cached profile.id', {
      profileId: profile.id,
    });
    return profile.id;
  }

  console.warn('[student-id] Could not resolve student id (no auth user and no profile)');
  return null;
}

/** Verify a UUID exists in profiles (student records use auth user id). */
export async function verifyStudentProfileId(studentId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, status')
    .eq('id', studentId)
    .maybeSingle();

  if (error) {
    console.error('[student-id] verifyStudentProfileId failed:', {
      studentId,
      message: error.message,
      code: error.code,
    });
    return false;
  }

  if (!data) {
    console.error('[student-id] No profile row for student_id (must match auth.users.id):', studentId);
    return false;
  }

  return true;
}
