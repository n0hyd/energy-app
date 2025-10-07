import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/router";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function NewOrg() {
  const r = useRouter();
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setMsg(null);

    // must be signed in so the trigger can see auth.uid()
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErr("Please sign in first."); return; }

    const { data, error } = await supabase.rpc("org_create", { p_name: name });


    if (error) { setErr(error.message); return; }
    setMsg("Organization created. You are the owner.");
    // take the user to dashboard or a “create building” page
    r.push("/dashboard");
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-lg rounded-2xl border bg-white p-6 shadow">
        <h1 className="text-xl font-bold">Create Organization</h1>
        <p className="text-sm text-gray-600">You’ll be added as owner automatically.</p>
        {err && <div className="mt-3 rounded border border-rose-300 bg-rose-50 p-2 text-rose-700">{err}</div>}
        {msg && <div className="mt-3 rounded border border-emerald-300 bg-emerald-50 p-2 text-emerald-700">{msg}</div>}
        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <input className="w-full rounded border p-2" placeholder="Derby Public Schools" value={name} onChange={e=>setName(e.target.value)} required />
          <button className="rounded-xl bg-emerald-600 px-4 py-2 font-medium text-white">Create</button>
        </form>
      </div>
    </main>
  );
}
