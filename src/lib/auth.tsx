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

const AuthContext = createContext<AuthContextValue>({
  session: null,
  profile: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  const profileLoadedRef = useRef<string | null>(null);

  const loadProfile = async (uid: string) => {
    if (!mountedRef.current) return;
    const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    if (error) {
      console.error('Failed to load profile:', error.message);
      return;
    }
    if (mountedRef.current) {
      setProfile(data as Profile | null);
      profileLoadedRef.current = uid;
    }
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
        setProfile(null);
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
        setProfile(null);
        profileLoadedRef.current = null;
      }

      // The INITIAL_SESSION event fires synchronously alongside getSession()
      // — mark loading as done so the app can render
      if (event === 'INITIAL_SESSION') {
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
    setProfile(null);
    setSession(null);
    profileLoadedRef.current = null;
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
