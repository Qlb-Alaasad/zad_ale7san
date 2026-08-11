import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Profile } from './types';

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const PROFILE_CACHE_KEY = 'user_profile';

function loadCachedProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (raw) return JSON.parse(raw) as Profile;
  } catch {
    // ignore malformed cache
  }
  return null;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  profile: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  // Hydrate from localStorage immediately so the app can render without
  // waiting for the async Supabase session check on refresh.
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(loadCachedProfile);
  const [loading, setLoading] = useState(() => loadCachedProfile() === null);
  const mountedRef = useRef(true);
  const profileLoadedRef = useRef<string | null>(null);

  const setProfileAndCache = (p: Profile | null) => {
    if (!mountedRef.current) return;
    setProfile(p);
    if (p) {
      localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(p));
      profileLoadedRef.current = p.id;
    } else {
      localStorage.removeItem(PROFILE_CACHE_KEY);
      profileLoadedRef.current = null;
    }
  };

  const loadProfile = async (uid: string) => {
    if (!mountedRef.current) return;
    const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    if (error) {
      console.error('Failed to load profile:', error.message);
      return;
    }
    setProfileAndCache(data as Profile | null);
  };

  useEffect(() => {
    mountedRef.current = true;

    let initialChecked = false;

    const finishInitial = () => {
      if (!initialChecked && mountedRef.current) {
        initialChecked = true;
        setLoading(false);
      }
    };

    // Primary session check on mount — reads from localStorage (persisted session)
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error('getSession error:', error.message);
        finishInitial();
        return;
      }
      if (!mountedRef.current) return;
      setSession(data.session);
      if (data.session?.user) {
        loadProfile(data.session.user.id).finally(finishInitial);
      } else {
        setProfileAndCache(null);
        finishInitial();
      }
    });

    // Listen for auth changes (token refresh, sign in/out, initial session)
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mountedRef.current) return;
      setSession(newSession);

      if (newSession?.user) {
        // Only reload profile if the user changed or we haven't loaded it yet
        if (profileLoadedRef.current !== newSession.user.id) {
          loadProfile(newSession.user.id);
        }
      } else {
        setProfileAndCache(null);
      }

      if (event === 'INITIAL_SESSION') {
        // getSession().then() will call finishInitial — don't finish here
      } else {
        finishInitial();
      }
    });

    return () => {
      mountedRef.current = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const refreshProfile = async () => {
    if (session?.user) await loadProfile(session.user.id);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfileAndCache(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ session, profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
