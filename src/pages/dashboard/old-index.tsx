// src/pages/dashboard/index.tsx
import { useEffect, useRef, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient"; // same singleton client used elsewhere

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const redirected = useRef(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Client-side auth gate (same pattern as /buildings)
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        if (!redirected.current) {
          redirected.current = true;
          window.location.href = "/auth/sign-in?redirect=/dashboard";
        }
        return;
      }

      if (!cancelled) {
        setEmail(user.email ?? null);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl p-4">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-gray-500 mt-2">Loading…</p>
      </main>
    );
  }

  return (
    <>
      <Head>
        <title>Dashboard</title>
      </Head>
      <main className="mx-auto max-w-5xl p-4 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <nav className="flex gap-3 text-sm">
            <Link href="/buildings" className="underline">Buildings</Link>
            <Link href="/bills/manual-entry" className="underline">Add Bill</Link>
          </nav>
        </div>

        <section className="rounded-lg border p-4">
          <h2 className="mb-2 text-lg font-medium">Welcome</h2>
          <p className="text-sm text-gray-700">
            {email ? `Signed in as ${email}` : "Signed in"}
          </p>
          <p className="text-sm text-gray-500 mt-2">
            This is your overall district view. We’ll surface KPIs (District EUI, latest bills, benchmarks, etc.) here.
          </p>
        </section>

        {/* Future: KPI Cards grid */}
        {/* <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"> ... </div> */}
      </main>
    </>
  );
}
