// ----------------------------
// /pages/buildings/[id].tsx
// FULLY STYLED VIEW PAGE
// Section 1 of 3
// ----------------------------

import { useRouter } from "next/router";
import Link from "next/link";
import * as React from "react";
import { supabase } from "@/lib/supabaseClient";

import {
  Zap,
  Flame,
  DollarSign,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

//
// ----------------------------
// Types
// ----------------------------
//

type Building = {
  id: string;
  name: string;

  // Core location info
  address: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  state_code: string | null;
  postal_code: string | null;

  // Size / type
  square_feet: number | null;
  activity_code: string | null;

  // Ops details
  hours_of_operation: number | null;
  number_of_students: number | null;
  number_of_staff: number | null;
  year_built: number | null;

  // Portfolio Manager linkage (from your schema)
  pm_property_id: string | null;
  pm_property_name: string | null;
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

type PmScore = {
  score: number | null;
  site_eui_kbtu_ft2: number | null;
};


//
// ----------------------------
// Helper formatting
// ----------------------------
//

function fmtMonth(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
  });
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

function fmtCurrency(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function monthKey(iso: string) {
  // "YYYY-MM-01" -> "YYYY-MM"
  return iso.slice(0, 7);
}

function gasMmbtuFromUsage(u?: UsageReading | null): number | null {
  if (!u) return null;
  if (u.usage_mmbtu != null && Number.isFinite(Number(u.usage_mmbtu))) {
    return Number(u.usage_mmbtu);
  }
  if (u.therms != null && Number.isFinite(Number(u.therms))) {
    return Number(u.therms) * 0.1; // 1 therm = 0.1 MMBtu
  }
  if (u.usage_mcf != null && Number.isFinite(Number(u.usage_mcf))) {
    return Number(u.usage_mcf) * 1.037; // approx MMBtu per MCF
  }
  return null;
}

function buildFiscalYtdMonths(latestMonthIso: string, fiscalStartMonthIndex = 6) {
  // fiscalStartMonthIndex: 6 = July (0=Jan)
  // returns array of "YYYY-MM-01" from fiscal start to latestMonth (inclusive)
  const end = new Date(latestMonthIso + "T00:00:00");
  end.setUTCDate(1);

  const fyStart = new Date(end);
  fyStart.setUTCMonth(fiscalStartMonthIndex);
  fyStart.setUTCDate(1);

  // If latestMonth is before July (Jan–Jun), fiscal year started last calendar year
  if (end.getUTCMonth() < fiscalStartMonthIndex) {
    fyStart.setUTCFullYear(end.getUTCFullYear() - 1);
  } else {
    fyStart.setUTCFullYear(end.getUTCFullYear());
  }

  const months: string[] = [];
  const d = new Date(fyStart);
  while (d <= end) {
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`);
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return months;
}


//
// ----------------------------
// Bill month conversion
// ----------------------------
//

function billMonthFromPeriod(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const mid = new Date((s.getTime() + e.getTime()) / 2);
  return `${mid.getUTCFullYear()}-${String(
    mid.getUTCMonth() + 1
  ).padStart(2, "0")}-01`;
}

//
// ------------------------------------------------------------
// SUMMARIZATION UTILITIES (Electric + Gas aggregation per month)
// ------------------------------------------------------------
//

// We will sum ALL meters of each utility.
// Gas usage is normalized to MMBtu from usage_mmbtu/therms/usage_mcf.

type MonthlyTotals = {
  month: string; // YYYY-MM-01
  electric_kwh: number | null;
  electric_cost: number | null;

  gas_mmbtu: number | null;
  gas_cost: number | null;
};

function billUtilityType(bill: BillWithUsage): "electric" | "gas" | null {
  const meterType = String(bill.meter?.type ?? bill.meter?.utility ?? "").toLowerCase();
  if (meterType === "electric" || meterType === "gas") return meterType;
  if (bill.usage?.usage_kwh != null) return "electric";
  if (
    bill.usage?.usage_mmbtu != null ||
    bill.usage?.usage_mcf != null ||
    bill.usage?.therms != null
  ) {
    return "gas";
  }
  return null;
}

function findLatestFullDataMonth(bills: BillWithUsage[]): string | null {
  const utilitiesWithHistory = new Set<"electric" | "gas">();
  const coverageByMonth = new Map<string, Set<"electric" | "gas">>();

  for (const bill of bills) {
    if (!bill.bill_month) continue;

    const utility = billUtilityType(bill);
    if (!utility) continue;

    utilitiesWithHistory.add(utility);

    if (!coverageByMonth.has(bill.bill_month)) {
      coverageByMonth.set(bill.bill_month, new Set<"electric" | "gas">());
    }
    coverageByMonth.get(bill.bill_month)!.add(utility);
  }

  const requiredUtilities = Array.from(utilitiesWithHistory);
  if (!requiredUtilities.length) return null;

  const monthsDesc = Array.from(coverageByMonth.keys()).sort((a, b) => b.localeCompare(a));
  for (const month of monthsDesc) {
    const utilitiesInMonth = coverageByMonth.get(month);
    if (!utilitiesInMonth) continue;
    if (requiredUtilities.every((utility) => utilitiesInMonth.has(utility))) {
      return month;
    }
  }

  return null;
}

// Build a map: month → aggregated totals.
function aggregateMonthlyTotals(bills: BillWithUsage[]): MonthlyTotals[] {
  const map = new Map<
    string,
    {
      electric_kwh: number;
      electric_cost: number;
      gas_mmbtu: number;
      gas_cost: number;
    }
  >();

  // We keep the MAX gas usage per (bill_month, meter_id) to avoid carrier/supplier double count.
  const gasUsageMaxByKey = new Map<string, number>(); // key = `${bill_month}|${meter_id}`

  for (const b of bills) {
    if (!b.bill_month) continue;
    const monthKey = b.bill_month;

    if (!map.has(monthKey)) {
      map.set(monthKey, {
        electric_kwh: 0,
        electric_cost: 0,
        gas_mmbtu: 0,
        gas_cost: 0,
      });
    }

    const acc = map.get(monthKey)!;

    const meterType =
      (b.meter?.type as "electric" | "gas") ??
      (b.usage?.usage_kwh != null ? "electric" : "gas");

    if (meterType === "electric") {
      // Sum ALL electric usage + cost
      if (b.usage?.usage_kwh != null) {
        acc.electric_kwh += b.usage.usage_kwh;
      }
      if (b.total_cost != null) {
        acc.electric_cost += b.total_cost;
      }
    } else {
      // GAS
      // 1) Always sum ALL gas cost (carrier + supplier)
      if (b.total_cost != null) {
        acc.gas_cost += b.total_cost;
      }

      // 2) Count gas usage as MAX per (month, meter_id), normalized to MMBtu
      const gasMmbtu = gasMmbtuFromUsage(b.usage);
      if (gasMmbtu != null) {
        const usageKey = `${monthKey}|${b.meter_id}`;
        const prevMax = gasUsageMaxByKey.get(usageKey);
        if (prevMax == null) {
          gasUsageMaxByKey.set(usageKey, gasMmbtu);
          acc.gas_mmbtu += gasMmbtu;
        } else if (gasMmbtu > prevMax) {
          gasUsageMaxByKey.set(usageKey, gasMmbtu);
          acc.gas_mmbtu += gasMmbtu - prevMax;
        }
      }
    }
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      month,
      electric_kwh: v.electric_kwh || 0,
      electric_cost: v.electric_cost || 0,
      gas_mmbtu: v.gas_mmbtu || 0,
      gas_cost: v.gas_cost || 0,
    }));
}

//
// ----------------------------
// FISCAL YEAR CALCULATIONS
// FY starts July 1
// ----------------------------
//

// Find the fiscal year start for a given YYYY-MM-01.
function fiscalYearStartForMonth(monthIso: string): string {
  const d = new Date(monthIso + "T00:00:00");
  const year = d.getUTCFullYear();
  const monthIndex = d.getUTCMonth(); // 0=Jan

  // If month >= July (6), FY starts July 1 of current year
  // else FY starts July 1 of previous year
  const fyYear = monthIndex >= 6 ? year : year - 1;

  return `${fyYear}-07-01`;
}

// Return a list of months between start → end inclusive.
function monthsBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");

  let y = s.getUTCFullYear();
  let m = s.getUTCMonth();

  while (true) {
    const iso = `${y}-${String(m + 1).padStart(2, "0")}-01`;
    out.push(iso);
    if (y === e.getUTCFullYear() && m === e.getUTCMonth()) break;
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  return out;
}

//
// ----------------------------
// MAIN PAGE COMPONENT BEGIN
// ----------------------------
//

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
 const [pmScore, setPmScore] = React.useState<PmScore | null>(null);
const [nationalEui, setNationalEui] = React.useState<number | null>(null);
  const [monthlyAverageEuiRows, setMonthlyAverageEuiRows] = React.useState<
    Array<{ label: string; avgEui: number | null; lastYearAvgEui: number | null }>
  >([]);

  const [isDeleting, setIsDeleting] = React.useState(false);
// NEW: bill selection + delete state
  const [selectedBillIds, setSelectedBillIds] = React.useState<string[]>([]);
  const [isDeletingBills, setIsDeletingBills] = React.useState(false);
const [isClearingData, setIsClearingData] = React.useState(false);

  const toggleBillSelection = (id: string) => {
    setSelectedBillIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleDeleteBuilding = async () => {
    if (!building) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete "${building.name}" and ALL associated meters, bills, and usage data? This cannot be undone.`
    );
    if (!confirmed) return;

    try {
      setIsDeleting(true);

      const { error } = await supabase
        .from("buildings")
        .delete()
        .eq("id", building.id);

      if (error) {
        console.error("Error deleting building:", error);
        alert("There was a problem deleting this building. Please try again.");
        return;
      }

      // Success → return to buildings list
      router.push("/buildings");
    } finally {
      setIsDeleting(false);
    }
  };

const handleClearBuildingData = async () => {
  if (!building) return;

  const confirmed = window.confirm(
    `Are you sure you want to delete ALL meters, bills, and usage data for "${building.name}" but keep the building itself? This cannot be undone.`
  );
  if (!confirmed) return;

  try {
    setIsClearingData(true);

    // Deleting meters for this building will cascade delete bills + usage
    // as long as your foreign keys are configured with ON DELETE CASCADE.
    const { error } = await supabase
      .from("meters")
      .delete()
      .eq("building_id", building.id);

    if (error) {
      console.error("Error clearing building data:", error);
      alert(
        "There was a problem deleting meters/bills for this building. Please try again."
      );
      return;
    }

    // Clear local state so the UI updates immediately
    setMeters([]);
    setBills([]);
    setBillMonths([]);
    setSelectedBillIds([]);
  } finally {
    setIsClearingData(false);
  }
};


  const handleDeleteSelectedBills = async () => {
    if (!selectedBillIds.length) return;

    const confirmed = window.confirm(
      `Delete ${selectedBillIds.length} bill${
        selectedBillIds.length > 1 ? "s" : ""
      }? This cannot be undone.`
    );
    if (!confirmed) return;

    try {
      setIsDeletingBills(true);

      const { error } = await supabase
        .from("bills")
        .delete()
        .in("id", selectedBillIds);

      if (error) {
        console.error("Error deleting bills:", error);
        alert("There was a problem deleting the selected bills.");
        return;
      }

            // Optimistically update local state so UI reflects the change immediately
      setBills((prev) => {
        const next = prev.filter((b) => !selectedBillIds.includes(b.id));

        // Rebuild billMonths from the remaining bills so KPIs stay in sync
        const monthsSet = Array.from(
          new Set(next.map((b) => b.bill_month!).filter(Boolean))
        ).sort();

        setBillMonths(monthsSet.map((m) => ({ bill_month: m })));

        return next;
      });

      setSelectedBillIds([]);

    } finally {
      setIsDeletingBills(false);
    }
  };

  //
  // ----------------------------
  // Load BUILDING
  // ----------------------------
  //

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

  // Load ENERGY STAR score + Site EUI for this building from pm_property_scores
  React.useEffect(() => {
    if (!building?.pm_property_id) {
      setPmScore(null);
      return;
    }

    (async () => {
      try {
        const { data, error } = await supabase
          .from("pm_property_scores")
          .select("score, site_eui_kbtu_ft2")
          .eq("pm_property_id", building.pm_property_id)
          .order("as_of_date", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error("Error loading PM score:", error);
          return;
        }

        if (data) {
          setPmScore(data as PmScore);
        }
      } catch (err) {
        console.error("Error loading PM score:", err);
      }
    })();
  }, [building?.pm_property_id]);

  // Monthly Average EUI (weather normalized), keyed to the actual PM metric month.
  React.useEffect(() => {
    if (!building?.pm_property_id || !building?.id) {
      setMonthlyAverageEuiRows([]);
      return;
    }

    let aborted = false;

    (async () => {
      try {
        const addMonths = (d: Date, n: number) =>
          new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
        const yyyyMm01 = (d: Date) =>
          `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
        const normalizeMetricMonthKey = (isoLike: string | null) => {
          if (!isoLike) return null;
          const d = new Date(isoLike);
          if (Number.isNaN(d.getTime())) return null;
          return yyyyMm01(d);
        };

        let sourceRows: Array<{ metricMonth: string; value: number }> = [];

        const { data: snapRows, error: snapErr } = await supabase
          .from("pm_property_metric_snapshots")
          .select("metric_as_of_date, site_eui_wn_kbtu_ft2")
          .eq("building_id", building.id)
          .not("site_eui_wn_kbtu_ft2", "is", null)
          .order("metric_as_of_date", { ascending: true });

        if (!snapErr && snapRows?.length) {
          sourceRows = (snapRows ?? [])
            .map((r: any) => ({
              metricMonth: normalizeMetricMonthKey(r.metric_as_of_date),
              value: Number(r.site_eui_wn_kbtu_ft2),
            }))
            .filter((r) => !!r.metricMonth && Number.isFinite(r.value)) as Array<{
            metricMonth: string;
            value: number;
          }>;
        } else {
          const { data: createdRows, error: cErr } = await supabase
            .from("pm_property_scores")
            .select("as_of_date, site_eui_wn_kbtu_ft2")
            .eq("pm_property_id", building.pm_property_id)
            .not("site_eui_wn_kbtu_ft2", "is", null)
            .order("as_of_date", { ascending: true });

          if (cErr) throw cErr;

          sourceRows = (createdRows ?? [])
            .map((r: any) => ({
              metricMonth: normalizeMetricMonthKey(r.as_of_date),
              value: Number(r.site_eui_wn_kbtu_ft2),
            }))
            .filter((r) => !!r.metricMonth && Number.isFinite(r.value)) as Array<{
            metricMonth: string;
            value: number;
          }>;
        }

        const monthKeys = Array.from(new Set(sourceRows.map((r) => r.metricMonth))).sort(
          (a, b) => (a > b ? 1 : a < b ? -1 : 0)
        );
        const latestAsOf = monthKeys.length ? monthKeys[monthKeys.length - 1] : null;
        if (!latestAsOf) {
          if (!aborted) setMonthlyAverageEuiRows([]);
          return;
        }

        const latest = new Date(`${latestAsOf}T00:00:00Z`);
        const currentStart = addMonths(latest, -11);
        const compareStart = addMonths(currentStart, -12);
        const endExclusive = addMonths(latest, 1);
        const compareStartStr = yyyyMm01(compareStart);
        const endExclusiveStr = yyyyMm01(endExclusive);

        const byMonth: Record<string, number[]> = {};
        for (const r of sourceRows) {
          const key = String(r.metricMonth ?? "");
          const val = Number(r.value);
          if (!key || !Number.isFinite(val)) continue;
          if (key < compareStartStr || key >= endExclusiveStr) continue;
          if (!byMonth[key]) byMonth[key] = [];
          byMonth[key].push(val);
        }

        const monthAvg = (key: string) => {
          const vals = byMonth[key] ?? [];
          if (!vals.length) return null;
          const avg = vals.reduce((s, n) => s + n, 0) / vals.length;
          return Number(avg.toFixed(1));
        };

        const out: Array<{ label: string; avgEui: number | null; lastYearAvgEui: number | null }> = [];
        for (let i = 0; i < 12; i++) {
          const d = addMonths(currentStart, i);
          const curKey = yyyyMm01(d);
          const prevKey = yyyyMm01(addMonths(d, -12));
          const labelDate = new Date(d.getUTCFullYear(), d.getUTCMonth(), 1);
          const month = labelDate.toLocaleString("en-US", { month: "short" });
          const yy = String(labelDate.getFullYear()).slice(-2);

          out.push({
            label: `${month} '${yy}`,
            avgEui: monthAvg(curKey),
            lastYearAvgEui: monthAvg(prevKey),
          });
        }

        if (!aborted) setMonthlyAverageEuiRows(out);
      } catch {
        if (!aborted) setMonthlyAverageEuiRows([]);
      }
    })();

    return () => {
      aborted = true;
    };
  }, [building?.id, building?.pm_property_id]);

