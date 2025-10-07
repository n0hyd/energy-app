import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function ManualEntry() {
  const router = useRouter();
  const { id } = router.query; // bill_upload_id

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [buildingId, setBuildingId] = useState<string | null>(null);

  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [usageKwh, setUsageKwh] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [demandCost, setDemandCost] = useState(""); // optional portion of the bill attributed to demand

  // Load upload + resolve buildingId via bill_uploads -> meters -> buildings
  useEffect(() => {
    if (!id || typeof id !== "string") return;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        // Get upload + join to meter to find building
        const { data: upload, error: uErr } = await supabase
          .from("bill_uploads")
          .select("id, status, meter:meter_id ( id, building:building_id ( id ) )")
          .eq("id", id)
          .maybeSingle();
        if (uErr) throw uErr;
        if (!upload) {
          setError("Upload not found or access denied.");
          return;
        }
        const bId = upload?.meter?.building?.id ?? null;
        if (!bId) {
          setError("Could not resolve building for this upload.");
          return;
        }
        setBuildingId(bId);
      } catch (e: any) {
        setError(e.message ?? "Unexpected error.");
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [id]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || typeof id !== "string") return;

    setError(null);
    setSuccess(false);

    // client-side sanity: demandCost must be <= totalCost (when both provided)
    const total = totalCost === "" ? null : Number(totalCost);
    const demand = demandCost === "" ? null : Number(demandCost);
    if (total != null && demand != null && demand > total) {
      setError("Demand portion cannot exceed total cost.");
      return;
    }

    try {
      const { data: bill, error: billErr } = await supabase
        .from("bills")
        .insert({
          bill_upload_id: id,
          period_start: periodStart,
          period_end: periodEnd,
          total_cost: total,
          demand_cost: demand,
        })
        .select("id")
        .single();

      if (billErr) throw billErr;

      const { error: usageErr } = await supabase.from("usage_readings").insert({
        bill_id: bill.id,
        usage_kwh: Number(usageKwh),
      });
      if (usageErr) throw usageErr;

      await supabase.from("bill_uploads").update({ status: "entered" }).eq("id", id);

      setSuccess(true);
      setPeriodStart("");
      setPeriodEnd("");
      setUsageKwh("");
      setTotalCost("");
      setDemandCost("");

      // Redirect back to building page with flash param
      if (buildingId) {
        setTimeout(() => {
          router.push(`/buildings/${buildingId}?saved=1`);
        }, 2500);
      }
    } catch (e: any) {
      setError(e.message ?? "Failed to save bill.");
    }
  };

  if (loading) return <p className="p-8">Loading…</p>;

  return (
    <div className="p-8 max-w-xl">
      <h1 className="text-2xl font-bold mb-6">Enter Bill Details</h1>

      {success && (
        <div className="mb-4 rounded-lg bg-emerald-100 text-emerald-800 px-4 py-2 text-sm">
          ✅ Bill saved successfully! Redirecting…
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium">Billing period start</label>
          <input
            type="date"
            className="mt-1 w-full rounded-lg border p-2"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Billing period end</label>
          <input
            type="date"
            className="mt-1 w-full rounded-lg border p-2"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Usage (kWh)</label>
          <input
            type="number"
            min="0"
            step="0.001"
            className="mt-1 w-full rounded-lg border p-2"
            value={usageKwh}
            onChange={(e) => setUsageKwh(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Total cost ($)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            className="mt-1 w-full rounded-lg border p-2"
            value={totalCost}
            onChange={(e) => setTotalCost(e.target.value)}
            placeholder="Optional"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Demand portion ($)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            className="mt-1 w-full rounded-lg border p-2"
            value={demandCost}
            onChange={(e) => setDemandCost(e.target.value)}
            placeholder="Optional — part of total cost"
          />
        </div>

        {error && <p className="text-sm text-rose-700">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white shadow hover:shadow-md text-sm"
          >
            Save bill
          </button>
          <button
            type="button"
            onClick={() => (buildingId ? router.push(`/buildings/${buildingId}`) : router.back())}
            className="px-4 py-2 rounded-xl bg-white border shadow text-sm"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
