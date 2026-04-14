import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/router';

export function useAuthGate(redirectIfMissing = true) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<
    Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'] | null
  >(null);
  const [orgId, setOrgId] = useState<string | null>(null);   // ← ADD THIS
  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(session);
      setLoading(false);

      if (redirectIfMissing && !session) {
        const next = encodeURIComponent(router.asPath || '/dashboard');
        router.replace(`/auth/sign-in?redirect=${next}`);
      }

      // ✅ After session is confirmed, resolve orgId from multiple sources
if (session?.user?.id) {
  const urlOrg = new URLSearchParams(window.location.search).get("orgId");
  if (urlOrg) {
    setOrgId(urlOrg);
    try { localStorage.setItem("orgId", urlOrg); } catch {}
    return;
  }

  // 1) local cache
  try {
    const cached = localStorage.getItem("orgId");
    if (cached) {
      setOrgId(cached);
      return;
    }
  } catch {}

  // 2) user/app metadata
  const metaOrg =
    (session.user.user_metadata as any)?.org_id ||
    (session.user.app_metadata as any)?.org_id || null;
  if (metaOrg) {
    setOrgId(metaOrg);
    try { localStorage.setItem("orgId", metaOrg); } catch {}
    return;
  }

  // 3) memberships table (grab any one row for now)
const { data: memAny, error: mErr } = await supabase
  .from("memberships")
  .select("org_id")
  .eq("profile_id", session.user.id)
  .limit(1)
  .maybeSingle();

if (!mErr && memAny?.org_id) {
  setOrgId(memAny.org_id);
  try { localStorage.setItem("orgId", memAny.org_id); } catch {}
  return;
}


  // If we got here, we truly have no org
  setOrgId(null);
} else {
  setOrgId(null);
}

    };

    const { data: sub } = supabase.auth.onAuthStateChange((_e, newSession) => {
      if (!mounted) return;
      setSession(newSession);
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

  return { loading, session, orgId };  // ← ADD orgId TO RETURN
}
