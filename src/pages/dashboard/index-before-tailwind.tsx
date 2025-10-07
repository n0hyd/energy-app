// src/pages/dashboard/index.tsx
import { GetServerSidePropsContext } from "next";
import Link from "next/link";
import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

// Loose row shapes to avoid over-typing while MVP is moving fast
type Bill = {
  id: string;
  period_start: string;
  period_end: string;
  total_cost: number | null;
  demand_cost?: number | null;
  building_id?: string | null;
  meter_id?: string | null;
  // relationship paths for name + utility
  buildings?: { id: string; name: string } | null; // bills → buildings
  meters?: { utility?: string | null; buildings?: { id: string; name: string } | null } | null; // bills → meters → buildings
  bill_uploads?: {
    meters?: { utility?: string | null; buildings?: { id: string; name: string } | null } | null;
  } | null;
};

type SiteRow = {
  building_id?: string | null;
  building_name?: string | null;
  site_eui_kbtu_per_sf_actual?: number | null;
  expected_site_eui_kbtu_per_sf_mean?: number | null;
  expected_site_eui_kbtu_per_sf_p25?: number | null;
  expected_site_eui_kbtu_per_sf_p50?: number | null;
  expected_site_eui_kbtu_per_sf_p75?: number | null;
  site_cost_actual_all_in?: number | null;
  expected_site_cost_mean_all_in?: number | null;
  variance_site_eui_pct?: number | null; // mean-based from view (kept but not used for computed baseline)
  variance_site_cost_pct?: number | null;
};

type LatestBillRow = Bill & {
  building_name?: string | null;
  utility?: string | null;
  usage_kwh?: number | null;
  usage_therms?: number | null;
  usage_mcf?: number | null;
  usage_mmbtu?: number | null; // added support
};

type Props = {
  latestBills: LatestBillRow[];
  siteRows?: SiteRow[];
};

type Baseline = "mean" | "p25" | "p50" | "p75";

const isBaseline = (v: unknown): v is Baseline =>
  v === "mean" || v === "p25" || v === "p50" || v === "p75";