// ----------------------------
// National Median Site EUI (stored benchmark)
// ----------------------------
React.useEffect(() => {
  let isMounted = true;

  async function loadNationalMedianEui() {
    try {
      if (!building?.activity_code) {
        if (isMounted) setNationalEui(null);
        return;
      }

      const { data, error } = await supabase
        .from("national_eui")
        .select("median_eui_kbtu_ft2")
        .eq("activity_code", building.activity_code)
        .maybeSingle();

      if (error) {
        console.warn("[national_eui] fetch error", error);
        if (isMounted) setNationalEui(null);
        return;
      }

      const median = data?.median_eui_kbtu_ft2;
      if (isMounted) setNationalEui(median != null ? Number(median) : null);
    } catch (e) {
      console.warn("[national_eui] unexpected error", e);
      if (isMounted) setNationalEui(null);
    }
  }

  loadNationalMedianEui();

  return () => {
    isMounted = false;
  };
}, [building?.activity_code]);

  //
  // ----------------------------
  // Load METERS + BILLS + USAGE
  // ----------------------------
  //

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
        if (!aborted) setMeters(mtrs);

        const meterIds = mtrs.map((m) => m.id);
        if (meterIds.length === 0) {
          if (!aborted) {
            setBills([]);
            setBillMonths([]);
            setLoadingBills(false);
          }
          return;
        }

        // 2) Load bills
        const { data: billRows, error: bErr } = await supabase
          .from("bills")
          .select("*")
          .in("meter_id", meterIds)
          .order("period_start", { ascending: true });

        if (bErr) throw bErr;
        const billsRaw = (billRows || []) as Bill[];

        // 3) Load usage
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

        // 5) Build list of bill months
        const monthsSet = Array.from(
          new Set(merged.map((b) => b.bill_month!))
        ).sort();

        const months: BillMonth[] = monthsSet.map((m) => ({
          bill_month: m,
        }));

        if (!aborted) {
          setBills(merged);
          setBillMonths(months);
        }
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

  //
  // ----------------------------
  // Derived Aggregated Data
  // ----------------------------
  //

  const monthlyTotals = React.useMemo(
    () => aggregateMonthlyTotals(bills),
    [bills]
  );

    // Latest month = current month for KPIs
  const latestMonth = React.useMemo(() => findLatestFullDataMonth(bills), [bills]);

  // Look up values for latestMonth
  const current =
    latestMonth != null
      ? monthlyTotals.find((m) => m.month === latestMonth) ?? null
      : null;

  // Last 12 calendar months ending at latestMonth (oldest → newest)
  const last12Months = React.useMemo(() => {
    if (!latestMonth) return [];

    const result: string[] = [];
    const d = new Date(latestMonth + "T00:00:00");
    d.setUTCDate(1);

    // Start 11 months before latest so we have 12 months total
    d.setUTCMonth(d.getUTCMonth() - 11);

    for (let i = 0; i < 12; i++) {
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth();
      result.push(`${y}-${String(m + 1).padStart(2, "0")}-01`);
      d.setUTCMonth(d.getUTCMonth() + 1);
    }

    return result;
  }, [latestMonth]);

