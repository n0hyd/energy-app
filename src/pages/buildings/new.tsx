import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "@/lib/supabaseClient"; // ✅ use the shared client

export default function NewBuilding() {
  const r = useRouter();

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<{ org_id: string }[]>([]);
  const [name, setName] = useState("");
  const [state, setState] = useState("KS");
  const [sqft, setSqft] = useState<string>("0");
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Load current user + orgs
  useEffect(() => {
    (async () => {
      setErr(null);
      // 1) ensure signed in (mirror /buildings)
const { data: { user } } = await supabase.auth.getUser();
if (!user) {
window.location.href = "/auth/sign-in?redirect=/buildings/new";
return;
}
setUserEmail(user.email ?? null);

      // 2) load memberships (first org as default)
      const { data: memRows, error: memErr } = await supabase
        .from("memberships")
        .select("org_id")
        .limit(10);
      if (memErr) {
        setErr(`Could not read memberships (RLS?): ${memErr.message}`);
        return;
      }
      setOrgs(memRows ?? []);
      if (memRows && memRows.length) setOrgId(memRows[0].org_id);
      else setInfo("No organization found. Create one at /orgs/new.");
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setInfo(null);

    if (!orgId) {
      setErr("No organization selected. Create one at /orgs/new, then retry.");
      return;
    }

    const squareFeet = Number(sqft || "0");
    if (Number.isNaN(squareFeet) || squareFeet < 0) {
      setErr("Square feet must be a non-negative number.");
      return;
    }

    setSubmitting(true);
    try {
      // Insert building (activity_code required by schema)
      const { data: bldg, error: bErr } = await supabase
        .from("buildings")
        .insert({
          org_id: orgId,
          name,
          state: state.toUpperCase().slice(0, 2),
          activity_code: "Education",
          square_feet: squareFeet,
        })
        .select("id")
        .single();

      if (bErr) {
        console.error("Building insert error:", bErr);
        setErr(`Could not create building: ${bErr.message}`);
        return;
      }

      // Try to create a default electric meter (non-fatal if it fails)
      const { error: mErr } = await supabase
        .from("meters")
        .insert({ building_id: bldg!.id, label: "Main electric" });
      if (mErr) {
        console.warn("Meter insert error (continuing to detail page):", mErr);
        setInfo(
          "Building created, but meter could not be created. You can add one later."
        );
      }

      // Go to the building page
      r.push(`/buildings/${bldg!.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-lg rounded-2xl border bg-white p-6 shadow">
        <h1 className="text-xl font-bold">Create Building</h1>
        <p className="text-sm text-gray-600">
          {userEmail ? `Signed in as ${userEmail}` : "Not signed in"}
        </p>

        {err && (
          <div className="mt-3 rounded border border-rose-300 bg-rose-50 p-2 text-rose-700">
            {err}
          </div>
        )}
        {info && (
          <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-2 text-amber-800">
            {info}
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          {/* Org selector (in case you have multiple orgs) */}
          {orgs.length > 0 ? (
            <select
              className="w-full rounded border p-2"
              value={orgId ?? ""}
              onChange={(e) => setOrgId(e.target.value || null)}
            >
              {orgs.map((o) => (
                <option key={o.org_id} value={o.org_id}>
                  Org: {o.org_id}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-gray-600">
              No organizations yet. Create one at <a className="underline text-emerald-700" href="/orgs/new">/orgs/new</a>.
            </p>
          )}

          <input
            className="w-full rounded border p-2"
            placeholder="High School"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            className="w-full rounded border p-2"
            placeholder="Square feet"
            type="number"
            min={0}
            value={sqft}
            onChange={(e) => setSqft(e.target.value)}
          />
          <input
            className="w-full rounded border p-2"
            placeholder="State (KS)"
            value={state}
            onChange={(e) => setState(e.target.value)}
          />

          <button
            className="rounded-xl bg-emerald-600 px-4 py-2 font-medium text-white disabled:opacity-50"
            disabled={submitting}
          >
            {submitting ? "Creating…" : "Create"}
          </button>
        </form>
      </div>
    </main>
  );
}
