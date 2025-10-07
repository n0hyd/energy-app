import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { createClient } from "@supabase/supabase-js";

/**
 * Manual Bill Entry (Month/Year version)
 * - User selects Month + Year; we persist period_start = YYYY-MM-01 and period_end = last day of that month.
 * - Electric path: inserts bills (+ optional demand_cost) and usage_readings.usage_kwh
 * - Gas path: accepts MCF or MMBtu; ensures a GAS meter exists; stores usage_readings.usage_mmbtu
 *
 * NOTE: Requires usage_readings.usage_mmbtu (see SQL snippet below if you don’t have it yet).
 */

// ---- Supabase client ----
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ---- Types ----
type Org = { id: string; name: string | null };
type Building = { id: string; name: string; org_id: string };
type Meter = { id: string; building_id: string; type: string | null; utility?: string | null };
type MeterOption = { id: string; label: string; building_id: string };
type UtilityType = "electric" | "gas";
type GasUnit = "MCF" | "MMBtu";

// Conversion: 1 MCF ≈ 1.037 MMBtu
const MMBTU_PER_MCF = 1.037;

// Month/Year helpers
const MONTHS = [
  { label: "January", value: 0 },
  { label: "February", value: 1 },
  { label: "March", value: 2 },
  { label: "April", value: 3 },
  { label: "May", value: 4 },
  { label: "June", value: 5 },
  { label: "July", value: 6 },
  { label: "August", value: 7 },
  { label: "September", value: 8 },
  { label: "October", value: 9 },
  { label: "November", value: 10 },
  { label: "December", value: 11 }
];

const YEARS = Array.from({ length: 2034 - 2024 + 1 }, (_, i) => 2024 + i);

