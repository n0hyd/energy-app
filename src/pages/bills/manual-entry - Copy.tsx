import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { createClient } from "@supabase/supabase-js";

/**
 * OPTION A — Manual Bill Entry (with building_id + meter_id)
 *
 * Prereqs (run these SQL migrations first):
 * 1) ALTER TABLE bills ADD building_id, meter_id (FKs) and set NOT NULL after any backfill
 * 2) RLS policy that checks org membership via buildings/meters
 *    (full SQL is provided in chat)
 */

// ---- Supabase client (replace with your local wrapper if you have one) ----
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ---- Narrow types for selects ----
type Org = { id: string; name: string | null };
type Building = { id: string; name: string; org_id: string };
type Meter = { id: string; building_id: string; type: string | null };

type MeterOption = { id: string; label: string; building_id: string };

export default function ManualEntryPage() {
  const router = useRouter();
  const { buildingId: qBuilding, meter: qMeter } = (router.query || {}) as {
    buildingId?: string;
    meter?: string;
  };

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Domain state
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [meters, setMeters] = useState<Meter[]>([]);

  const [organizationId, setOrganizationId] = useState<string | undefined>();
  const [buildingId, setBuildingId] = useState<string | undefined>(qBuilding);
  const [meterId, setMeterId] = useState<string | undefined>(qMeter);

  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [usageKwh, setUsageKwh] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [demandCost, setDemandCost] = useState("");

  // Derived meter options respecting the selected building
  const meterOptions: MeterOption[] = useMemo(() => {
    return meters
      .filter((m) => (buildingId ? m.building_id === buildingId : true))
      .map((m) => ({
        id: m.id,
        building_id: m.building_id,
        label: `${m.type || "electric"} • ${m.id.slice(0, 6)}`,
      }));
  }, [meters, buildingId]);

  // Buildings filtered by organization (optional narrowing)
  const orgBuildings = useMemo(() => {
    if (!organizationId) return buildings;
    return buildings.filter((b) => b.org_id === organizationId);
  }, [buildings, organizationId]);

  // Bootstrap: auth + orgs + buildings + meters
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) {
          router.replace("/auth/sign-in");
          return;
        }

        const { data: orgRows, error: orgErr } = await supabase
          .from("organizations")
          .select("id,name")
          .order("name", { ascending: true });
        if (orgErr) throw orgErr;
        setOrgs(orgRows || []);
        if (!organizationId && orgRows && orgRows.length === 1) setOrganizationId(orgRows[0].id);

        const { data: buildingRows, error: bErr } = await supabase
          .from("buildings")
          .select("id,name,org_id")
          .order("name", { ascending: true });
        if (bErr) throw bErr;
        setBuildings(buildingRows || []);
        if (!buildingId && qBuilding && buildingRows?.some((b) => b.id === qBuilding)) setBuildingId(qBuilding);

        const { data: meterRows, error: mErr } = await supabase
          .from("meters")
          .select("id,building_id,type")
          .order("id", { ascending: true });
        if (mErr) throw mErr;
        setMeters(meterRows || []);
        if (!meterId && qMeter && meterRows?.some((m) => m.id === qMeter)) setMeterId(qMeter);
      } catch (e: any) {
        setError(e?.message || "Failed to initialize");
      } finally {
        setLoading(false);
      }
    };
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Submit: create bill with FK links, then usage_readings
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setToast(null);

    try {
      if (!buildingId) throw new Error("Choose a building");
      if (!meterId) throw new Error("Choose a meter");
      if (!periodStart || !periodEnd) throw new Error("Enter the billing period");

      const kwhNum = parseFloat(usageKwh.replace(/,/g, ""));
      const totalNum = parseFloat(totalCost.replace(/,/g, ""));
      const demandNum = demandCost ? parseFloat(demandCost.replace(/,/g, "")) : null;

      if (!isFinite(kwhNum) || kwhNum <= 0) throw new Error("Usage (kWh) must be a positive number");
      if (!isFinite(totalNum) || totalNum < 0) throw new Error("Total cost must be a valid number");
      if (demandCost && (!isFinite(demandNum as number) || (demandNum as number) < 0)) {
        throw new Error("Demand cost must be a valid number");
      }

      // 1) Insert bill (now with building_id + meter_id)
      const { data: billRow, error: billErr } = await supabase
        .from("bills")
        .insert({
          building_id: buildingId,
          meter_id: meterId,
          period_start: periodStart,
          period_end: periodEnd,
          total_cost: totalNum,
          demand_cost: demandNum,
        })
        .select("id")
        .limit(1)
        .maybeSingle();
      if (billErr) throw billErr;
      const billId = billRow?.id as string;
      if (!billId) throw new Error("Bill insert did not return an id");

      // 2) Insert usage
      const { error: usageErr } = await supabase
        .from("usage_readings")
        .insert({ bill_id: billId, usage_kwh: kwhNum });
      if (usageErr) throw usageErr;

      setToast("Bill saved ✅");
      setTimeout(() => router.push(`/buildings/${buildingId}`), 700);
    } catch (e: any) {
      setError(e?.message || "Unable to save bill");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Head>
        <title>Manual Bill Entry</title>
      </Head>
      <main className="mx-auto max-w-3xl p-4">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Manual Bill Entry</h1>
          <Link href="/dashboard" className="text-sm underline">Back to dashboard</Link>
        </div>

        {loading && <p>Loading…</p>}
        {error && (
          <div className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-red-800">{error}</div>
        )}
        {toast && (
          <div className="mb-4 rounded-md border border-green-300 bg-green-50 p-3 text-green-800">{toast}</div>
        )}

        {!loading && (
          <form onSubmit={onSubmit} className="space-y-6">
            {/* Organization (optional narrowing) */}
            <div className="grid gap-2">
              <label className="text-sm font-medium">Organization</label>
              <select
                value={organizationId || ""}
                onChange={(e) => setOrganizationId(e.target.value || undefined)}
                className="rounded-md border p-2"
              >
                <option value="">All</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>{o.name || o.id}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500">RLS will still enforce membership.</p>
            </div>

            {/* Building */}
            <div className="grid gap-2">
              <label className="text-sm font-medium">Building</label>
              <select
                required
                value={buildingId || ""}
                onChange={(e) => setBuildingId(e.target.value || undefined)}
                className="rounded-md border p-2"
              >
                <option value="" disabled>Select a building…</option>
                {orgBuildings.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            {/* Meter */}
            <div className="grid gap-2">
              <label className="text-sm font-medium">Meter</label>
              <select
                required
                value={meterId || ""}
                onChange={(e) => setMeterId(e.target.value || undefined)}
                className="rounded-md border p-2"
              >
                <option value="" disabled>Select a meter…</option>
                {meterOptions.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500">A default electric meter is auto-created when you add a building.</p>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Period start</label>
                <input type="date" required value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="rounded-md border p-2" />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Period end</label>
                <input type="date" required value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="rounded-md border p-2" />
              </div>
            </div>

            {/* Numbers */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Usage (kWh)</label>
                <input inputMode="decimal" pattern="[0-9,.]*" placeholder="e.g. 125,000" required value={usageKwh} onChange={(e) => setUsageKwh(e.target.value)} className="rounded-md border p-2" />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Total cost ($)</label>
                <input inputMode="decimal" pattern="[0-9,.]*" placeholder="e.g. 14,375.00" required value={totalCost} onChange={(e) => setTotalCost(e.target.value)} className="rounded-md border p-2" />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Demand cost ($) – optional</label>
                <input inputMode="decimal" pattern="[0-9,.]*" placeholder="e.g. 2,150.00" value={demandCost} onChange={(e) => setDemandCost(e.target.value)} className="rounded-md border p-2" />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button type="submit" disabled={saving} className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-50">{saving ? "Saving…" : "Save bill"}</button>
              {buildingId && <Link href={`/buildings/${buildingId}`} className="text-sm underline">Cancel</Link>}
            </div>

            <p className="text-xs text-gray-500">This page writes to <code>bills</code> (with <code>building_id</code>, <code>meter_id</code>) and then <code>usage_readings</code> (with <code>bill_id</code>, <code>usage_kwh</code>).</p>
          </form>
        )}
      </main>
    </>
  );
}