// Previous 12 calendar months ending at (latestMonth - 12 months)
const prev12Months = React.useMemo(() => {
  if (!latestMonth) return [];

  const result: string[] = [];
  const d = new Date(latestMonth + "T00:00:00");
  d.setUTCDate(1);

  // Move back 23 months so we get the 12 months ending one year earlier
  d.setUTCMonth(d.getUTCMonth() - 23);

  for (let i = 0; i < 12; i++) {
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    result.push(`${y}-${String(m + 1).padStart(2, "0")}-01`);
    d.setUTCMonth(d.getUTCMonth() + 1);
  }

  return result;
}, [latestMonth]);

// Rolling 12-month cost per SF (current window)
const rolling12Current = React.useMemo(() => {
  if (!last12Months.length) return { value: null as number | null, monthsCounted: 0 };
  return rolling12CostPerSf(last12Months);
}, [building?.square_feet, last12Months, monthlyTotals]);

// Rolling 12-month cost per SF (previous year window)
const rolling12Prev = React.useMemo(() => {
  if (!prev12Months.length) return { value: null as number | null, monthsCounted: 0 };
  return rolling12CostPerSf(prev12Months);
}, [building?.square_feet, prev12Months, monthlyTotals]);

const canShowRolling12Yoy =
  rolling12Current.monthsCounted === 12 && rolling12Prev.monthsCounted === 12;

// YoY difference in $/SF (current - previous)
// Positive = costs went UP (worse). Negative = costs went DOWN (better).
const rolling12YoyDelta = React.useMemo(() => {
  if (!canShowRolling12Yoy) return null;
  if (rolling12Current.value == null || rolling12Prev.value == null) return null;
  return rolling12Current.value - rolling12Prev.value;
}, [canShowRolling12Yoy, rolling12Current.value, rolling12Prev.value]);

// YoY percent change in $/SF
const rolling12YoyPct = React.useMemo(() => {
  if (!canShowRolling12Yoy) return null;
  if (rolling12Current.value == null || rolling12Prev.value == null) return null;
  return pctChange(rolling12Current.value, rolling12Prev.value);
}, [canShowRolling12Yoy, rolling12Current.value, rolling12Prev.value]);
  
const fyYtdMonths = React.useMemo(() => {
  if (!latestMonth) return [];
  return buildFiscalYtdMonths(latestMonth, 6); // 6 = July
}, [latestMonth]);

