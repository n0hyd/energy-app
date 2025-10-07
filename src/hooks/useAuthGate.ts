import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/router';

export function useAuthGate(redirectIfMissing = true) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'] | null>(null);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(session);
      setLoading(false);
      if (redirectIfMissing && !session) {
        // preserve intended destination
        const next = encodeURIComponent(router.asPath || '/dashboard');
        router.replace(`/auth/sign-in?redirect=${next}`);
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_e, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      // if we just logged in and there’s a redirect param, honor it
      const params = new URLSearchParams(window.location.search);
      const redirect = params.get('redirect');
      if (newSession && redirect) router.replace(redirect);
    });

    init();
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [router, redirectIfMissing]);

  return { loading, session };
}
