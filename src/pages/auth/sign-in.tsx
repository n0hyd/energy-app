// src/pages/auth/sign-in.tsx
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabaseClient";

function sanitizeRedirect(input: string | null | undefined) {
  // Default destination
  const fallback = "/dashboard";
  if (!input) return fallback;

  try {
    // Allow only same-origin internal paths
    const url = new URL(input, window.location.origin);
    if (url.origin !== window.location.origin) return fallback;
    // Prevent redirecting to auth pages in a loop
    if (url.pathname.startsWith("/auth/")) return fallback;
    const dest = url.pathname + url.search + url.hash;
    return dest || fallback;
  } catch {
    // Also allow simple absolute paths like "/buildings"
    if (input.startsWith("/")) return input;
    return fallback;
  }
}

export default function SignInPage() {
  const router = useRouter();
  const redirect = useMemo(
    () => sanitizeRedirect((router.query.redirect as string) ?? undefined),
    [router.query.redirect]
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // If already signed in, skip the form and go where we were headed
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.replace(redirect);
    });
  }, [router, redirect]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }

    // Go to intended destination (e.g., /buildings) instead of always /dashboard
    router.replace(redirect);
  }

  return (
    <div style={{ padding: 40, fontFamily: "system-ui" }}>
      <h1>Sign In</h1>
      <form onSubmit={handleLogin} style={{ display: "grid", gap: 12, maxWidth: 320 }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}
