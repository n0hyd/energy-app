// src/pages/bills/manual-entry.tsx
import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useAuthGate } from "@/hooks/useAuthGate";
import { supabase } from "@/lib/supabaseClient";

// --- Types (align with your schema) ---
interface Building { id: string; name: string }
interface Meter { id: string; utility: "electric" | "gas" | "water"; building_id: string }

export default function ManualEntryPage() {
  // Gate: require session; redirect handled inside the hook
  const { loading, session } = useAuthGate(true);
  if (loading) return <p>Loading…</p>;
  // session is guaranteed or we were redirected

  const [buildings, setBuildings] = useState<Building[]>([]);
  const [meters, setMeters] = useState<Meter[]>([]);

  const [buildingId, setBuildingId] = useState("");
  const [utilityChoice, setUtilityChoice] = useState<"" | "electric" | "gas">("");
  const [meterId, setMeterId] = useState("");

  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [totalCost, setTotalCost] = useState<string>("");

  const [usageKwh, setUsageKwh] = useState<string>("");
  const [usageTherms, setUsageTherms] = useState<string>("");
  const [usageMcf, setUsageMcf] = useState<string>("");
  const [usageMmbtu, setUsageMmbtu] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  // Load buildings + meters
  useEffect(() => {
    (async () => {
      const [bldg, mtrs] = await Promise.all([
        supabase.from("buildings").select("id,name").order("name"),
        supabase.from("meters").select("id,utility,building_id").order("utility"),
      ]);
      setBuildings(bldg.data ?? []);
      setMeters(mtrs.data ?? []);
    })();
  }, []);

  // Meters for selected building and utility
  const buildingMeters = meters.filter((m) => m.building_id === buildingId);
  const utilityMeters = buildingMeters.filter((m) => !utilityChoice || m.utility === utilityChoice);

  // Reset meter when building or utility changes; autoselect if exactly one
  useEffect(() => {
    if (utilityMeters.length === 1) {
      setMeterId(utilityMeters[0].id);
    } else {
      setMeterId("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildingId, utilityChoice, utilityMeters.length]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccessId(null);

    try {
      if (!buildingId) throw new Error("Select a building");
      if (!utilityChoice) throw new Error("Choose Electric or Gas");
      if (!meterId) {
        if (utilityMeters.length === 0) throw new Error("No meters for that utility in this building");
        throw new Error("Select a meter");
      }
      if (!periodStart || !periodEnd) throw new Error("Enter billing period");
      if (totalCost === "") throw new Error("Enter total cost");

      // Create bill
      const billIns = await supabase
        .from("bills")
        .insert({
          building_id: buildingId,
          meter_id: meterId,
          period_start: periodStart,
          period_end: periodEnd,
          total_cost: Number(totalCost),
        })
        .select("id")
        .single();
      if (billIns.error) throw billIns.error;
      const billId = billIns.data.id as string;

      // Create usage row (store whichever fields were provided)
      const payload: Record<string, any> = { bill_id: billId };
      if (utilityChoice === "electric") {
        if (usageKwh !== "") payload.usage_kwh = Number(usageKwh);
      } else {
        if (usageTherms !== "") payload.therms = Number(usageTherms);
        if (usageMcf !== "") payload.usage_mcf = Number(usageMcf);
        if (usageMmbtu !== "") payload.usage_mmbtu = Number(usageMmbtu);
      }

      const usageIns = await supabase.from("usage_readings").insert(payload).select("id").single();
      if (usageIns.error) throw usageIns.error;

      setSuccessId(billId);
      // Clear the form (keep building + chosen utility for fast entry)
      setTotalCost("");
      setPeriodStart("");
      setPeriodEnd("");
      setUsageKwh("");
      setUsageTherms("");
      setUsageMcf("");
      setUsageMmbtu("");
    } catch (err: any) {
      setError(err.message ?? String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const isElectric = utilityChoice === "electric";

  return (
    <>
      <Head><title>New Bill</title></Head>
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Add Bill</h1>
          <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">Back to Dashboard</Link>
        </div>

        <form onSubmit={onSubmit} className="card p-5 grid gap-5 max-w-3xl">
          {/* Building */}
          <div className="grid gap-1">
            <label className="text-sm font-medium">Building</label>
            <select
              className="rounded-lg border-gray-300"
              value={buildingId}
              onChange={(e) => setBuildingId(e.target.value)}
              required
            >
              <option value="">Select building…</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          {/* Utility choice (segmented buttons) */}
          <div className="grid gap-2">
            <label className="text-sm font-medium">Utility</label>
            <div className="inline-flex rounded-xl bg-gray-100 p-1">
              {(["electric","gas"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUtilityChoice(u)}
                  className={`px-4 py-1.5 text-sm font-medium rounded-lg ${
                    utilityChoice === u ? "bg-white shadow border border-gray-200" : "text-gray-600"
                  }`}
                >
                  {u === "electric" ? "Electric" : "Gas"}
                </button>
              ))}
            </div>
            {!utilityChoice && (
              <p className="text-xs text-gray-500">Choose Electric or Gas.</p>
            )}
          </div>

          {/* Meter selection (only if multiple for that utility) */}
          {utilityChoice && (
            <div className="grid gap-1">
              <label className="text-sm font-medium">Meter</label>
              {utilityMeters.length <= 1 ? (
                <p className="text-xs text-gray-500">
                  {utilityMeters.length === 1
                    ? "Auto-selected the only meter for this utility in this building."
                    : "No meters found for this utility in this building."}
                </p>
              ) : (
                <select
                  className="rounded-lg border-gray-300"
                  value={meterId}
                  onChange={(e) => setMeterId(e.target.value)}
                  required
                >
                  <option value="">Select meter…</option>
                  {utilityMeters.map((m) => (
                    <option key={m.id} value={m.id}>{m.utility}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Period */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="grid gap-1">
              <label className="text-sm font-medium">Period start</label>
              <input type="date" className="rounded-lg border-gray-300" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} required />
            </div>
            <div className="grid gap-1">
              <label className="text-sm font-medium">Period end</label>
              <input type="date" className="rounded-lg border-gray-300" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} required />
            </div>
          </div>

          {/* Cost */}
          <div className="grid gap-1">
            <label className="text-sm font-medium">Total cost ($)</label>
            <input type="number" step="0.01" min="0" className="rounded-lg border-gray-300" value={totalCost} onChange={(e) => setTotalCost(e.target.value)} required />
          </div>

          {/* Usage inputs */}
          <div className="grid gap-2">
            <div className="text-sm font-medium">Usage</div>
            {isElectric ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="grid gap-1">
                  <label className="text-xs text-gray-600">kWh</label>
                  <input type="number" step="0.001" min="0" className="rounded-lg border-gray-300" value={usageKwh} onChange={(e) => setUsageKwh(e.target.value)} />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="grid gap-1">
                  <label className="text-xs text-gray-600">Therms</label>
                  <input type="number" step="0.001" min="0" className="rounded-lg border-gray-300" value={usageTherms} onChange={(e) => setUsageTherms(e.target.value)} />
                </div>
                <div className="grid gap-1">
                  <label className="text-xs text-gray-600">MCF</label>
                  <input type="number" step="0.001" min="0" className="rounded-lg border-gray-300" value={usageMcf} onChange={(e) => setUsageMcf(e.target.value)} />
                </div>
                <div className="grid gap-1">
                  <label className="text-xs text-gray-600">MMBtu</label>
                  <input type="number" step="0.001" min="0" className="rounded-lg border-gray-300" value={usageMmbtu} onChange={(e) => setUsageMmbtu(e.target.value)} />
                </div>
              </div>
            )}
            <p className="text-xs text-gray-500">Enter whichever unit the bill provides. Leave others blank.</p>
          </div>

          {error && <div className="text-sm text-rose-600">{error}</div>}
          {successId && (
            <div className="text-sm text-green-700">Saved! Bill ID: <code className="bg-green-50 px-1 rounded">{successId}</code></div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Saving…" : "Save Bill"}
            </button>
            <Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-800">Cancel</Link>
          </div>
        </form>
      </main>
    </>
  );
}