function firstDayOfMonthISO(year: number, monthIndex: number) {
  const d = new Date(Date.UTC(year, monthIndex, 1));
  return d.toISOString().slice(0, 10);
}
function lastDayOfMonthISO(year: number, monthIndex: number) {
  // day=0 of next month = last day of requested month
  const d = new Date(Date.UTC(year, monthIndex + 1, 0));
  return d.toISOString().slice(0, 10);
}

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

  // Utility toggle — default to electric
  const [utility, setUtility] = useState<UtilityType>("electric");

  // Meter selection (electric only)
  const [meterId, setMeterId] = useState<string | undefined>(qMeter);

  // Month/Year (replaces date inputs)
  const now = new Date();
  const [monthIndex, setMonthIndex] = useState<number>(now.getUTCMonth());
  const [year, setYear] = useState<number>(Math.min(Math.max(now.getUTCFullYear(), 2024), 2034));

  // Electric inputs
  const [usageKwh, setUsageKwh] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [demandCost, setDemandCost] = useState("");

  // Gas inputs
  const [gasUnit, setGasUnit] = useState<GasUnit>("MCF");
  const [usageGas, setUsageGas] = useState("");
  const [totalCostGas, setTotalCostGas] = useState("");

  // Derived meter options respecting the selected building
  const meterOptions: MeterOption[] = useMemo(() => {
    return meters
      .filter((m) => (buildingId ? m.building_id === buildingId : true))
      .map((m) => ({
        id: m.id,
        building_id: m.building_id,
        label: `${m.type || "electric"} • ${m.id.slice(0, 6)}`
      }));
  }, [meters, buildingId]);

  // Buildings filtered by organization (optional narrowing)
  const orgBuildings = useMemo(() => {
    if (!organizationId) return buildings;
    return buildings.filter((b) => b.org_id === organizationId);
  }, [buildings, organizationId]);

  // Bootstrap: auth + orgs + buildings + meters
  useEffect(() => {
    if (!router.isReady) return;
    const init = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) {
          const next = encodeURIComponent(router.asPath || "/bills/manual-entry");
          await router.replace(`/auth/sign-in?redirect=${next}`);
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
          .select("id,building_id,type,utility")
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
  }, [router.isReady]);

  // Helpers
  const parseNum = (v: string) => {
    const n = parseFloat(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : NaN;
  };

  const ensureGasMeter = async (bId: string): Promise<string> => {
    const existing =
      meters.find((m) => m.building_id === bId && (m.utility === "gas" || m.type === "gas")) || null;

    if (existing) return existing.id;

    const { data, error } = await supabase
      .from("meters")
      .insert({
        building_id: bId,
        type: "gas",
        utility: "gas",
        label: "GAS"
      })
      .select("id")
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data?.id) throw new Error("Failed to create gas meter");

    const { data: meterRows } = await supabase
      .from("meters")
      .select("id,building_id,type,utility")
      .order("id", { ascending: true });
    setMeters(meterRows || []);

    return data.id as string;
  };

  // Submit handlers
  const saveElectric = async (periodStartISO: string, periodEndISO: string) => {
    if (!buildingId) throw new Error("Choose a building");
    if (!meterId) throw new Error("Choose a meter");

    const kwhNum = parseNum(usageKwh);
    const totalNum = parseNum(totalCost);
    const demandNum = demandCost ? parseNum(demandCost) : null;

    if (!isFinite(kwhNum) || kwhNum <= 0) throw new Error("Usage (kWh) must be a positive number");
    if (!isFinite(totalNum) || totalNum < 0) throw new Error("Total cost must be a valid number");
    if (demandCost && (!isFinite(demandNum as number) || (demandNum as number) < 0)) {
      throw new Error("Demand cost must be a valid number");
    }

    const { data: billRow, error: billErr } = await supabase
      .from("bills")
      .insert({
        building_id: buildingId,
        meter_id: meterId,
        period_start: periodStartISO,
        period_end: periodEndISO,
        total_cost: totalNum,
        demand_cost: demandNum
      })
      .select("id")
      .limit(1)
      .maybeSingle();
    if (billErr) throw billErr;

    const billId = billRow?.id as string;
    if (!billId) throw new Error("Bill insert did not return an id");

    const { error: usageErr } = await supabase
      .from("usage_readings")
      .insert({ bill_id: billId, usage_kwh: kwhNum });
    if (usageErr) throw usageErr;

    return billId;
  };

  const saveGas = async (periodStartISO: string, periodEndISO: string) => {
    if (!buildingId) throw new Error("Choose a building");

    const usageNum = parseNum(usageGas);
    const totalNum = parseNum(totalCostGas);

    if (!isFinite(usageNum) || usageNum <= 0)
      throw new Error(`Usage (${gasUnit}) must be a positive number`);
    if (!isFinite(totalNum) || totalNum < 0) throw new Error("Total cost must be a valid number");

    const usageMMBtu = gasUnit === "MCF" ? usageNum * MMBTU_PER_MCF : usageNum;
    const gasMeterId = await ensureGasMeter(buildingId);

    const { data: billRow, error: billErr } = await supabase
      .from("bills")
      .insert({
        building_id: buildingId,
        meter_id: gasMeterId,
        period_start: periodStartISO,
        period_end: periodEndISO,
        total_cost: totalNum,
        demand_cost: null
      })
      .select("id")
      .limit(1)
      .maybeSingle();
    if (billErr) throw billErr;

    const billId = billRow?.id as string;
    if (!billId) throw new Error("Bill insert did not return an id");

    const { error: usageErr } = await supabase
      .from("usage_readings")
      .insert({ bill_id: billId, usage_mmbtu: usageMMBtu });
    if (usageErr) throw usageErr;

    return billId;
  };

  // Unified submit
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setToast(null);

    try {
      if (year < 2024 || year > 2034) throw new Error("Choose a year between 2024 and 2034");

      const periodStartISO = firstDayOfMonthISO(year, monthIndex);
      const periodEndISO = lastDayOfMonthISO(year, monthIndex);

      const billId =
        utility === "electric"
          ? await saveElectric(periodStartISO, periodEndISO)
          : await saveGas(periodStartISO, periodEndISO);

      if (!billId) throw new Error("Save did not return a bill id");

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
          <Link href="/dashboard" className="text-sm underline">
            Back to dashboard
          </Link>
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
                  <option key={o.id} value={o.id}>
                    {o.name || o.id}
                  </option>
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
                <option value="" disabled>
                  Select a building…
                </option>
                {orgBuildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Utility toggle */}
            <div className="grid gap-2">
              <label className="text-sm font-medium">Utility</label>
              <div className="inline-flex overflow-hidden rounded-md border">
                <button
                  type="button"
                  onClick={() => setUtility("electric")}
                  className={`px-3 py-2 text-sm ${
                    utility === "electric" ? "bg-black text-white" : "bg-white"
                  }`}
                >
                  Electric
                </button>
                <button
                  type="button"
                  onClick={() => setUtility("gas")}
                  className={`px-3 py-2 text-sm ${
                    utility === "gas" ? "bg-black text-white" : "bg-white"
                  }`}
                >
                  Gas
                </button>
              </div>
              <p className="text-xs text-gray-500">
                Electric uses kWh (and optional demand). Gas accepts MCF or MMBtu and stores MMBtu.
              </p>
            </div>

            {/* Meter (Electric only) */}
            {utility === "electric" && (
              <div className="grid gap-2">
                <label className="text-sm font-medium">Meter</label>
                <select
                  required
                  value={meterId || ""}
                  onChange={(e) => setMeterId(e.target.value || undefined)}
                  className="rounded-md border p-2"
                >
                  <option value="" disabled>
                    Select a meter…
                  </option>
                  {meterOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500">
                  A default electric meter is auto-created when you add a building.
                </p>
              </div>
            )}

            {/* Month / Year */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Bill month</label>
                <select
                  required
                  value={monthIndex}
                  onChange={(e) => setMonthIndex(parseInt(e.target.value, 10))}
                  className="rounded-md border p-2"
                >
                  {MONTHS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500">We’ll set start to the 1st and end to the last day.</p>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Bill year</label>
                <select
                  required
                  value={year}
                  onChange={(e) => setYear(parseInt(e.target.value, 10))}
                  className="rounded-md border p-2"
                >
                  {YEARS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Numbers — Electric */}
            {utility === "electric" && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Usage (kWh)</label>
                  <input
                    inputMode="decimal"
                    pattern="[0-9,.]*"
                    placeholder="e.g. 125,000"
                    required
                    value={usageKwh}
                    onChange={(e) => setUsageKwh(e.target.value)}
                    className="rounded-md border p-2"
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Total cost ($)</label>
                  <input
                    inputMode="decimal"
                    pattern="[0-9,.]*"
                    placeholder="e.g. 14,375.00"
                    required
                    value={totalCost}
                    onChange={(e) => setTotalCost(e.target.value)}
                    className="rounded-md border p-2"
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Demand cost ($) – optional</label>
                  <input
                    inputMode="decimal"
                    pattern="[0-9,.]*"
                    placeholder="e.g. 2,150.00"
                    value={demandCost}
                    onChange={(e) => setDemandCost(e.target.value)}
                    className="rounded-md border p-2"
                  />
                </div>
              </div>
            )}

            {/* Numbers — Gas */}
            {utility === "gas" && (
              <>
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900 text-sm">
                  Enter gas usage in either <strong>MCF</strong> or <strong>MMBtu</strong>. The system will store
                  MMBtu. A gas meter is created/used automatically for this building.
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Gas unit</label>
                    <select
                      value={gasUnit}
                      onChange={(e) => setGasUnit(e.target.value as GasUnit)}
                      className="rounded-md border p-2"
                    >
                      <option value="MCF">MCF</option>
                      <option value="MMBtu">MMBtu</option>
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Usage ({gasUnit})</label>
                    <input
                      inputMode="decimal"
                      pattern="[0-9,.]*"
                      placeholder={gasUnit === "MCF" ? "e.g. 8.0" : "e.g. 8.3"}
                      required
                      value={usageGas}
                      onChange={(e) => setUsageGas(e.target.value)}
                      className="rounded-md border p-2"
                    />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Total cost ($)</label>
                    <input
                      inputMode="decimal"
                      pattern="[0-9,.]*"
                      placeholder="e.g. 74.80"
                      required
                      value={totalCostGas}
                      onChange={(e) => setTotalCostGas(e.target.value)}
                      className="rounded-md border p-2"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500">Conversion used: 1 MCF ≈ 1.037 MMBtu.</p>
              </>
            )}

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save bill"}
              </button>
              {buildingId && (
                <Link href={`/buildings/${buildingId}`} className="text-sm underline">
                  Cancel
                </Link>
              )}
            </div>

            <p className="text-xs text-gray-500">
              We persist <code>period_start</code> to the 1st and <code>period_end</code> to the last day of the
              selected month. Electric writes <code>usage_kwh</code>; gas writes <code>usage_mmbtu</code>.
            </p>
          </form>
        )}
      </main>
    </>
  );
}
