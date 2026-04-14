// src/pages/buildings/[id].tsx

import { useRouter } from "next/router";
import * as React from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Zap,
  Flame,
  Activity,
  DollarSign,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

/* ------------ Types (same as before, but no form types) ------------ */
type Building = {
  id: string;
  name: string;

  address: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  state_code: string | null;
  postal_code: string | null;

  square_feet: number | null;
  activity_code: string | null;

  hours_of_operation: number | null;
  number_of_students: number | null;
  number_of_staff: number | null;
  year_built: number | null;
};

type Meter = {
  id: string;
  building_id: string;
  utility: "electric" | "gas";
  type: string | null;
  label: string | null;
  created_at: string | null;
};

type Bill = {
  id: string;
  bill_upload_id: string | null;
  period_start: string;
  period_end: string;
  total_cost: number | null;
  demand_cost: number | null;
  building_id: string;
  meter_id: string;
  created_at: string;
  utility_provider: string | null;
};

type UsageReading = {
  id: string;
  bill_id: string;
  usage_kwh: number | null;
  therms: number | null;
  usage_mcf: number | null;
  usage_mmbtu: number | null;
};

type BillWithUsage = Bill & {
  usage?: UsageReading | null;
  meter?: Meter | null;
  bill_month?: string;
};

type BillMonth = { bill_month: string };

/* ---- Helpers ---- */
function fmtMonth(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short" });
}
function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString();
}
function num(n: number | null | undefined, frac = 2): string {
  if (n == null) return "—";
  return Number(n).toLocaleString(undefined, {
    minimumFractionDigits: frac,
    maximumFractionDigits: frac,
  });
}

// Convert bill periods → bill_month (keep same logic you already use)
function billMonthFromPeriod(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const mid = new Date((s.getTime() + e.getTime()) / 2);
  return `${mid.getUTCFullYear()}-${String(mid.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}-01`;
}

