import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { supabase } from '@/lib/supabase';

/**
 * Shared auth guard for all internal pages.
 * Redirects to "/" if there is no active session.
 */
export function useAuth() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) setLocation('/');
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) setLocation('/');
    });

    return () => subscription.unsubscribe();
  }, [setLocation]);
}
