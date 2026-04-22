// src/components/AuthGate.tsx
import React from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = React.useState(true);

  React.useEffect(() => {
    let isMounted = true;

    async function run() {
      // 1) Check current session (fast; uses persisted session)
      const { data } = await supabase.auth.getSession();
      const user = data?.session?.user ?? null;

      if (!isMounted) return;

      if (!user) {
        // Build safe redirect back to the current page
        const dest = router.asPath || "/dashboard";
        const url = `/auth/sign-in?redirect=${encodeURIComponent(dest)}`;
        router.replace(url);
      } else {
        setChecking(false);
      }
    }

    run();

    // 2) Also react to auth state changes (optional, but nice)
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      if (!session?.user) {
        const dest = router.asPath || "/dashboard";
        router.replace(`/auth/sign-in?redirect=${encodeURIComponent(dest)}`);
      } else {
        setChecking(false);
      }
    });

    return () => {
      isMounted = false;
      sub.subscription?.unsubscribe();
    };
  }, [router]);

  // Placeholder while we check auth
  if (checking) {
    return (
      <div style={{ padding: 40, fontFamily: "system-ui" }}>
        <p>Checking your session…</p>
      </div>
    );
  }

  return <>{children}</>;
}