export default function DashboardPage({ latestBills, siteRows }: Props) {
  const router = useRouter();

  // --- Baseline state with session persistence & URL syncing ---
  const [baseline, setBaseline] = useState<Baseline>("mean");

  // Initialize from URL (?baseline=) then fall back to sessionStorage → "mean"
  useEffect(() => {
    let initial: Baseline = "mean";
    // 1) URL query
    const q = typeof router.query?.baseline === "string" ? router.query.baseline : null;
    if (q && isBaseline(q)) {
      initial = q;
    } else if (typeof window !== "undefined") {
      // 2) sessionStorage
      const saved = sessionStorage.getItem("dashboardBaseline");
      if (saved && isBaseline(saved)) initial = saved;
    }
    setBaseline(initial);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount (client-side)

  // When baseline changes: save to sessionStorage and update the URL (shallow)
  useEffect(() => {
    if (typeof window === "undefined") return;
    sessionStorage.setItem("dashboardBaseline", baseline);
    const { pathname, query } = router;
    const newQuery = { ...query, baseline };
    router.replace({ pathname, query: newQuery }, undefined, { shallow: true });
  }, [baseline, router]);

  // Helper: pull the selected expected EUI from a row
  const expectedFrom = (r: SiteRow) => {
    if (!r) return null;
    switch (baseline) {
      case "p25":
        return r.expected_site_eui_kbtu_per_sf_p25 ?? null;
      case "p50":
        return r.expected_site_eui_kbtu_per_sf_p50 ?? null;
      case "p75":
        return r.expected_site_eui_kbtu_per_sf_p75 ?? null;
      default:
        return r.expected_site_eui_kbtu_per_sf_mean ?? null;
    }
  };

  // Compute per-row variance vs selected baseline (don’t rely on variance_site_eui_pct, which is mean-based)
  const rowsWithComputedVariance = useMemo(() => {
    if (!Array.isArray(siteRows)) return [];
    return siteRows.map((r) => {
      const actual = r.site_eui_kbtu_per_sf_actual ?? null;
      const exp = expectedFrom(r);
      const variancePct =
        actual != null && exp != null && exp > 0 ? ((actual - exp) / exp) * 100 : null;
      return { ...r, _variance_vs_selected: variancePct as number | null };
    });
  }, [siteRows, baseline]);

  // District aggregate (unweighted) vs selected baseline
  const districtVariancePct = useMemo(() => {
    const actuals: number[] = [];
    const expecteds: number[] = [];
    for (const r of rowsWithComputedVariance) {
      const a = r.site_eui_kbtu_per_sf_actual ?? null;
      const e = expectedFrom(r);
      if (typeof a === "number" && typeof e === "number") {
        actuals.push(a);
        expecteds.push(e);
      }
    }
    if (!actuals.length || !expecteds.length) return null;
    const avg = (xs: number[]) => xs.reduce((p, c) => p + c, 0) / xs.length;
    return ((avg(actuals) - avg(expecteds)) / avg(expecteds)) * 100;
  }, [rowsWithComputedVariance, baseline]);

  // UI helper to style the baseline buttons
  const baseBtn = "btn px-3 py-1 text-sm";
  const isSel = (k: Baseline) =>
    baseline === k ? "bg-gray-900 text-white" : "bg-white text-gray-700 border";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="space-x-2">
          <Link href="/buildings" className="btn">
            Buildings
          </Link>
          <Link href="/uploads" className="btn">
            Uploads
          </Link>
        </div>
      </div>

      {/* Baseline selector (persists via sessionStorage + URL query) */}
      <div className="card p-3 flex items-center justify-between">
        <div className="text-sm text-gray-600">Expected baseline</div>
        <div className="flex gap-2">
          <button className={`${baseBtn} ${isSel("p25")}`} onClick={() => setBaseline("p25")}>
            P25
          </button>
          <button className={`${baseBtn} ${isSel("p50")}`} onClick={() => setBaseline("p50")}>
            P50
          </button>
          <button className={`${baseBtn} ${isSel("p75")}`} onClick={() => setBaseline("p75")}>
            P75
          </button>
          <button className={`${baseBtn} ${isSel("mean")}`} onClick={() => setBaseline("mean")}>
            Mean
          </button>
        </div>
      </div>

      {/* KPI cards (site-level) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Highest vs Expected EUI (selected baseline) */}
        <div className="card p-4">
          <div className="text-sm text-gray-500">Highest vs Expected EUI</div>
          <div className="mt-1 text-2xl font-bold">
            {(() => {
              const withVar = rowsWithComputedVariance.filter(
                (r) => typeof r._variance_vs_selected === "number"
              );
              if (withVar.length === 0) return "—";
              const worst = withVar.reduce((a, b) =>
                Number(a._variance_vs_selected) > Number(b._variance_vs_selected) ? a : b
              );
              return `${Number(worst._variance_vs_selected).toFixed(1)}%`;
            })()}
          </div>
          <div className="text-sm text-gray-600">
            {(() => {
              const withVar = rowsWithComputedVariance.filter(
                (r) => typeof r._variance_vs_selected === "number"
              );
              if (withVar.length === 0) return "";
              const worst = withVar.reduce((a, b) =>
                Number(a._variance_vs_selected) > Number(b._variance_vs_selected) ? a : b
              );
              return worst.building_name ?? "";
            })()}
          </div>
        </div>

        {/* Lowest vs Expected EUI (selected baseline) */}
        <div className="card p-4">
          <div className="text-sm text-gray-500">Lowest vs Expected EUI</div>
          <div className="mt-1 text-2xl font-bold">
            {(() => {
              const withVar = rowsWithComputedVariance.filter(
                (r) => typeof r._variance_vs_selected === "number"
              );
              if (withVar.length === 0) return "—";
              const best = withVar.reduce((a, b) =>
                Number(a._variance_vs_selected) < Number(b._variance_vs_selected) ? a : b
              );
              return `${Number(best._variance_vs_selected).toFixed(1)}%`;
            })()}
          </div>
          <div className="text-sm text-gray-600">
            {(() => {
              const withVar = rowsWithComputedVariance.filter(
                (r) => typeof r._variance_vs_selected === "number"
              );
              if (withVar.length === 0) return "";
              const best = withVar.reduce((a, b) =>
                Number(a._variance_vs_selected) < Number(b._variance_vs_selected) ? a : b
              );
              return best.building_name ?? "";
            })()}
          </div>
        </div>

        {/* District EUI vs Expected (unweighted, selected baseline) */}
        <div className="card p-4">
          <div className="text-sm text-gray-500">District Site EUI vs Expected</div>
          <div className="mt-1 text-2xl font-bold">
            {districtVariancePct == null ? "—" : `${districtVariancePct.toFixed(1)}%`}
          </div>
          <div className="text-sm text-gray-600">
            Unweighted • Using {baseline.toUpperCase()}
          </div>
        </div>
      </div>

      {/* Latest Bills Table */}
      <div className="card p-4">
        <h2 className="text-lg font-semibold mb-3">Latest Bills</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="px-4 py-2">Building</th>
                <th className="px-4 py-2">Utility</th>
                <th className="px-4 py-2">Billing Period</th>
                <th className="px-4 py-2">Usage</th>
                <th className="px-4 py-2">Total Cost ($)</th>
                <th className="px-4 py-2">$ / Unit</th>
              </tr>
            </thead>
            <tbody>
              {latestBills.map((b) => {
                // Resolve building name from any available path
                const buildingName =
                  b.building_name ??
                  b.buildings?.name ??
                  b.meters?.buildings?.name ??
                  b.bill_uploads?.meters?.buildings?.name ??
                  "—";

                // Normalize utility (case-insensitive, with fallbacks)
                const rawUtility =
                  b.utility ?? b.meters?.utility ?? b.bill_uploads?.meters?.utility ?? null;
                const utility = typeof rawUtility === "string" ? rawUtility.toLowerCase() : "";

                // Choose usage value + unit based on utility and available fields
                let usageVal: number | null = null;
                let usageUnit = "";

                if (utility === "gas") {
                  // Not standardizing—prefer what you likely store first
                  if (b.usage_therms != null) {
                    usageVal = Number(b.usage_therms);
                    usageUnit = "therms";
                  } else if (b.usage_mmbtu != null) {
                    usageVal = Number(b.usage_mmbtu);
                    usageUnit = "MMBtu";
                  } else if (b.usage_mcf != null) {
                    usageVal = Number(b.usage_mcf);
                    usageUnit = "MCF";
                  } else if (b.usage_kwh != null) {
                    // last-ditch fallback
                    usageVal = Number(b.usage_kwh);
                    usageUnit = "kWh";
                  }
                } else {
                  // default to electric
                  if (b.usage_kwh != null) {
                    usageVal = Number(b.usage_kwh);
                    usageUnit = "kWh";
                  } else if (b.usage_mmbtu != null) {
                    usageVal = Number(b.usage_mmbtu);
                    usageUnit = "MMBtu";
                  } else if (b.usage_therms != null) {
                    usageVal = Number(b.usage_therms);
                    usageUnit = "therms";
                  } else if (b.usage_mcf != null) {
                    usageVal = Number(b.usage_mcf);
                    usageUnit = "MCF";
                  }
                }

                const unitRate =
                  b.total_cost != null && usageVal != null && usageVal > 0
                    ? Number(b.total_cost) / usageVal
                    : null;

                return (
                  <tr key={b.id} className="border-b last:border-0">
                    <td className="px-4 py-3">{buildingName}</td>
                    <td className="px-4 py-3 capitalize">{utility || "—"}</td>
                    <td className="px-4 py-3">
                      {new Date(b.period_start).toLocaleDateString()} –{" "}
                      {new Date(b.period_end).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {usageVal != null
                        ? `${Math.round(usageVal).toLocaleString()} ${usageUnit}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {b.total_cost != null ? Number(b.total_cost).toFixed(2) : "—"}
                    </td>
                    <td className="px-4 py-3">{unitRate != null ? unitRate.toFixed(4) : "—"}</td>
                  </tr>
                );
              })}
              {latestBills.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-gray-500">
                    No bills yet. Add one from a building or the manual entry page.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Site EUI vs Expected (banded bars) */}
      {Array.isArray(siteRows) && siteRows.length > 0 && (
        <div className="card p-4">
          <h2 className="text-lg font-semibold mb-3">Site EUI vs Expected</h2>
          <div className="space-y-3">
            {siteRows.map((r, i) => {
              const actual = r.site_eui_kbtu_per_sf_actual ?? null;
              const p25 = r.expected_site_eui_kbtu_per_sf_p25 ?? null;
              const p50 = r.expected_site_eui_kbtu_per_sf_p50 ?? null;
              const p75 = r.expected_site_eui_kbtu_per_sf_p75 ?? null;
              const expSelected = expectedFrom(r);

              const values = [actual, p25, p50, p75].filter(
                (n): n is number => typeof n === "number"
              );
              const min = values.length ? Math.min(...values) : 0;
              const max = values.length ? Math.max(...values) : 100;
              const span = max - min || 1;
              const pct = (n: number | null) => (n == null ? 0 : ((n - min) / span) * 100);

              return (
                <div key={r.building_id ?? i}>
                  <div className="flex items-baseline justify-between">
                    <div className="font-medium">{r.building_name ?? "—"}</div>
                    <div className="text-sm text-gray-600">
                      {actual != null ? `${actual.toFixed(1)} kBtu/ft²` : "—"}
                    </div>
                  </div>
                  <div className="relative h-6 mt-1 rounded bg-gray-100">
                    {/* Expected band (P25–P75) */}
                    {p25 != null && p75 != null && (
                      <div
                        className="absolute inset-y-0 bg-emerald-100 rounded"
                        style={{ left: `${pct(p25)}%`, width: `${pct(p75) - pct(p25)}%` }}
                      />
                    )}

                    {/* Selected baseline marker */}
                    {expSelected != null && (
                      <div
                        className="absolute inset-y-0 w-0.5 bg-emerald-700"
                        style={{ left: `${pct(expSelected)}%` }}
                        title={`Expected (${baseline.toUpperCase()})`}
                      />
                    )}

                    {/* Actual marker */}
                    {actual != null && (
                      <div
                        className="absolute inset-y-0 w-1 bg-gray-900"
                        style={{ left: `${pct(actual)}%` }}
                        title="Actual"
                      />
                    )}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {p25 != null && p75 != null
                      ? `Band: ${p25.toFixed(1)}–${p75.toFixed(1)} • Using ${baseline.toUpperCase()}`
                      : `Expected band unavailable • Using ${baseline.toUpperCase()}`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
  const supabase = createPagesServerClient(ctx);
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return {
      redirect: {
        destination: "/auth/sign-in?redirect=/dashboard",
        permanent: false,
      },
    };
  }

  // Fetch last 10 bills (newest first) with multiple name/utility paths:
  const { data: billsRaw } = await supabase
    .from("bills")
    .select(`
      id,
      period_start,
      period_end,
      total_cost,
      demand_cost,
      building_id,
      meter_id,
      buildings ( id, name ),
      meters (
        utility,
        buildings ( id, name )
      ),
      bill_upload_id,
      bill_uploads (
        meters (
          utility,
          buildings ( id, name )
        )
      )
    `)
    .order("period_end", { ascending: false })
    .limit(10);

  const billIds = (billsRaw ?? []).map((b: any) => b.id);

  // Read usage in all supported units (kWh + gas units incl. MMBtu)
  type ReadingRow = {
    bill_id: string;
    usage_kwh: number | null;
    therms: number | null;
    usage_mcf: number | null;
    usage_mmbtu: number | null; // supported even if not in older schemas
  };
  const usageByBill = new Map<string, ReadingRow>();

  if (billIds.length > 0) {
    const { data: readings } = await supabase
      .from("usage_readings")
      .select("bill_id, usage_kwh, therms, usage_mcf, usage_mmbtu")
      .in("bill_id", billIds);

    (readings ?? []).forEach((r: any) => {
      usageByBill.set(r.bill_id, {
        bill_id: r.bill_id,
        usage_kwh: r.usage_kwh != null ? Number(r.usage_kwh) : null,
        therms: r.therms != null ? Number(r.therms) : null,
        usage_mcf: r.usage_mcf != null ? Number(r.usage_mcf) : null,
        usage_mmbtu: r.usage_mmbtu != null ? Number(r.usage_mmbtu) : null,
      });
    });
  }

  const latestBills: Props["latestBills"] = (billsRaw ?? []).map((b: any) => {
    const usage = usageByBill.get(b.id);
    const utility = b?.meters?.utility ?? b?.bill_uploads?.meters?.utility ?? null;

    const building_name =
      b?.buildings?.name ??
      b?.meters?.buildings?.name ??
      b?.bill_uploads?.meters?.buildings?.name ??
      null;

    return {
      ...b,
      utility,
      usage_kwh: usage?.usage_kwh ?? null,
      usage_therms: usage?.therms ?? null,
      usage_mcf: usage?.usage_mcf ?? null,
      usage_mmbtu: usage?.usage_mmbtu ?? null,
      building_name,
    };
  });

  // Try to fetch consolidated site dashboard view
  let siteRows: SiteRow[] = [];
  try {
    const { data: siteData, error: siteErr } = await supabase
      .from("building_dashboard_site")
      .select(
        `
        building_id,
        building_name,
        site_eui_kbtu_per_sf_actual,
        expected_site_eui_kbtu_per_sf_mean,
        expected_site_eui_kbtu_per_sf_p25,
        expected_site_eui_kbtu_per_sf_p50,
        expected_site_eui_kbtu_per_sf_p75,
        site_cost_actual_all_in,
        expected_site_cost_mean_all_in,
        variance_site_eui_pct,
        variance_site_cost_pct
      `
      )
      .limit(1000);

    if (!siteErr && Array.isArray(siteData)) {
      siteRows = siteData as SiteRow[];
    }
  } catch {
    // ignore; page still works if view is missing
  }

  return {
    props: {
      latestBills,
      siteRows,
      initialSession: session,
    },
  };
}