const priorFyYtdMonths = React.useMemo(() => {
  if (!fyYtdMonths.length) return [];
  return fyYtdMonths.map((iso) => {
    const d = new Date(iso + "T00:00:00");
    d.setUTCFullYear(d.getUTCFullYear() - 1);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
  });
}, [fyYtdMonths]);



  // Chart rows for monthly cost/SF (this year vs last year)
  const costPerSFChartRows = React.useMemo(() => {
    if (!building || !building.square_feet || !last12Months.length) return [];

    const sqft = building.square_feet;

    return last12Months.map((monthIso) => {
      const d = new Date(monthIso + "T00:00:00");
      const label = d.toLocaleDateString(undefined, { month: "short" });

      const thisRow = monthlyTotals.find((t) => t.month === monthIso);

      const prevIso = `${d.getUTCFullYear() - 1}-${String(
        d.getUTCMonth() + 1
      ).padStart(2, "0")}-01`;
      const prevRow = monthlyTotals.find((t) => t.month === prevIso);

      const costCurrent = thisRow
        ? ((thisRow.electric_cost ?? 0) + (thisRow.gas_cost ?? 0)) / sqft
        : null;

      const costPrev = prevRow
        ? ((prevRow.electric_cost ?? 0) + (prevRow.gas_cost ?? 0)) / sqft
        : null;

      return {
        label,
        monthIso,
        cost_sf_current: costCurrent,
        cost_sf_prev: costPrev,
      };
    });
  }, [building, last12Months, monthlyTotals]);

  const monthlyTotalEnergyChartRows = React.useMemo(() => {
    if (!last12Months.length) return [];

    return last12Months.map((monthIso) => {
      const d = new Date(monthIso + "T00:00:00");
      const label = `${d.toLocaleDateString(undefined, { month: "short" })} '${String(
        d.getUTCFullYear()
      ).slice(-2)}`;

      const thisRow = monthlyTotals.find((t) => t.month === monthIso);
      const prevIso = `${d.getUTCFullYear() - 1}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
      const prevRow = monthlyTotals.find((t) => t.month === prevIso);

      const thisKBtu =
        Number(thisRow?.electric_kwh ?? 0) * 3.412 +
        Number(thisRow?.gas_mmbtu ?? 0) * 1000;
      const prevKBtu =
        Number(prevRow?.electric_kwh ?? 0) * 3.412 +
        Number(prevRow?.gas_mmbtu ?? 0) * 1000;

      return {
        label,
        monthIso,
        totalEnergyK: Math.round(thisKBtu / 1000),
        lastYearTotalEnergyK: prevRow ? Math.round(prevKBtu / 1000) : null,
      };
    });
  }, [last12Months, monthlyTotals]);

   const euiVsNat = React.useMemo(() => {
    if (pmScore?.site_eui_kbtu_ft2 == null || nationalEui == null) return null;

    const actual = pmScore.site_eui_kbtu_ft2;
    const nat = nationalEui;

    const diff = actual - nat;
    const pct = (diff / nat) * 100;

    // Default: neutral
    let color = "text-gray-900";
    let label = "In line with national average";

    if (pct <= -5) {
      // 5%+ better (lower EUI)
      color = "text-green-600";
      label = `${Math.abs(pct).toFixed(0)}% better (lower EUI) than national avg`;
    } else if (pct >= 5) {
      // 5%+ worse (higher EUI)
      color = "text-red-600";
      label = `${pct.toFixed(0)}% worse (higher EUI) than national avg`;
    }

    return { color, label, pct };
  }, [pmScore?.site_eui_kbtu_ft2, nationalEui]);


  //
  // ----------------------------
  // Fiscal YTD Aggregations
  // ----------------------------
  //

  // Current FY start
  const currentFYStart = latestMonth
    ? fiscalYearStartForMonth(latestMonth)
    : null;

  // Previous FY start
  const previousFYStart = currentFYStart
    ? `${String(parseInt(currentFYStart.slice(0, 4)) - 1)}-07-01`
    : null;

  // Current FY months: July 1 → latestMonth
  const currentFYMonths =
    currentFYStart && latestMonth
      ? monthsBetween(currentFYStart, latestMonth)
      : [];

   // Previous FY months: same YTD window (Jul → same month, but last year)
  const previousLatestMonth =
    latestMonth != null
      ? `${String(parseInt(latestMonth.slice(0, 4)) - 1)}${latestMonth.slice(4)}`
      : null;

  const previousFYMonths =
    previousFYStart && previousLatestMonth
      ? monthsBetween(previousFYStart, previousLatestMonth)
      : [];


  // Sum over FY months
  function sumFY(monthList: string[]) {
    let eKwh = 0;
    let eCost = 0;
    let gMmbtu = 0;
    let gCost = 0;

    for (const m of monthList) {
      const row = monthlyTotals.find((t) => t.month === m);
      if (!row) continue;

      eKwh += row.electric_kwh || 0;
      eCost += row.electric_cost || 0;
          gMmbtu += row.gas_mmbtu || 0;  // ✅ correct property name

      gCost += row.gas_cost || 0;
    }

    return { eKwh, eCost, gMmbtu, gCost };
  }

  const fyCurrent = sumFY(currentFYMonths);
  const fyPrev = sumFY(previousFYMonths);

  // Percentage helpers
  function pctChange(newVal: number, oldVal: number): number | null {
    if (oldVal === 0) return null;
    return ((newVal - oldVal) / oldVal) * 100;
  }

function rolling12CostPerSf(monthList: string[]) {
  if (!building?.square_feet) return { value: null as number | null, monthsCounted: 0 };

  const sqft = building.square_feet;
  let totalCost = 0;
  let counted = 0;

  for (const monthIso of monthList) {
    const row = monthlyTotals.find((t) => t.month === monthIso);
    if (!row) continue;

    const monthlyCost = (row.electric_cost ?? 0) + (row.gas_cost ?? 0);
    if (!monthlyCost) continue;

    totalCost += monthlyCost;
    counted += 1;
  }

  if (!counted) return { value: null, monthsCounted: 0 };
  return { value: totalCost / sqft, monthsCounted: counted };
}

function coverageForMonths(
  months: string[],
  getValue: (row: any) => number
) {
  const present: string[] = [];
  const missing: string[] = [];
  let total = 0;

  for (const iso of months) {
    const row = monthlyTotals.find((t) => t.month === iso);
    const v = row ? Number(getValue(row) ?? 0) : 0;

    if (row) {
      present.push(monthKey(iso));
      total += Number.isFinite(v) ? v : 0;
    } else {
      missing.push(monthKey(iso));
    }
  }

  return { total, present, missing, monthsCounted: present.length, expected: months.length };
}

const fyElecNow = React.useMemo(() => {
  return coverageForMonths(fyYtdMonths, (r) => r.electric_cost ?? 0);
}, [fyYtdMonths, monthlyTotals]);

const fyElecPrev = React.useMemo(() => {
  return coverageForMonths(priorFyYtdMonths, (r) => r.electric_cost ?? 0);
}, [priorFyYtdMonths, monthlyTotals]);

const fyGasNow = React.useMemo(() => {
  return coverageForMonths(fyYtdMonths, (r) => r.gas_cost ?? 0);
}, [fyYtdMonths, monthlyTotals]);

const fyGasPrev = React.useMemo(() => {
  return coverageForMonths(priorFyYtdMonths, (r) => r.gas_cost ?? 0);
}, [priorFyYtdMonths, monthlyTotals]);

const canShowFyElecYoy = fyElecPrev.monthsCounted === fyElecPrev.expected;
const canShowFyGasYoy = fyGasPrev.monthsCounted === fyGasPrev.expected;


  //
  // ----------------------------
  // CONTINUE IN SECTION 2...
  // ----------------------------
  //
  //
  // ===========================================================
  // SECTION 2 — UI COMPONENTS (Metric Cards, Charts, YTD Panels)
  // ===========================================================
  //

  //
  // ----------------------------
  // Metric Card Component
  // ----------------------------
  //

  const MetricCard = ({
  title,
  value,
  valueDisplay,
  yoyChange,
  yoyDelta,
  icon: Icon,
  unit = "",
  yoyDeltaIsCurrency = false,
}: {
  title: string;
  value: number | null;
  valueDisplay?: string;   // <-- NEW
  yoyChange: number | null;
  yoyDelta?: number | null;
  icon: any;
  unit?: string;
  yoyDeltaIsCurrency?: boolean;
}) => {

  const isUp = yoyChange != null && yoyChange > 0;

  // For “savings”, we want:
  //   positive = good (current < prev)  => green
  //   negative = bad  (current > prev)  => red
  const deltaIsSavings =
    yoyDelta != null ? yoyDelta > 0 : null;

  return (
    <div className="bg-white p-4 rounded-lg border border-gray-200">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-600 mb-1">{title}</p>
          <p className="text-2xl font-semibold text-gray-900">
  {valueDisplay ?? (value != null ? value.toLocaleString() + unit : "—")}
</p>


          {(yoyChange != null || yoyDelta != null) && (
            <div className="flex items-center mt-2 gap-2">
              {yoyChange != null && (
                <>
                  {isUp ? (
                    <TrendingUp className="w-4 h-4 text-red-500" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-green-500" />
                  )}
                  <span
                    className={`text-sm font-medium ${
                      isUp ? "text-red-600" : "text-green-600"
                    }`}
                  >
                    {Math.abs(yoyChange).toFixed(1)}% YoY
                  </span>
                </>
              )}

              {yoyDelta != null && (
                <>
                  <span className="text-gray-300">•</span>
                  <span
                    className={`text-sm font-medium ${
                      deltaIsSavings === null
                        ? "text-gray-600"
                        : deltaIsSavings
                        ? "text-green-700"
                        : "text-red-700"
                    }`}
                    title="Last year minus current year"
                  >
                    {yoyDeltaIsCurrency ? fmtCurrency(yoyDelta) : yoyDelta.toLocaleString()}
                    {yoyDeltaIsCurrency ? " savings" : ""}
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        <Icon className="w-8 h-8 text-gray-400" />
      </div>
    </div>
  );
};


  //
  // ----------------------------
  // CHARTS
  // ----------------------------
  //

  // Convert monthlyTotals into rows for the rolling last 12 months,
  // with both current-year and last-year values on the same row.
  const chartRows = React.useMemo(() => {
    if (!last12Months.length) return [];

    return last12Months.map((monthIso) => {
      const d = new Date(monthIso + "T00:00:00");
      const monthLetter = d.toLocaleDateString(undefined, { month: "short" }).charAt(0);
      const yy = String(d.getUTCFullYear()).slice(-2);
      // Compact axis label: first month letter, except January shows year marker.
      const label = d.getUTCMonth() === 0 ? `${monthLetter}${yy}` : monthLetter;

      const thisRow = monthlyTotals.find((t) => t.month === monthIso);

      const prevMonthIso = `${d.getUTCFullYear() - 1}-${String(
        d.getUTCMonth() + 1
      ).padStart(2, "0")}-01`;
      const prevRow = monthlyTotals.find((t) => t.month === prevMonthIso);

      return {
        label,
        monthIso,

        // Electric
        usage_current: thisRow?.electric_kwh ?? null,
        usage_prev: prevRow?.electric_kwh ?? null,

        cost_current: thisRow?.electric_cost ?? null,
        cost_prev: prevRow?.electric_cost ?? null,

        // Gas (MMBtu & cost)
        gas_usage_current: thisRow?.gas_mmbtu ?? null,
        gas_usage_prev: prevRow?.gas_mmbtu ?? null,

        gas_cost_current: thisRow?.gas_cost ?? null,
        gas_cost_prev: prevRow?.gas_cost ?? null,
      };
    });
  }, [monthlyTotals, last12Months]);


    //
  // Electric Usage Trend (BAR)
  //
  const ElectricUsageChart = () => {
  const data = chartRows;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const row = payload[0].payload;

    const prev = row.usage_prev as number | null;
    const curr = row.usage_current as number | null;

    return (
      <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
        <div className="mb-1 font-semibold text-gray-800">{label}</div>

        <div className="flex justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-gray-400" />
            <span className="text-gray-500">Last Year</span>
          </div>
          <span className="font-medium text-gray-800">
            {prev != null ? prev.toLocaleString() : "—"} kWh
          </span>
        </div>

        <div className="mt-1 flex justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
            <span className="text-gray-500">Current Year</span>
          </div>
          <span className="font-medium text-gray-800">
            {curr != null ? curr.toLocaleString() : "—"} kWh
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Electric Usage Trend
      </h3>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} barGap={2} barCategoryGap="40%">
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" />
          <YAxis />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Bar
            dataKey="usage_prev"
            name="Last Year"
            fill="#9CA3AF"
            barSize={18}
          />
          <Bar
            dataKey="usage_current"
            name="Current Year"
            fill="#3B82F6"
            barSize={18}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

  //
  // Electric Cost Trend (LINE)
  //
const ElectricCostChart = () => {
  const data = chartRows;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const row = payload[0].payload;

    const prev = row.cost_prev as number | null;
    const curr = row.cost_current as number | null;

    return (
      <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
        <div className="mb-1 font-semibold text-gray-800">{label}</div>

        <div className="flex justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-gray-400" />
            <span className="text-gray-500">Last Year</span>
          </div>
          <span className="font-medium text-gray-800">
            {prev != null ? `$${prev.toLocaleString()}` : "—"}
          </span>
        </div>

        <div className="mt-1 flex justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-gray-500">Current Year</span>
          </div>
          <span className="font-medium text-gray-800">
            {curr != null ? `$${curr.toLocaleString()}` : "—"}
          </span>
        </div>
      </div>
    );
  };

    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Electric Cost Trend
        </h3>

        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line
              type="monotone"
              dataKey="cost_prev"
              stroke="#9CA3AF"
              name="Last Year"
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="cost_current"
              stroke="#10B981"
              name="Current Year"
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };
  //
  // Gas Usage Trend (BAR)
  //
  const GasUsageChart = () => {
  const data = chartRows;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const row = payload[0].payload;

    const prev = row.gas_usage_prev as number | null;
    const curr = row.gas_usage_current as number | null;

    return (
      <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
        <div className="mb-1 font-semibold text-gray-800">{label}</div>

        <div className="flex justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-gray-400" />
            <span className="text-gray-500">Last Year</span>
          </div>
          <span className="font-medium text-gray-800">
            {prev != null ? prev.toLocaleString() : "—"} MMBtu
          </span>
        </div>

        <div className="mt-1 flex justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
            <span className="text-gray-500">Current Year</span>
          </div>
          <span className="font-medium text-gray-800">
            {curr != null ? curr.toLocaleString() : "—"} MMBtu
          </span>
        </div>
      </div>
    );
  };

    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Gas Usage Trend
        </h3>

        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} barGap={2} barCategoryGap="40%">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar
              dataKey="gas_usage_prev"
              name="Last Year"
              fill="#9CA3AF"
              barSize={18}
            />
            <Bar
              dataKey="gas_usage_current"
              name="Current Year"
              fill="#F59E0B"
              barSize={18}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  };
  //
  // Gas Cost Trend (LINE)
  //
  const GasCostChart = () => {
  const data = chartRows;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const row = payload[0].payload;

    const prev = row.gas_cost_prev as number | null;
    const curr = row.gas_cost_current as number | null;

    return (
      <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm">
        <div className="mb-1 font-semibold text-gray-800">{label}</div>

        <div className="flex justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-gray-400" />
            <span className="text-gray-500">Last Year</span>
          </div>
          <span className="font-medium text-gray-800">
            {prev != null ? `$${prev.toLocaleString()}` : "—"}
          </span>
        </div>

        <div className="mt-1 flex justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
            <span className="text-gray-500">Current Year</span>
          </div>
          <span className="font-medium text-gray-800">
            {curr != null ? `$${curr.toLocaleString()}` : "—"}
          </span>
        </div>
      </div>
    );
  };

    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Gas Cost Trend
        </h3>

        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line
              type="monotone"
              dataKey="gas_cost_prev"
              stroke="#9CA3AF"
              name="Last Year"
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="gas_cost_current"
              stroke="#EF4444"
              name="Current Year"
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };

  //
  // ----------------------------
  // YTD Panel
  // ----------------------------
  //

// Require complete prior FY month coverage (utility-specific) before showing YoY % change
const canShowYoyElec = fyElecPrev.monthsCounted === fyElecPrev.expected;
const canShowYoyGas = fyGasPrev.monthsCounted === fyGasPrev.expected;

// Prettier missing list text (e.g., "Aug, Oct")
const missingElecText = fyElecPrev.missing.join(", ");
const missingGasText = fyGasPrev.missing.join(", ");


  const YTDPanel = () => (
    <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">
        Year-to-Date Summary (Fiscal: Jul → {latestMonth ? fmtMonth(latestMonth) : "—"})
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Electric */}
        <div>
          <h3 className="text-lg font-medium text-gray-800 mb-3 flex items-center">
            <Zap className="w-5 h-5 mr-2 text-yellow-500" />
            Electric
          </h3>
{!canShowYoyElec && (
  <p className="mb-2 text-xs text-gray-500">
    Prior FY missing months ({fyElecPrev.monthsCounted}/{fyElecPrev.expected}):
    {missingElecText ? ` ${missingElecText}` : " —"}
  </p>
)}


          <div className="space-y-2">
            {canShowYoyElec && (
  <div className="flex justify-between py-2 border-b">
    <span className="text-gray-600">Prev FY Usage</span>
    <span className="font-semibold">{fyPrev.eKwh.toLocaleString()} kWh</span>
  </div>
)}
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-600">Current FY Usage</span>
              <span className="font-semibold">
                {fyCurrent.eKwh.toLocaleString()} kWh
              </span>
            </div>
 {canShowYoyElec && (
  <div className="flex justify-between py-2 border-b">
    <span className="text-gray-600">Change</span>
    <span
      className={`font-semibold ${
        fyCurrent.eKwh > fyPrev.eKwh ? "text-red-600" : "text-green-600"
      }`}
    >
      {pctChange(fyCurrent.eKwh, fyPrev.eKwh)?.toFixed(1) ?? "—"}%
    </span>
  </div>
)}

    

            <div className="flex justify-between py-2">
              <span className="text-gray-600">Current FY Cost</span>
              <span className="font-semibold">
                ${fyCurrent.eCost.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Gas */}
        <div>
          <h3 className="text-lg font-medium text-gray-800 mb-3 flex items-center">
            <Flame className="w-5 h-5 mr-2 text-orange-500" />
            Natural Gas
          </h3>
{!canShowYoyGas && (
  <p className="mb-2 text-xs text-gray-500">
    Prior FY missing months ({fyGasPrev.monthsCounted}/{fyGasPrev.expected}):
    {missingGasText ? ` ${missingGasText}` : " —"}
  </p>
)}

          <div className="space-y-2">
            {canShowYoyGas && (
  <div className="flex justify-between py-2 border-b">
    <span className="text-gray-600">Prev FY Usage</span>
    <span className="font-semibold">{fyPrev.gMmbtu.toLocaleString()} MMBtu</span>
  </div>
)}

            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-600">Current FY Usage</span>
              <span className="font-semibold">
                {fyCurrent.gMmbtu.toLocaleString()} MMBtu
              </span>
            </div>
         {canShowYoyGas && (
  <div className="flex justify-between py-2 border-b">
    <span className="text-gray-600">Change</span>
    <span
      className={`font-semibold ${
        fyCurrent.gMmbtu > fyPrev.gMmbtu ? "text-red-600" : "text-green-600"
      }`}
    >
      {pctChange(fyCurrent.gMmbtu, fyPrev.gMmbtu)?.toFixed(1) ?? "—"}%
    </span>
  </div>
)}



            <div className="flex justify-between py-2">
              <span className="text-gray-600">Current FY Cost</span>
              <span className="font-semibold">
                ${fyCurrent.gCost.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  //
  // ----------------------------
  // END SECTION 2
  // Continue with SECTION 3...
  //
  //
  // ===========================================================================
  // SECTION 3 — FINAL PAGE LAYOUT (Header, KPIs, Charts, YTD, Provider Tables)
  // ===========================================================================  
  //

  //
  // ----------------------------
  // ProviderBillsTable (your original version — unchanged)
  // ----------------------------
  //

    const ProviderBillsTable = ({
    provider,
    rows,
    months,
    selectedBillIds,
    onToggleBill,
  }: {
    provider: string;
    rows: BillWithUsage[];
    months: BillMonth[];
    selectedBillIds: string[];
    onToggleBill: (id: string) => void;
  }) => {

    const byMonth = React.useMemo(() => {
      const map = new Map<string, BillWithUsage[]>();
      for (const b of rows) {
        const arr = map.get(b.bill_month!) || [];
        arr.push(b);
        map.set(b.bill_month!, arr);
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
<th className="w-10 px-3 py-2"></th> {/* NEW: checkbox column */}
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-700">
                  Bill Month
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-700">
                  Type
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-700">
                  Meter
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-700">
                  Period
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-700">
                  Usage
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-slate-700">
                  Total
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-slate-700">
                  Demand $
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 bg-white">
              {months.map(({ bill_month }) => {
                const list = byMonth.get(bill_month) || [];

                if (list.length === 0) {
                  return (
                    <tr key={bill_month} className="bg-amber-50">
                      <td className="px-3 py-2" /> {/* NEW: blank checkbox cell */}
                      <td className="px-3 py-2 text-sm font-medium text-amber-900">
                        {fmtMonth(bill_month)}
                      </td>
                      <td className="px-3 py-2 text-sm text-amber-900">—</td>
                      <td className="px-3 py-2 text-sm text-amber-900">—</td>
                      <td className="px-3 py-2 text-sm text-amber-900">—</td>
                      <td className="px-3 py-2 text-sm text-amber-900">Missing</td>
                      <td className="px-3 py-2 text-sm text-right text-amber-900">
                        —
                      </td>
                      <td className="px-3 py-2 text-sm text-right text-amber-900">
                        —
                      </td>
                    </tr>
                  );
                }

                               return list.map((b) => {
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
                    {
                      const gasMmbtu = gasMmbtuFromUsage(b.usage);
                      usageStr =
                        gasMmbtu != null
                          ? `${num(gasMmbtu, 2)} MMBtu`
                          : "—";
                    }
                  }

                  return (
                    <tr key={b.id}>
                      <td className="px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          aria-label="Select bill"
                          checked={selectedBillIds.includes(b.id)}
                          onChange={() => onToggleBill(b.id)}
                        />
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-900">
                        {fmtMonth(bill_month)}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700 capitalize">
                        {meterType}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700">
                        {b.meter?.label || b.meter?.id || "—"}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700">
                        {fmtDate(b.period_start)} → {fmtDate(b.period_end)}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700">
                        {usageStr}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700 text-right">
                        {num(b.total_cost, 2)}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700 text-right">
                        {num(b.demand_cost, 2)}
                      </td>
                    </tr>
                  );
                });

              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  //
  // ----------------------------
  // Final Page JSX
  // ----------------------------
  //

  if (loading) return <div className="p-6">Loading…</div>;
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;
  if (!building) return <div className="p-6">No building found.</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* ------------------------------------- */}
        {/* Header Card */}
        {/* ------------------------------------- */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <div className="flex items-start justify-between">

  {/* Mascot column */}
  {building.mascot_url ? (
    <div className="mr-6 flex-shrink-0">
      <img
        src={building.mascot_url}
        alt={`${building.name} mascot`}
        className="h-32 w-32 object-contain"
      />
    </div>
  ) : (
    <div className="mr-6 flex-shrink-0 h-32 w-32 flex items-center justify-center border border-dashed border-gray-300 text-xs text-gray-400 rounded-md">
      No Logo
    </div>
  )}

  {/* Main text content */}
  <div className="flex-1">
    <h1 className="text-3xl font-bold text-gray-900 mb-2">
      {building.name}
    </h1>

    <p className="text-gray-600">
      {building.address
        ? building.address
        : `${building.address_line1 ?? ""} ${building.city ?? ""}, ${
            building.state_code ?? ""
          } ${building.postal_code ?? ""}`}
    </p>

    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
      <div>
        <p className="text-xs text-gray-500 uppercase">Size</p>
        <p className="text-sm font-semibold">
          {building.square_feet?.toLocaleString()} sq ft
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
          {building.number_of_staff ?? "—"} employees
        </p>
      </div>
    </div>
  </div>

  {/* Right-aligned nav buttons & edit button */}
  <div className="flex items-center gap-2">
    <Link
      href="/dashboard"
      className="inline-flex items-center px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
    >
      Dashboard
    </Link>

    <Link
      href="/buildings"
      className="inline-flex items-center px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
    >
      Buildings
    </Link>

    <Link
      href="/green-button"
      className="inline-flex items-center px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
    >
      System Metrics
    </Link>

    <Link
      href="/admin"
      className="inline-flex items-center px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
    >
      Admin
    </Link>

    <Link
      href={`/buildings/${building.id}/edit`}
      className="inline-flex items-center px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
    >
      Edit Building
    </Link>
  </div>

</div>

        </div>

               {/* ------------------------------------- */}
        {/* Current Month KPI Section */}
        {/* ------------------------------------- */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            {latestMonth ? `${fmtMonth(latestMonth)} Performance` : "Performance"}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <MetricCard
              title="Electric Usage"
              value={current?.electric_kwh ?? null}
              yoyChange={
                (() => {
                  if (!latestMonth || !current) return null;
                  const d = new Date(latestMonth + "T00:00:00");
                  const prevIso = `${d.getUTCFullYear() - 1}-${String(
                    d.getUTCMonth() + 1
                  ).padStart(2, "0")}-01`;
                  const prev = monthlyTotals.find((m) => m.month === prevIso);
                  if (!prev) return null;
                  return pctChange(current.electric_kwh, prev.electric_kwh);
                })()
              }
              icon={Zap}
              unit=" kWh"
            />

            <MetricCard
  title="Electric Cost"
  value={current?.electric_cost ?? null}
valueDisplay={
    current?.electric_cost != null
      ? fmtCurrency(current.electric_cost)
      : "—"
  }
  yoyChange={(() => {
    if (!latestMonth || !current) return null;
    const d = new Date(latestMonth + "T00:00:00");
    const prevIso = `${d.getUTCFullYear() - 1}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const prev = monthlyTotals.find((m) => m.month === prevIso);
    if (!prev) return null;
    return pctChange(current.electric_cost, prev.electric_cost);
  })()}
  yoyDelta={(() => {
    if (!latestMonth || !current) return null;
    const d = new Date(latestMonth + "T00:00:00");
    const prevIso = `${d.getUTCFullYear() - 1}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const prev = monthlyTotals.find((m) => m.month === prevIso);
    if (!prev) return null;

    const prevCost = prev.electric_cost ?? 0;
    const currCost = current.electric_cost ?? 0;

    return prevCost - currCost; // <-- savings
  })()}
  yoyDeltaIsCurrency
  icon={DollarSign}
/>


            <MetricCard
              title="Gas Usage"
              value={current?.gas_mmbtu ?? null}
              yoyChange={
                (() => {
                  if (!latestMonth || !current) return null;
                  const d = new Date(latestMonth + "T00:00:00");
                  const prevIso = `${d.getUTCFullYear() - 1}-${String(
                    d.getUTCMonth() + 1
                  ).padStart(2, "0")}-01`;
                  const prev = monthlyTotals.find((m) => m.month === prevIso);
                  if (!prev) return null;
                  return pctChange(current.gas_mmbtu, prev.gas_mmbtu);
                })()
              }
              icon={Flame}
              unit=" MMBtu"
            />

            <MetricCard
  title="Gas Cost"
  value={current?.gas_cost ?? null}
  valueDisplay={
    current?.gas_cost != null
      ? fmtCurrency(current.gas_cost)
      : "—"
  }
  yoyChange={(() => {
    if (!latestMonth || !current) return null;
    const d = new Date(latestMonth + "T00:00:00");
    const prevIso = `${d.getUTCFullYear() - 1}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const prev = monthlyTotals.find((m) => m.month === prevIso);
    if (!prev) return null;
    return pctChange(current.gas_cost, prev.gas_cost);
  })()}
  yoyDelta={(() => {
    if (!latestMonth || !current) return null;
    const d = new Date(latestMonth + "T00:00:00");
    const prevIso = `${d.getUTCFullYear() - 1}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const prev = monthlyTotals.find((m) => m.month === prevIso);
    if (!prev) return null;

    const prevCost = prev.gas_cost ?? 0;
    const currCost = current.gas_cost ?? 0;

    return prevCost - currCost; // <-- savings
  })()}
  yoyDeltaIsCurrency
  icon={DollarSign}
/>

          </div>
        </div>


{/* Cost/SF + ENERGY STAR & EUI + Trend (Last 12 Months) */}
        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Cost per Square Foot (Last 12 Months)
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
            {/* Left: two stacked cards */}
            <div className="space-y-4 lg:col-span-1">
              {/* 12-month average cost/SF */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <p className="text-sm text-gray-600 mb-1">
                  Annual Cost / SF (Last 12 Months)
                </p>
                <p className="text-2xl font-semibold text-gray-900">
  {rolling12Current.value != null
    ? `$${rolling12Current.value.toFixed(2)}`
    : "—"}
</p>

{/* YoY row (only shows when we have 12/12 on both windows) */}
{(rolling12YoyDelta != null || rolling12YoyPct != null) && (
  <div className="flex items-center gap-2 mt-2">
    {rolling12YoyDelta != null && (
      <>
        {rolling12YoyDelta > 0 ? (
          <TrendingUp className="w-4 h-4 text-red-500" />
        ) : (
          <TrendingDown className="w-4 h-4 text-green-500" />
        )}
        <span
          className={`text-sm font-medium ${
            rolling12YoyDelta > 0 ? "text-red-600" : "text-green-600"
          }`}
          title="Rolling 12 months vs prior rolling 12 months"
        >
          {`${rolling12YoyDelta > 0 ? "+" : ""}$${rolling12YoyDelta.toFixed(2)} /SF YoY`}
        </span>
      </>
    )}

    {rolling12YoyPct != null && (
      <>
        <span className="text-gray-300">•</span>
        <span className="text-sm text-gray-600">
          {`${rolling12YoyPct > 0 ? "+" : ""}${rolling12YoyPct.toFixed(1)}%`}
        </span>
      </>
    )}
  </div>
)}

{/* Message when YoY is hidden */}
{!canShowRolling12Yoy && (
  <p className="mt-2 text-xs text-gray-500">
    YoY shown only when both windows have 12 months of bills.
  </p>
)}


                <p className="mt-1 text-xs text-gray-500">
  Electric + gas cost divided by square feet. (
  {rolling12Current.monthsCounted}/12 current,{" "}
  {rolling12Prev.monthsCounted}/12 prior months counted)
</p>

              </div>

              {/* ENERGY STAR + EUI in the same card */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <p className="text-sm text-gray-600 mb-3">
                  ENERGY STAR &amp; EUI
                </p>
                <div className="flex items-baseline gap-8">
                  <div>
                    <p className="text-xs text-gray-500 uppercase">
                      ENERGY STAR
                    </p>
                    <p className="text-2xl font-semibold text-gray-900">
                      {pmScore?.score != null
                        ? pmScore.score.toFixed(0)
                        : "—"}
                    </p>
                  </div>
                                    <div>
                    <p className="text-xs text-gray-500 uppercase flex items-center gap-2">
                      Site EUI vs National Median
                      <span
                        className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-gray-300 text-[10px] text-gray-500 cursor-help"
                        title="Site EUI is in kBtu/ft² from Portfolio Manager. The national average comes from the U.S. DOE CBECS dataset for your building type and census division."
                      >
                        ?
                      </span>
                    </p>

                    {/* Actual vs National numbers */}
                    <div className="mt-1 flex flex-col gap-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-lg font-semibold text-gray-900">
                          {pmScore?.site_eui_kbtu_ft2 != null
                            ? `${pmScore.site_eui_kbtu_ft2.toFixed(1)} kBtu/ft²`
                            : "—"}
                        </span>

                        {nationalEui != null && (
                          <span className="text-sm text-gray-500">
                            vs {nationalEui.toFixed(1)} kBtu/ft² (national median)
                          </span>
                        )}
                      </div>

                      {/* Percent better / worse chip */}
                      {euiVsNat && nationalEui != null && (
                        <span
                          className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            euiVsNat.color === "text-green-600"
                              ? "bg-green-50 text-green-700 border border-green-200"
                              : euiVsNat.color === "text-red-600"
                              ? "bg-red-50 text-red-700 border border-red-200"
                              : "bg-gray-50 text-gray-700 border border-gray-200"
                          }`}
                        >
                          {euiVsNat.pct != null
                            ? `${Math.abs(euiVsNat.pct).toFixed(0)}% ${
                                euiVsNat.pct <= 0 ? "better (lower EUI)" : "worse (higher EUI)"
                              } than national avg`
                            : euiVsNat.label}
                        </span>
                      )}
                    </div>
                  </div>


                </div>
              </div>
            </div>

            {/* Right: line chart spanning height of both cards */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-lg border border-gray-200 p-4 h-full">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Monthly Cost per Square Foot
                </h3>

                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={costPerSFChartRows}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" />
                    <YAxis
                      tickFormatter={(v) =>
                        typeof v === "number" ? `$${v.toFixed(2)}` : v
                      }
                    />
                    <Tooltip
                      formatter={(value: any) =>
                        typeof value === "number"
                          ? `$${value.toFixed(2)} /ft²`
                          : value
                      }
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="cost_sf_prev"
                      name="Last Year"
                      stroke="#9CA3AF"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="cost_sf_current"
                      name="Current Year"
                      stroke="#3B82F6"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </section>


        {/* ------------------------------------- */}
        {/* Monthly Total Energy */}
        {/* ------------------------------------- */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Monthly Total Energy
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyTotalEnergyChartRows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis
                label={{ value: "Energy (k kBtu)", angle: -90, position: "insideLeft" }}
              />
              <Tooltip
                labelFormatter={(l) => l}
                formatter={(value: any, name: any) => {
                  const label =
                    name === "totalEnergyK" ? "Total Energy" : "Last Year Same Month";
                  return [value == null ? "—" : `${value}k kBtu`, label];
                }}
              />
              <Bar dataKey="totalEnergyK" fill="#22c55e" radius={[8, 8, 0, 0]} />
              <Line
                type="monotone"
                dataKey="lastYearTotalEnergyK"
                stroke="#111111"
                strokeWidth={2}
                dot={{ r: 3 }}
                name="Last Year Same Month"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Monthly Average EUI (weather normalized)
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyAverageEuiRows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis
                label={{ value: "EUI (kBtu/ft²)", angle: -90, position: "insideLeft" }}
              />
              <Tooltip
                labelFormatter={(l) => l}
                formatter={(value: any, name: any) => {
                  const label = name === "avgEui" ? "Average EUI" : "Last Year Same Month";
                  return [value == null ? "—" : `${value}`, label];
                }}
              />
              <Bar dataKey="avgEui" fill="#22c55e" radius={[8, 8, 0, 0]} />
              <Line
                type="monotone"
                dataKey="lastYearAvgEui"
                stroke="#111111"
                strokeWidth={2}
                dot={{ r: 3 }}
                name="Last Year Same Month"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>


        {/* ------------------------------------- */}
        {/* YTD SUMMARY */}
        {/* ------------------------------------- */}
        <YTDPanel />

        {/* ------------------------------------- */}
        {/* Charts Grid */}
        {/* ------------------------------------- */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
          <ElectricUsageChart />
          <ElectricCostChart />
          <GasUsageChart />
          <GasCostChart />
        </div>

        {/* ------------------------------------- */}
        {/* Provider Bills Section (Your original tables) */}
        {/* ------------------------------------- */}
                <div className="mb-12">
          <h2 className="text-lg font-semibold text-slate-900">Bills</h2>

          <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600">
              One table per provider. Mixed electric & gas with type and
              unit-aware usage. Sorted by bill month.
            </p>

            <button
              type="button"
              onClick={handleDeleteSelectedBills}
              disabled={!selectedBillIds.length || isDeletingBills}
              className={`inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium
                ${
                  !selectedBillIds.length || isDeletingBills
                    ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                    : "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                }`}
            >
              {isDeletingBills
                ? "Deleting…"
                : selectedBillIds.length
                ? `Delete selected (${selectedBillIds.length})`
                : "Delete selected"}
            </button>
          </div>


          {loadingBills ? (
            <div className="mt-4 text-sm text-slate-600">Loading bills…</div>
          ) : billsErr ? (
            <div className="mt-4 text-red-600">{billsErr}</div>
          ) : (
            <>
              {Array.from(
                new Map(
                  bills.map((b) => [
                    b.utility_provider ?? "Unknown",
                    true,
                  ])
                ).keys()
              ).map((provider) => {
                const providerRows = bills.filter(
                  (b) => (b.utility_provider ?? "Unknown") === provider
                );
                const providerMonths = Array.from(
                  new Set(providerRows.map((b) => b.bill_month).filter(Boolean))
                )
                  .sort()
                  .map((m) => ({ bill_month: m as string }));
                                return (
                  <ProviderBillsTable
                    key={provider}
                    provider={provider}
                    rows={providerRows}
                    months={providerMonths}
                    selectedBillIds={selectedBillIds}
                    onToggleBill={toggleBillSelection}
                  />
                );

              })}
            </>
          )}
        
   {/* ------------------------------------- */}
{/* Danger Zone: Delete data / building */}
{/* ------------------------------------- */}
<section className="mt-8 border border-red-200 bg-red-50 rounded-lg p-4">
  <h2 className="text-lg font-semibold text-red-800 mb-2">
    Danger zone
  </h2>

  <p className="text-sm text-red-700 mb-4">
    Use these actions carefully — they permanently remove data and{" "}
    <span className="font-semibold">cannot be undone</span>.
  </p>

  <div className="flex flex-wrap gap-3">
    {/* NEW: clear all meters + bills, but keep building */}
    <button
      type="button"
      onClick={handleClearBuildingData}
      disabled={isClearingData || !meters.length}
      className="inline-flex items-center rounded-md border border-red-400 px-4 py-2 text-sm font-medium
                 text-red-800 bg-red-100 hover:bg-red-200 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {isClearingData ? "Clearing data…" : "Delete all bills & meters"}
    </button>

    {/* Existing: delete whole building */}
    <button
      type="button"
      onClick={handleDeleteBuilding}
      disabled={isDeleting}
      className="inline-flex items-center rounded-md border border-red-600 px-4 py-2 text-sm font-medium
                 text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {isDeleting ? "Deleting…" : "Delete this building"}
    </button>
  </div>
</section>




</div>
      </div>
    </div>
  );
}