/* ---- Provider Bills Table (unchanged) ---- */
function ProviderBillsTable({
  provider,
  rows,
  months,
}: {
  provider: string;
  rows: BillWithUsage[];
  months: BillMonth[];
}) {
  const byMonth = React.useMemo(() => {
    const map = new Map<string, BillWithUsage[]>();
    for (const b of rows) {
      const key = b.bill_month!;
      const arr = map.get(key) || [];
      arr.push(b);
      map.set(key, arr);
    }
    return map;
  }, [rows]);

  return (
    <div className="mt-8">
      <h3 className="text-base font-semibold text-slate-900">{provider}</h3>
      <p className="mt-1 text-sm text-slate-600">
        Sorted by bill month (oldest → newest).
      </p>

      <div className="mt-4 overflow-x-auto overflow-y-auto max-h-[70vh] rounded-lg border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium">Bill Month</th>
              <th className="px-3 py-2 text-left text-xs font-medium">Type</th>
              <th className="px-3 py-2 text-left text-xs font-medium">Meter</th>
              <th className="px-3 py-2 text-left text-xs font-medium">Period</th>
              <th className="px-3 py-2 text-left text-xs font-medium">Usage</th>
              <th className="px-3 py-2 text-right text-xs font-medium">Total</th>
              <th className="px-3 py-2 text-right text-xs font-medium">Demand $</th>
            </tr>
          </thead>

          <tbody className="bg-white divide-y divide-slate-200">
            {months.map(({ bill_month }) => {
              const billsForMonth = byMonth.get(bill_month) || [];

              if (billsForMonth.length === 0) {
                return (
                  <tr key={bill_month} className="bg-amber-50">
                    <td className="px-3 py-2 text-sm font-medium">
                      {fmtMonth(bill_month)}
                    </td>
                    <td className="px-3 py-2 text-sm">—</td>
                    <td className="px-3 py-2 text-sm">—</td>
                    <td className="px-3 py-2 text-sm">—</td>
                    <td className="px-3 py-2 text-sm">Missing</td>
                    <td className="px-3 py-2 text-sm text-right">—</td>
                    <td className="px-3 py-2 text-sm text-right">—</td>
                  </tr>
                );
              }

              return billsForMonth.map((b) => {
                const meterType =
                  (b.meter?.type as "electric" | "gas") ??
                  (b.usage?.usage_kwh != null ? "electric" : "gas");

                let usageStr = "—";
                if (meterType === "electric") {
                  usageStr =
                    b.usage?.usage_kwh != null
                      ? `${num(b.usage.usage_kwh, 0)} kWh`
                      : "—";
                } else {
                  const u =
                    b.usage?.usage_mcf ??
                    b.usage?.usage_mmbtu ??
                    b.usage?.therms ??
                    null;
                  usageStr = u != null ? `${num(u, 2)}` : "—";
                }

                return (
                  <tr key={b.id}>
                    <td className="px-3 py-2 text-sm">{fmtMonth(bill_month)}</td>
                    <td className="px-3 py-2 text-sm capitalize">{meterType}</td>
                    <td className="px-3 py-2 text-sm">
                      {b.meter?.label || b.meter?.id || "—"}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      {fmtDate(b.period_start)} → {fmtDate(b.period_end)}
                    </td>
                    <td className="px-3 py-2 text-sm">{usageStr}</td>
                    <td className="px-3 py-2 text-sm text-right">
                      {num(b.total_cost, 2)}
                    </td>
                    <td className="px-3 py-2 text-sm text-right">
                      {num(b.demand_cost, 2)}
                    </td>
                  </tr>
                );
              });
            })}

            {months.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-3 text-slate-500">
                  No bills for {provider}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- Page ---------------- */
export default function BuildingViewPage() {
  const router = useRouter();
  const { id } = router.query;

  const [building, setBuilding] = React.useState<Building | null>(null);

  const [meters, setMeters] = React.useState<Meter[]>([]);
  const [bills, setBills] = React.useState<BillWithUsage[]>([]);
  const [billMonths, setBillMonths] = React.useState<BillMonth[]>([]);
  const [loadingBills, setLoadingBills] = React.useState(true);
  const [billsErr, setBillsErr] = React.useState<string | null>(null);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  /* ---- Load building ---- */
  React.useEffect(() => {
    if (!id) return;

    (async () => {
      const { data, error } = await supabase
        .from("buildings")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        setError(error.message);
      } else {
        setBuilding(data as Building);
      }
      setLoading(false);
    })();
  }, [id]);

  /* ---- Load bills (unchanged from your original flow) ---- */
  React.useEffect(() => {
    if (!id) return;

    let aborted = false;

    (async () => {
      setLoadingBills(true);

      try {
        // 1) Load meters
        const { data: meterRows, error: mErr } = await supabase
          .from("meters")
          .select("*")
          .eq("building_id", id);

        if (mErr) throw mErr;
        const mtrs = (meterRows || []) as Meter[];
        if (aborted) return;
        setMeters(mtrs);

        const meterIds = mtrs.map((m) => m.id);
        if (meterIds.length === 0) {
          setBills([]);
          setBillMonths([]);
          setLoadingBills(false);
          return;
        }

        // 2) Bills
        const { data: billRows, error: bErr } = await supabase
          .from("bills")
          .select("*")
          .in("meter_id", meterIds)
          .order("period_start", { ascending: true });

        if (bErr) throw bErr;

        const billsRaw = (billRows || []) as Bill[];

        // 3) Usage readings
        const billIds = billsRaw.map((b) => b.id);
        const usageMap = new Map<string, UsageReading>();

        if (billIds.length > 0) {
          const { data: usageRows, error: uErr } = await supabase
            .from("usage_readings")
            .select("*")
            .in("bill_id", billIds);

          if (uErr) throw uErr;
          for (const u of (usageRows || []) as UsageReading[]) {
            usageMap.set(u.bill_id, u);
          }
        }

        // 4) Merge
        const meterMap = new Map(mtrs.map((m) => [m.id, m]));

        const merged = billsRaw.map((b) => ({
          ...b,
          usage: usageMap.get(b.id) || null,
          meter: meterMap.get(b.meter_id) || null,
          bill_month: billMonthFromPeriod(b.period_start, b.period_end),
        }));

        // Build month range
        const monthsSet = Array.from(
          new Set(merged.map((b) => b.bill_month!))
        ).sort();

        const months: BillMonth[] = monthsSet.map((m) => ({
          bill_month: m,
        }));

        if (aborted) return;

        setBills(merged);
        setBillMonths(months);
      } catch (err: any) {
        if (!aborted) setBillsErr(err.message);
      } finally {
        if (!aborted) setLoadingBills(false);
      }
    })();

    return () => {
      aborted = true;
    };
  }, [id]);

  /* ---- UI States ---- */
  if (loading) return <div className="p-6">Loading…</div>;
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;
  if (!building) return <div className="p-6">No building found.</div>;

  /* ---------------- RENDER PAGE ---------------- */
  return (
    <div className="p-6">
      <div className="mx-auto max-w-5xl">
        {/* HEADER */}
        <div className="mb-6 flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {building.name}
            </h1>

            <p className="mt-1 text-slate-600">
              {building.address}
              {building.city ? `, ${building.city}` : ""}
              {building.state_code ? `, ${building.state_code}` : ""}
              {building.postal_code ? ` ${building.postal_code}` : ""}
            </p>

            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-gray-500 uppercase">Sq Ft</p>
                <p className="text-sm font-semibold">
                  {building.square_feet?.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">Type</p>
                <p className="text-sm font-semibold">
                  {building.activity_code || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">Year Built</p>
                <p className="text-sm font-semibold">
                  {building.year_built || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">Staff</p>
                <p className="text-sm font-semibold">
                  {building.number_of_staff ?? "—"}
                </p>
              </div>
            </div>
          </div>

          {/* Edit Button */}
          <button
            onClick={() => router.push(`/buildings/${building.id}/edit`)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Edit Building
          </button>
        </div>

        {/* ----------- BILLS SECTION ----------- */}
        <div className="mt-12">
          <h2 className="text-lg font-semibold text-slate-900">Bills</h2>
          <p className="text-sm text-slate-600">
            One table per provider. Electric & gas combined with usage and cost.
          </p>

          {loadingBills ? (
            <div className="mt-4 text-sm text-slate-600">Loading bills…</div>
          ) : billsErr ? (
            <div className="mt-4 text-red-600">{billsErr}</div>
          ) : (
            <>
              {Array.from(
                new Map(
                  bills.map((b) => [b.utility_provider ?? "Unknown", true])
                ).keys()
              ).map((provider) => {
                const providerRows = bills.filter(
                  (b) => (b.utility_provider ?? "Unknown") === provider
                );
                return (
                  <ProviderBillsTable
                    key={provider}
                    provider={provider}
                    rows={providerRows}
                    months={billMonths}
                  />
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
