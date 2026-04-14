import React from "react";
import Link from "next/link";
import { DistrictKpiTiles } from "@/components/DistrictKpiTiles";
import { useAuthGate } from "@/hooks/useAuthGate";
import { getDistrictKpis, type DistrictKpis } from "@/lib/kpiService";
import { supabase } from "@/lib/supabaseClient";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ReferenceDot,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type IngestResult = {
  fileName: string;
  ok: boolean;
  status?: number;
  message?: string;
  counts?: {
    parsed?: number;
    matched?: number;
    inserted?: number;
    deduped?: number;
    rejected?: number;
    unmatched_meter?: number;
  };
};

type RefreshRunResult = {
  ok: boolean;
  durationMs?: number;
  warningCount?: number;
  warnings?: Array<{ step?: string; message?: string }>;
  failures?: Array<{ step?: string; message?: string }>;
};

type BuildingOption = { id: string; name: string; squareFeet: number | null };
type DemandRow = {
  monthKey: string;
  monthLabel: string;
  peaksByBuildingId: Record<string, { kw: number; ts: string }>;
};
type MonthlyEnergyRow = {
  monthKey: string;
  monthLabel: string;
  kwhByBuildingId: Record<string, number>;
};

type StartupRampRow = {
  buildingId: string;
  buildingName: string;
  maxRampKw: number;
  rampTs: string | null;
  peakKw: number | null;
  rampPctOfPeak: number | null;
};
type StartupMonthlyPoint = {
  buildingId: string;
  monthKey: string;
  maxRampKw: number;
  rampTs: string | null;
};

type PeakTimingRow = {
  hour: number;
  hourLabel: string;
  dailyPeakCount: number;
};

type InsightSeverity = "elevated" | "high" | "critical";
type InsightItem = {
  key: string;
  severity: InsightSeverity;
  title: string;
  detail: string;
};

type AfterHoursRow = {
  buildingId: string;
  buildingName: string;
  nightBaseloadPct: number;
  avgNightKw: number;
  peakWeekdayKw: number;
  nightIntervalsCount: number;
  trendPct: number | null;
};
type AfterHoursBaseloadPoint = {
  buildingId: string;
  monthKey: string;
  avgNightKw: number;
  peakWeekdayKw: number;
};
type WeekendMonthlyPoint = {
  buildingId: string;
  monthKey: string;
  weekendKwhAvg: number | null;
  weekdayKwhAvg: number | null;
};
type LoadShapePoint = {
  buildingId: string;
  monthKey: string;
  slotIndex: number;
  hhmm: string;
  avgKw: number;
  intervalsCount: number;
};
type DemandMonthlyFactPoint = {
  buildingId: string;
  monthKey: string;
  adjustedDemandKw: number | null;
  tariffMinKw: number | null;
  ratchetKw: number | null;
  billingDemandKw: number | null;
  effectiveDemandRateUsdPerKw: number | null;
};
type MonthlyTopPeakPoint = {
  buildingId: string;
  monthKey: string;
  peakRank: number;
  peakKw: number | null;
  peakTs: string | null;
};

const SERIES_COLORS = [
  "#1d4ed8",
  "#059669",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#0f766e",
  "#db2777",
  "#4f46e5",
  "#0369a1",
  "#65a30d",
];

export default function GreenButtonPage() {
  const { loading: authLoading, orgId } = useAuthGate(true);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const [refreshToken, setRefreshToken] = React.useState(0);
  const [isIngesting, setIsIngesting] = React.useState(false);
  const [progressText, setProgressText] = React.useState("");
  const [ingestResults, setIngestResults] = React.useState<IngestResult[]>([]);
  const [isRefreshingAnalytics, setIsRefreshingAnalytics] = React.useState(false);
  const [refreshResult, setRefreshResult] = React.useState<RefreshRunResult | null>(null);

  const [stats, setStats] = React.useState<{
    totalFiles: number;
    buildingsCovered: number;
    latestImportAt: string | null;
    earliestInterval: string | null;
    latestInterval: string | null;
  }>({
    totalFiles: 0,
    buildingsCovered: 0,
    latestImportAt: null,
    earliestInterval: null,
    latestInterval: null,
  });
  const [statsError, setStatsError] = React.useState<string | null>(null);
  const [buildingOptions, setBuildingOptions] = React.useState<BuildingOption[]>([]);
  const [selectedBuildingIds, setSelectedBuildingIds] = React.useState<string[]>([]);
  const [demandRows, setDemandRows] = React.useState<DemandRow[]>([]);
  const [monthlyEnergyRows, setMonthlyEnergyRows] = React.useState<MonthlyEnergyRow[]>([]);
  const [kpiMonthKey, setKpiMonthKey] = React.useState<string>("");
  const [serviceKpis, setServiceKpis] = React.useState<DistrictKpis | null>(null);
  const [demandLoading, setDemandLoading] = React.useState(false);
  const [demandError, setDemandError] = React.useState<string | null>(null);
  const [startupMonthKey, setStartupMonthKey] = React.useState<string>("");
  const [startupRows, setStartupRows] = React.useState<StartupRampRow[]>([]);
  const [startupMonthlyPoints, setStartupMonthlyPoints] = React.useState<StartupMonthlyPoint[]>([]);
  const [startupLoading, setStartupLoading] = React.useState(false);
  const [startupError, setStartupError] = React.useState<string | null>(null);
  const [peakTimingRows, setPeakTimingRows] = React.useState<PeakTimingRow[]>([]);
  const [peakTimingLoading, setPeakTimingLoading] = React.useState(false);
  const [peakTimingError, setPeakTimingError] = React.useState<string | null>(null);
  const [afterHoursRows, setAfterHoursRows] = React.useState<AfterHoursRow[]>([]);
  const [afterHoursBaseloadPoints, setAfterHoursBaseloadPoints] = React.useState<AfterHoursBaseloadPoint[]>([]);
  const [weekendMonthlyPoints, setWeekendMonthlyPoints] = React.useState<WeekendMonthlyPoint[]>([]);
  const [loadShapePoints, setLoadShapePoints] = React.useState<LoadShapePoint[]>([]);
  const [loadShapeMonthKeyUsed, setLoadShapeMonthKeyUsed] = React.useState<string>("");
  const [demandMonthlyFacts, setDemandMonthlyFacts] = React.useState<DemandMonthlyFactPoint[]>([]);
  const [monthlyTopPeakPoints, setMonthlyTopPeakPoints] = React.useState<MonthlyTopPeakPoint[]>([]);
  const [afterHoursLoading, setAfterHoursLoading] = React.useState(false);
  const [afterHoursError, setAfterHoursError] = React.useState<string | null>(null);
  const [loadShapeLoading, setLoadShapeLoading] = React.useState(false);
  const [loadShapeError, setLoadShapeError] = React.useState<string | null>(null);

  const fmtDateTime = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString() : "â€”";
  const fmtCstCdtDateTime = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString(undefined, {
          timeZone: "America/Chicago",
        })
      : "â€”";
  const fmtMonth = (monthKey: string) => {
    const [y, m] = monthKey.split("-").map(Number);
    const d = new Date(y, (m || 1) - 1, 1);
    return d.toLocaleString(undefined, { month: "short", year: "numeric" });
  };
  const prevMonthKey = (monthKey: string) => {
    const [y, m] = monthKey.split("-").map(Number);
    if (!y || !m) return "";
    const d = new Date(y, m - 1, 1);
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const fmtSlotLocalTime = (slotIndex: number): string => {
    const slot = ((Math.trunc(slotIndex) % 96) + 96) % 96;
    const hour24 = Math.floor(slot / 4);
    const minute = (slot % 4) * 15;
    const suffix = hour24 >= 12 ? "PM" : "AM";
    const hour12 = ((hour24 + 11) % 12) + 1;
    return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
  };
  const weekdaysInMonth = (monthKey: string): number => {
    const [y, m] = monthKey.split("-").map(Number);
    if (!y || !m) return 0;
    const daysInMonth = new Date(y, m, 0).getDate();
    let weekdays = 0;
    for (let day = 1; day <= daysInMonth; day += 1) {
      const dow = new Date(y, m - 1, day).getDay(); // 0=Sun..6=Sat
      if (dow >= 1 && dow <= 5) weekdays += 1;
    }
    return weekdays;
  };
  const getChicagoParts = (iso: string) => {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return null;
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(d);
    const num = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? NaN);
    const year = num("year");
    const month = num("month");
    const day = num("day");
    const hour = num("hour");
    const minute = num("minute");
    if (![year, month, day, hour, minute].every((n) => Number.isFinite(n))) return null;
    return { year, month, day, hour, minute };
  };

  const loadPageData = React.useCallback(async () => {
    if (!orgId) return;
    setStatsError(null);

    const [filesRes, latestImportRes, cacheBuildingsRes, earliestIntervalRes, latestIntervalRes] =
      await Promise.allSettled([
      supabase
        .from("green_button_imports")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId),
      supabase
        .from("green_button_imports")
        .select("created_at")
            .eq("org_id", orgId)
            .order("created_at", { ascending: false })
            .limit(1),
      supabase
        .from("green_button_monthly_peak_cache")
        .select("building_id")
        .eq("org_id", orgId)
        .order("building_id", { ascending: true }),
      supabase
        .from("green_button_intervals")
        .select("interval_start_utc")
        .eq("org_id", orgId)
        .order("interval_start_utc", { ascending: true })
        .limit(1),
      supabase
        .from("green_button_intervals")
        .select("interval_start_utc")
        .eq("org_id", orgId)
        .order("interval_start_utc", { ascending: false })
        .limit(1),
      ]);

    let filesCount = 0;
    let latestImportAt: string | null = null;
    let buildingsCovered = 0;
    let earliest: string | null = null;
    let latest: string | null = null;
    const errors: string[] = [];

    if (filesRes.status === "fulfilled") {
      if (filesRes.value.error) {
        errors.push(`Imports count: ${filesRes.value.error.message}`);
      } else {
        filesCount = filesRes.value.count ?? 0;
      }
    } else {
      errors.push(`Imports count: ${String(filesRes.reason)}`);
    }

    if (latestImportRes.status === "fulfilled") {
      if (latestImportRes.value.error) {
        errors.push(`Latest import: ${latestImportRes.value.error.message}`);
      } else {
        latestImportAt =
          (latestImportRes.value.data?.[0] as { created_at?: string } | undefined)?.created_at ?? null;
      }
    } else {
      errors.push(`Latest import: ${String(latestImportRes.reason)}`);
    }

    if (cacheBuildingsRes.status === "fulfilled") {
      if (cacheBuildingsRes.value.error) {
        errors.push(`Buildings covered: ${cacheBuildingsRes.value.error.message}`);
      } else {
        const buildingSet = new Set(
          ((cacheBuildingsRes.value.data ?? []) as Array<{ building_id: string | null }>)
            .map((r) => r.building_id)
            .filter((v): v is string => typeof v === "string" && v.length > 0)
        );
        buildingsCovered = buildingSet.size;
      }
    } else {
      errors.push(`Buildings covered: ${String(cacheBuildingsRes.reason)}`);
    }

    if (earliestIntervalRes.status === "fulfilled") {
      if (earliestIntervalRes.value.error) {
        errors.push(`Earliest interval: ${earliestIntervalRes.value.error.message}`);
      } else {
        earliest =
          (earliestIntervalRes.value.data?.[0] as {
            interval_start_utc?: string;
          } | undefined)?.interval_start_utc ??
          null;
      }
    } else {
      errors.push(`Earliest interval: ${String(earliestIntervalRes.reason)}`);
    }

    if (latestIntervalRes.status === "fulfilled") {
      if (latestIntervalRes.value.error) {
        errors.push(`Latest interval: ${latestIntervalRes.value.error.message}`);
      } else {
        latest =
          (latestIntervalRes.value.data?.[0] as {
            interval_start_utc?: string;
          } | undefined)?.interval_start_utc ??
          null;
      }
    } else {
      errors.push(`Latest interval: ${String(latestIntervalRes.reason)}`);
    }

    setStats({
      totalFiles: filesCount,
      buildingsCovered,
      latestImportAt,
      earliestInterval: earliest,
      latestInterval: latest,
    });

    if (errors.length > 0) {
      setStatsError(errors.join(" | "));
    }
  }, [orgId]);

  React.useEffect(() => {
    if (!orgId) return;
    loadPageData();
  }, [orgId, refreshToken, loadPageData]);

  const incompleteLatestMonthKey = React.useMemo(() => {
    if (!stats.latestInterval) return "";
    const local = getChicagoParts(stats.latestInterval);
    if (!local) return "";
    const y = local.year;
    const m = local.month - 1;
    const day = local.day;
    const hh = local.hour;
    const mm = local.minute;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const appearsComplete = day === daysInMonth && hh === 23 && mm >= 45;
    if (appearsComplete) return "";
    return `${y}-${String(m + 1).padStart(2, "0")}`;
  }, [stats.latestInterval]);

  React.useEffect(() => {
    let cancelled = false;
    if (!orgId) return;

    (async () => {
      setDemandLoading(true);
      setDemandError(null);
      try {
        const since = new Date();
        since.setDate(1);
        since.setMonth(since.getMonth() - 36);
        const sinceMonth = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, "0")}-01`;

        const [
          { data: bRows, error: bErr },
          { data: cacheRows, error: cacheErr },
          { data: historyRows, error: historyErr },
          { data: energyRows, error: energyErr },
          { data: weekendRows, error: weekendErr },
          { data: demandFactRows, error: demandFactErr },
          { data: topPeakRows, error: topPeakErr },
          { data: loadShapeCoverageRows, error: loadShapeCoverageErr },
        ] = await Promise.all([
          supabase.from("buildings").select("id,name,square_feet").eq("org_id", orgId).order("name", { ascending: true }),
          supabase
            .from("green_button_monthly_peak_cache")
            .select("building_id,month_start,peak_kw,peak_interval_start_utc")
            .eq("org_id", orgId)
            .gte("month_start", sinceMonth),
          supabase
            .from("green_button_monthly_peak_history")
            .select("building_id,month_start,peak_kw,peak_interval_start_utc")
            .eq("org_id", orgId)
            .gte("month_start", sinceMonth),
          supabase
            .from("green_button_monthly_energy_mv")
            .select("building_id,month_start,kwh_total")
            .eq("org_id", orgId)
            .gte("month_start", sinceMonth),
          supabase
            .from("green_button_weekend_ops_monthly_mv")
            .select("building_id,month_start,weekend_kwh_avg,weekday_kwh_avg")
            .eq("org_id", orgId)
            .gte("month_start", sinceMonth),
          supabase
            .from("green_button_demand_facts_monthly_mv")
            .select(
              "building_id,month_start,adjusted_demand_kw,tariff_min_kw,ratchet_kw,billing_demand_kw,effective_demand_rate_usd_per_kw"
            )
            .eq("org_id", orgId)
            .gte("month_start", sinceMonth),
          supabase
            .from("green_button_monthly_top_peaks_mv")
            .select("building_id,month_start,peak_rank,peak_kw,peak_interval_start_utc")
            .eq("org_id", orgId)
            .gte("month_start", sinceMonth),
          supabase
            .from("green_button_load_shape_monthly_cache")
            .select("building_id,month_start,weekday_days_count")
            .eq("org_id", orgId)
            .eq("slot_index", 0)
            .gte("month_start", sinceMonth),
        ]);

        if (bErr) throw bErr;
        if (cacheErr) throw cacheErr;
        if (historyErr) throw historyErr;
        if (energyErr) throw energyErr;
        if (weekendErr) throw weekendErr;
        if (demandFactErr) throw demandFactErr;
        if (topPeakErr) throw topPeakErr;
        if (loadShapeCoverageErr) throw loadShapeCoverageErr;
        if (cancelled) return;

        const buildingList = ((bRows ?? []) as Array<{
          id: string;
          name: string;
          square_feet: number | null;
        }>).map((b) => ({
          id: b.id,
          name: b.name,
          squareFeet: b.square_feet != null ? Number(b.square_feet) : null,
        }));
        const monthMap = new Map<string, DemandRow>();
        const historyByKey = new Map<
          string,
          { buildingId: string; monthKey: string; peakKw: number; peakTs: string }
        >();
        for (const row of (historyRows ?? []) as Array<{
          building_id: string | null;
          month_start: string | null;
          peak_kw: number | null;
          peak_interval_start_utc: string | null;
        }>) {
          const buildingId = String(row.building_id ?? "");
          const monthKey = String(row.month_start ?? "").slice(0, 7);
          const peakKw = Number(row.peak_kw ?? NaN);
          const peakTs = String(row.peak_interval_start_utc ?? "");
          if (!buildingId || !monthKey || !Number.isFinite(peakKw) || !peakTs) continue;
          historyByKey.set(`${buildingId}|${monthKey}`, { buildingId, monthKey, peakKw, peakTs });
        }
        for (const row of (cacheRows ?? []) as Array<{
          building_id: string | null;
          month_start: string | null;
          peak_kw: number | null;
          peak_interval_start_utc: string | null;
        }>) {
          const buildingId = String(row.building_id ?? "");
          const monthKey = String(row.month_start ?? "").slice(0, 7);
          const peakKw = Number(row.peak_kw ?? NaN);
          const peakTs = String(row.peak_interval_start_utc ?? "");
          if (!buildingId || !monthKey || !Number.isFinite(peakKw) || !peakTs) continue;
          historyByKey.set(`${buildingId}|${monthKey}`, { buildingId, monthKey, peakKw, peakTs });
        }

        for (const row of historyByKey.values()) {
          const buildingId = row.buildingId;
          const monthKey = row.monthKey;
          const kw = row.peakKw;
          const ts = row.peakTs;

          if (!monthMap.has(monthKey)) {
            monthMap.set(monthKey, {
              monthKey,
              monthLabel: fmtMonth(monthKey),
              peaksByBuildingId: {},
            });
          }
          const m = monthMap.get(monthKey)!;
          const existing = m.peaksByBuildingId[buildingId];
          if (!existing || kw > existing.kw) {
            m.peaksByBuildingId[buildingId] = { kw, ts };
          }
        }

        const maxObservedWeekdaysByBuildingMonth = new Map<string, number>();
        for (const row of (loadShapeCoverageRows ?? []) as Array<{
          building_id: string | null;
          month_start: string | null;
          weekday_days_count: number | null;
        }>) {
          const buildingId = String(row.building_id ?? "");
          const monthKey = String(row.month_start ?? "").slice(0, 7);
          const observedWeekdays = Number(row.weekday_days_count ?? 0);
          if (!buildingId || !monthKey || !Number.isFinite(observedWeekdays)) continue;
          const key = `${buildingId}|${monthKey}`;
          const prev = maxObservedWeekdaysByBuildingMonth.get(key) ?? 0;
          if (observedWeekdays > prev) {
            maxObservedWeekdaysByBuildingMonth.set(key, observedWeekdays);
          }
        }

        const monthHasFullCoverage = new Map<string, boolean>();
        const buildingIdsByMonth = new Map<string, Set<string>>();
        for (const { buildingId, monthKey } of historyByKey.values()) {
          if (!buildingIdsByMonth.has(monthKey)) buildingIdsByMonth.set(monthKey, new Set<string>());
          buildingIdsByMonth.get(monthKey)?.add(buildingId);
        }
        for (const [monthKey, buildingIds] of buildingIdsByMonth.entries()) {
          const expectedWeekdays = weekdaysInMonth(monthKey);
          const fullForMonth = Array.from(buildingIds).some((buildingId) => {
            const observed = maxObservedWeekdaysByBuildingMonth.get(`${buildingId}|${monthKey}`) ?? 0;
            return observed >= expectedWeekdays && expectedWeekdays > 0;
          });
          monthHasFullCoverage.set(monthKey, fullForMonth);
        }

        const rows = Array.from(monthMap.values())
          .filter((r) => monthHasFullCoverage.get(r.monthKey) === true)
          .filter((r) => !incompleteLatestMonthKey || r.monthKey !== incompleteLatestMonthKey)
          .sort((a, b) => a.monthKey.localeCompare(b.monthKey));
        const energyMonthMap = new Map<string, MonthlyEnergyRow>();
        for (const row of (energyRows ?? []) as Array<{
          building_id: string | null;
          month_start: string | null;
          kwh_total: number | null;
        }>) {
          const buildingId = String(row.building_id ?? "");
          const monthKey = String(row.month_start ?? "").slice(0, 7);
          const kwh = Number(row.kwh_total ?? NaN);
          if (!buildingId || !monthKey || !Number.isFinite(kwh)) continue;

          if (!energyMonthMap.has(monthKey)) {
            energyMonthMap.set(monthKey, {
              monthKey,
              monthLabel: fmtMonth(monthKey),
              kwhByBuildingId: {},
            });
          }
          const monthRow = energyMonthMap.get(monthKey)!;
          monthRow.kwhByBuildingId[buildingId] = kwh;
        }
        const monthlyEnergyComputed = Array.from(energyMonthMap.values())
          .filter((r) => !incompleteLatestMonthKey || r.monthKey !== incompleteLatestMonthKey)
          .sort((a, b) => a.monthKey.localeCompare(b.monthKey));
        const weekendMonthlyComputed: WeekendMonthlyPoint[] = ((weekendRows ?? []) as Array<{
          building_id: string | null;
          month_start: string | null;
          weekend_kwh_avg: number | null;
          weekday_kwh_avg: number | null;
        }>)
          .map((r) => ({
            buildingId: String(r.building_id ?? ""),
            monthKey: String(r.month_start ?? "").slice(0, 7),
            weekendKwhAvg:
              typeof r.weekend_kwh_avg === "number" && Number.isFinite(r.weekend_kwh_avg)
                ? r.weekend_kwh_avg
                : null,
            weekdayKwhAvg:
              typeof r.weekday_kwh_avg === "number" && Number.isFinite(r.weekday_kwh_avg)
                ? r.weekday_kwh_avg
                : null,
          }))
          .filter(
            (r) =>
              r.buildingId.length > 0 &&
              r.monthKey.length === 7 &&
              (!incompleteLatestMonthKey || r.monthKey !== incompleteLatestMonthKey)
          );
        const demandMonthlyFactsComputed: DemandMonthlyFactPoint[] = ((demandFactRows ?? []) as Array<{
          building_id: string | null;
          month_start: string | null;
          adjusted_demand_kw: number | null;
          tariff_min_kw: number | null;
          ratchet_kw: number | null;
          billing_demand_kw: number | null;
          effective_demand_rate_usd_per_kw: number | null;
        }>)
          .map((r) => ({
            buildingId: String(r.building_id ?? ""),
            monthKey: String(r.month_start ?? "").slice(0, 7),
            adjustedDemandKw:
              typeof r.adjusted_demand_kw === "number" && Number.isFinite(r.adjusted_demand_kw)
                ? r.adjusted_demand_kw
                : null,
            tariffMinKw:
              typeof r.tariff_min_kw === "number" && Number.isFinite(r.tariff_min_kw)
                ? r.tariff_min_kw
                : null,
            ratchetKw:
              typeof r.ratchet_kw === "number" && Number.isFinite(r.ratchet_kw)
                ? r.ratchet_kw
                : null,
            billingDemandKw:
              typeof r.billing_demand_kw === "number" && Number.isFinite(r.billing_demand_kw)
                ? r.billing_demand_kw
                : null,
            effectiveDemandRateUsdPerKw:
              typeof r.effective_demand_rate_usd_per_kw === "number" &&
              Number.isFinite(r.effective_demand_rate_usd_per_kw)
                ? r.effective_demand_rate_usd_per_kw
                : null,
          }))
          .filter(
            (r) =>
              r.buildingId.length > 0 &&
              r.monthKey.length === 7 &&
              (!incompleteLatestMonthKey || r.monthKey !== incompleteLatestMonthKey)
          );
        const monthlyTopPeaksComputed: MonthlyTopPeakPoint[] = ((topPeakRows ?? []) as Array<{
          building_id: string | null;
          month_start: string | null;
          peak_rank: number | null;
          peak_kw: number | null;
          peak_interval_start_utc: string | null;
        }>)
          .map((r) => ({
            buildingId: String(r.building_id ?? ""),
            monthKey: String(r.month_start ?? "").slice(0, 7),
            peakRank: Number(r.peak_rank ?? NaN),
            peakKw:
              typeof r.peak_kw === "number" && Number.isFinite(r.peak_kw)
                ? r.peak_kw
                : null,
            peakTs:
              typeof r.peak_interval_start_utc === "string" &&
              r.peak_interval_start_utc.length > 0
                ? r.peak_interval_start_utc
                : null,
          }))
          .filter(
            (r) =>
              r.buildingId.length > 0 &&
              r.monthKey.length === 7 &&
              (!incompleteLatestMonthKey || r.monthKey !== incompleteLatestMonthKey) &&
              Number.isInteger(r.peakRank) &&
              r.peakRank >= 1 &&
              r.peakRank <= 5
          );
        const buildingsWithData = new Set(rows.flatMap((r) => Object.keys(r.peaksByBuildingId)));
        const filteredBuildingList = buildingList.filter((b) => buildingsWithData.has(b.id));

        setBuildingOptions(filteredBuildingList);
        setSelectedBuildingIds((prev) => {
          const valid = new Set(filteredBuildingList.map((b) => b.id));
          const preserved = prev.filter((id) => valid.has(id));
          return preserved.length ? preserved : filteredBuildingList.map((b) => b.id);
        });
        setDemandRows(rows);
        setMonthlyEnergyRows(monthlyEnergyComputed);
        setWeekendMonthlyPoints(weekendMonthlyComputed);
        setDemandMonthlyFacts(demandMonthlyFactsComputed);
        setMonthlyTopPeakPoints(monthlyTopPeaksComputed);
      } catch (e: any) {
        if (!cancelled) setDemandError(e?.message ?? "Failed to load demand exposure data");
      } finally {
        if (!cancelled) setDemandLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [incompleteLatestMonthKey, orgId, refreshToken]);

  const selectedBuildings = React.useMemo(() => {
    if (!selectedBuildingIds.length) return buildingOptions;
    const selected = new Set(selectedBuildingIds);
    return buildingOptions.filter((b) => selected.has(b.id));
  }, [buildingOptions, selectedBuildingIds]);

  const startupMonthOptions = React.useMemo(() => {
    const selectedIdSet = new Set(selectedBuildingIds);
    return demandRows
      .filter((r) => {
        if (selectedIdSet.size === 0) return true;
        return selectedBuildingIds.some((id) => {
          const peak = r.peaksByBuildingId[id];
          return !!peak && Number.isFinite(peak.kw);
        });
      })
      .map((r) => ({ key: r.monthKey, label: r.monthLabel }));
  }, [demandRows, selectedBuildingIds]);
  const kpiMonthOptions = React.useMemo(() => {
    const selectedIdSet = new Set(selectedBuildingIds);
    if (monthlyEnergyRows.length > 0) {
      const energyOptions = monthlyEnergyRows
        .filter((r) => {
          if (selectedIdSet.size === 0) return true;
          return selectedBuildingIds.some((id) => {
            const v = r.kwhByBuildingId[id];
            return typeof v === "number" && Number.isFinite(v);
          });
        })
        .map((r) => ({ key: r.monthKey, label: r.monthLabel }));
      if (energyOptions.length > 0) return energyOptions;
    }
    return startupMonthOptions;
  }, [monthlyEnergyRows, selectedBuildingIds, startupMonthOptions]);

  React.useEffect(() => {
    if (!kpiMonthOptions.length) {
      setKpiMonthKey("");
      return;
    }
    const existing = kpiMonthOptions.some((m) => m.key === kpiMonthKey);
    if (!existing) {
      setKpiMonthKey(kpiMonthOptions[kpiMonthOptions.length - 1].key);
    }
  }, [kpiMonthKey, kpiMonthOptions]);

  React.useEffect(() => {
    setStartupMonthKey(kpiMonthKey);
  }, [kpiMonthKey]);

  React.useEffect(() => {
    let cancelled = false;
    if (!orgId) {
      setServiceKpis(null);
      return;
    }

    const targetBuildingIds =
      selectedBuildingIds.length > 0
        ? selectedBuildingIds
        : buildingOptions.map((b) => b.id);
    const resolvedKpiMonthKey =
      kpiMonthKey || monthlyEnergyRows[monthlyEnergyRows.length - 1]?.monthKey || "";
    if (!resolvedKpiMonthKey) {
      setServiceKpis(null);
      return;
    }

    const priorEnergyMonthKey = prevMonthKey(resolvedKpiMonthKey);
    const priorEnergyMonth =
      monthlyEnergyRows.find((r) => r.monthKey === priorEnergyMonthKey) ?? null;
    const priorMonthKwhTotal = priorEnergyMonth
      ? targetBuildingIds.reduce((sum, id) => sum + (priorEnergyMonth.kwhByBuildingId[id] ?? 0), 0)
      : null;

    const peakMonthsSorted = demandRows.map((r) => r.monthKey).sort((a, b) => a.localeCompare(b));
    const monthIndex = peakMonthsSorted.findIndex((m) => m === resolvedKpiMonthKey);
    const prior3MonthKeys =
      monthIndex > 0 ? peakMonthsSorted.slice(Math.max(0, monthIndex - 3), monthIndex) : [];
    const prior3DistrictPeaks = prior3MonthKeys
      .map((monthKey) => {
        const monthRow = demandRows.find((r) => r.monthKey === monthKey);
        if (!monthRow) return null;
        const monthMax = targetBuildingIds.reduce((max, id) => {
          const kw = monthRow.peaksByBuildingId[id]?.kw ?? 0;
          return kw > max ? kw : max;
        }, 0);
        return monthMax > 0 ? monthMax : null;
      })
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

    const currentPeakMonth = demandRows.find((r) => r.monthKey === resolvedKpiMonthKey) ?? null;
    let peakRowForMonth: { kw: number; ts: string } | null = null;
    if (currentPeakMonth) {
      for (const buildingId of targetBuildingIds) {
        const candidate = currentPeakMonth.peaksByBuildingId[buildingId];
        if (!candidate) continue;
        if (!peakRowForMonth || candidate.kw > peakRowForMonth.kw) {
          peakRowForMonth = candidate;
        }
      }
    }

    const buildingMonthlyEnergy = monthlyEnergyRows.flatMap((row) =>
      Object.entries(row.kwhByBuildingId).map(([buildingId, kwhTotal]) => ({
        buildingId,
        month: row.monthKey as `${number}${number}${number}${number}-${number}${number}`,
        kwh_total: Number.isFinite(kwhTotal) ? kwhTotal : null,
      }))
    );
    const sqftByBuildingId = new Map(buildingOptions.map((b) => [b.id, b.squareFeet]));
    const buildingBaseload = afterHoursBaseloadPoints.map((p) => ({
      buildingId: p.buildingId,
      month: p.monthKey as `${number}${number}${number}${number}-${number}${number}`,
      avg_2am_kw_weekdays: p.avgNightKw,
      peak_weekday_kw: p.peakWeekdayKw,
    }));

    const currentAfterHoursValues = buildingBaseload
      .filter(
        (row) =>
          row.month ===
            (resolvedKpiMonthKey as `${number}${number}${number}${number}-${number}${number}`) &&
          typeof row.avg_2am_kw_weekdays === "number" &&
          Number.isFinite(row.avg_2am_kw_weekdays) &&
          typeof row.peak_weekday_kw === "number" &&
          Number.isFinite(row.peak_weekday_kw) &&
          row.peak_weekday_kw > 0
      )
      .map((row) => ((row.avg_2am_kw_weekdays as number) / (row.peak_weekday_kw as number)) * 100)
      .sort((a, b) => a - b);

    const percentile = (sortedValues: number[], p: number): number | null => {
      if (sortedValues.length === 0) return null;
      if (sortedValues.length === 1) return sortedValues[0];
      const idx = (sortedValues.length - 1) * p;
      const lower = Math.floor(idx);
      const upper = Math.ceil(idx);
      if (lower === upper) return sortedValues[lower];
      const w = idx - lower;
      return sortedValues[lower] * (1 - w) + sortedValues[upper] * w;
    };

    const prev1 = prevMonthKey(resolvedKpiMonthKey);
    const prev2 = prev1 ? prevMonthKey(prev1) : "";
    const prev3 = prev2 ? prevMonthKey(prev2) : "";
    const prior3Months = [prev1, prev2, prev3].filter(Boolean);
    const priorDistrictAfterHoursAverages = prior3Months
      .map((monthKey) => {
        const values = buildingBaseload
          .filter(
            (row) =>
              row.month === monthKey &&
              typeof row.avg_2am_kw_weekdays === "number" &&
              Number.isFinite(row.avg_2am_kw_weekdays) &&
              typeof row.peak_weekday_kw === "number" &&
              Number.isFinite(row.peak_weekday_kw) &&
              row.peak_weekday_kw > 0
          )
          .map((row) => ((row.avg_2am_kw_weekdays as number) / (row.peak_weekday_kw as number)) * 100);
        if (values.length === 0) return null;
        return values.reduce((sum, v) => sum + v, 0) / values.length;
      })
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

    const prior3moAvgAfterHoursWPerSqft =
      priorDistrictAfterHoursAverages.length > 0
        ? priorDistrictAfterHoursAverages.reduce((sum, v) => sum + v, 0) /
          priorDistrictAfterHoursAverages.length
        : null;
    const buildingWeekend = weekendMonthlyPoints.map((p) => ({
      buildingId: p.buildingId,
      month: p.monthKey as `${number}${number}${number}${number}-${number}${number}`,
      weekend_kwh_avg: p.weekendKwhAvg,
      weekday_kwh_avg: p.weekdayKwhAvg,
    }));
    const priorWeekendRows = weekendMonthlyPoints.filter(
      (p) =>
        p.monthKey === priorEnergyMonthKey &&
        targetBuildingIds.includes(p.buildingId) &&
        typeof p.weekendKwhAvg === "number" &&
        Number.isFinite(p.weekendKwhAvg) &&
        typeof p.weekdayKwhAvg === "number" &&
        Number.isFinite(p.weekdayKwhAvg) &&
        p.weekdayKwhAvg > 0
    );
    const priorMonthWeekendIndexPct =
      priorWeekendRows.length > 0
        ? priorWeekendRows.reduce(
            (sum, row) => sum + ((row.weekendKwhAvg as number) / (row.weekdayKwhAvg as number)) * 100,
            0
          ) / priorWeekendRows.length
        : null;
    const buildingDemandFacts = demandMonthlyFacts
      .filter(
        (row) =>
          row.monthKey === resolvedKpiMonthKey && targetBuildingIds.includes(row.buildingId)
      )
      .map((row) => ({
        buildingId: row.buildingId,
        buildingName:
          buildingOptions.find((b) => b.id === row.buildingId)?.name ?? row.buildingId,
        adjusted_demand_kw: row.adjustedDemandKw,
        tariff_min_kw: row.tariffMinKw,
        ratchet_kw: row.ratchetKw,
        billing_demand_kw: row.billingDemandKw,
        effective_demand_rate_usd_per_kw: row.effectiveDemandRateUsdPerKw,
      }));
    const computeSavingsFromFacts = (
      facts: Array<{
        adjusted_demand_kw: number | null;
        tariff_min_kw: number | null;
        ratchet_kw: number | null;
        effective_demand_rate_usd_per_kw: number | null;
      }>
    ): number => {
      const toleranceKw = 0.5;
      let total = 0;
      for (const fact of facts) {
        const adjusted = fact.adjusted_demand_kw;
        if (typeof adjusted !== "number" || !Number.isFinite(adjusted) || adjusted < 0) continue;

        const thresholdCandidates = [fact.tariff_min_kw, fact.ratchet_kw].filter(
          (v): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0
        );
        if (thresholdCandidates.length === 0) continue;
        const threshold = Math.max(...thresholdCandidates);
        if (adjusted <= threshold + toleranceKw) continue;

        const demandRate = fact.effective_demand_rate_usd_per_kw;
        if (typeof demandRate !== "number" || !Number.isFinite(demandRate) || demandRate < 0) continue;

        total += (adjusted - threshold) * demandRate;
      }
      return total;
    };
    const priorMonthFactsForSavings = demandMonthlyFacts
      .filter(
        (row) =>
          row.monthKey === priorEnergyMonthKey && targetBuildingIds.includes(row.buildingId)
      )
      .map((row) => ({
        adjusted_demand_kw: row.adjustedDemandKw,
        tariff_min_kw: row.tariffMinKw,
        ratchet_kw: row.ratchetKw,
        effective_demand_rate_usd_per_kw: row.effectiveDemandRateUsdPerKw,
      }));
    const priorMonthEstimatedDemandSavingsUsd =
      priorMonthFactsForSavings.length > 0
        ? computeSavingsFromFacts(priorMonthFactsForSavings)
        : null;
    const monthlyTopPeaks = monthlyTopPeakPoints
      .filter(
        (p) =>
          p.monthKey === resolvedKpiMonthKey &&
          targetBuildingIds.includes(p.buildingId)
      )
      .map((p) => ({
        buildingId: p.buildingId,
        month: p.monthKey as `${number}${number}${number}${number}-${number}${number}`,
        peak_rank: p.peakRank,
        peak_kw: p.peakKw,
        peak_interval_start_utc: p.peakTs,
      }));
    const peakByBuildingMonth = new Map<string, number>();
    for (const monthRow of demandRows) {
      for (const [buildingId, peak] of Object.entries(monthRow.peaksByBuildingId)) {
        if (peak && Number.isFinite(peak.kw)) {
          peakByBuildingMonth.set(`${buildingId}|${monthRow.monthKey}`, peak.kw);
        }
      }
    }
    const buildingMonthlyOps = startupMonthlyPoints.map((p) => ({
      buildingId: p.buildingId,
      month: p.monthKey as `${number}${number}${number}${number}-${number}${number}`,
      monthly_peak_kw: peakByBuildingMonth.get(`${p.buildingId}|${p.monthKey}`) ?? null,
      max_morning_ramp_kw: p.maxRampKw,
      sqft: sqftByBuildingId.get(p.buildingId) ?? null,
    }));
    const priorStartupMonthKeys = [prev1, prev2, prev3].filter(Boolean);
    const priorDistrictStartupAverages = priorStartupMonthKeys
      .map((monthKey) => {
        const values = buildingMonthlyOps
          .filter(
            (row) =>
              row.month === monthKey &&
              targetBuildingIds.includes(row.buildingId) &&
              typeof row.monthly_peak_kw === "number" &&
              Number.isFinite(row.monthly_peak_kw) &&
              row.monthly_peak_kw > 0 &&
              typeof row.max_morning_ramp_kw === "number" &&
              Number.isFinite(row.max_morning_ramp_kw) &&
              row.max_morning_ramp_kw >= 0
          )
          .map((row) => ((row.max_morning_ramp_kw as number) / (row.monthly_peak_kw as number)) * 100);
        if (values.length === 0) return null;
        return values.reduce((sum, v) => sum + v, 0) / values.length;
      })
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const prior3moAvgStartupIntensityPct =
      priorDistrictStartupAverages.length > 0
        ? priorDistrictStartupAverages.reduce((sum, v) => sum + v, 0) /
          priorDistrictStartupAverages.length
        : null;
    const monthHours = (monthKey: string): number | null => {
      const [yy, mm] = monthKey.split("-").map(Number);
      if (!yy || !mm) return null;
      const days = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
      return Number.isFinite(days) && days > 0 ? days * 24 : null;
    };
    const districtKwhForMonth = (monthKey: string): number | null => {
      const monthRow = monthlyEnergyRows.find((r) => r.monthKey === monthKey);
      if (!monthRow) return null;
      return targetBuildingIds.reduce(
        (sum, id) => sum + (monthRow.kwhByBuildingId[id] ?? 0),
        0
      );
    };
    const districtPeakForMonth = (monthKey: string): number | null => {
      const monthRow = demandRows.find((r) => r.monthKey === monthKey);
      if (!monthRow) return null;
      const peak = targetBuildingIds.reduce((max, id) => {
        const kw = monthRow.peaksByBuildingId[id]?.kw ?? 0;
        return kw > max ? kw : max;
      }, 0);
      return peak > 0 ? peak : null;
    };
    const hoursInPeriod = monthHours(resolvedKpiMonthKey);
    const prior3LoadFactors = prior3Months
      .map((monthKey) => {
        const kwh = districtKwhForMonth(monthKey);
        const peak = districtPeakForMonth(monthKey);
        const hours = monthHours(monthKey);
        if (
          typeof kwh !== "number" ||
          !Number.isFinite(kwh) ||
          typeof peak !== "number" ||
          !Number.isFinite(peak) ||
          peak <= 0 ||
          typeof hours !== "number" ||
          !Number.isFinite(hours) ||
          hours <= 0
        ) {
          return null;
        }
        return (kwh / (peak * hours)) * 100;
      })
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const prior3moAvgLoadFactorPct =
      prior3LoadFactors.length > 0
        ? prior3LoadFactors.reduce((sum, v) => sum + v, 0) / prior3LoadFactors.length
        : null;

    const districtIntervalAgg = peakRowForMonth
      ? [{ ts: peakRowForMonth.ts, kw_total: peakRowForMonth.kw }]
      : [];

    (async () => {
      const computed = await getDistrictKpis({
        districtId: orgId,
        month: resolvedKpiMonthKey as `${number}${number}${number}${number}-${number}${number}`,
        buildingIds: targetBuildingIds,
        buildingMonthlyEnergy,
        priorMonthKwhTotal,
        districtIntervalAgg,
        prior3moDistrictPeaks: prior3DistrictPeaks,
        buildingBaseload,
        prior3moAvgAfterHoursWPerSqft,
        afterHoursLoadPercentiles: {
          p50: percentile(currentAfterHoursValues, 0.5),
          p75: percentile(currentAfterHoursValues, 0.75),
        },
        buildingWeekend,
        priorMonthWeekendIndexPct,
        buildingMonthlyOps,
        prior3moAvgStartupIntensityPct,
        buildingDemandFacts,
        priorMonthEstimatedDemandSavingsUsd,
        monthlyTopPeaks,
        hoursInPeriod,
        prior3moAvgLoadFactorPct,
      });
      if (!cancelled) {
        setServiceKpis(computed);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    afterHoursBaseloadPoints,
    buildingOptions,
    demandMonthlyFacts,
    demandRows,
    kpiMonthKey,
    monthlyTopPeakPoints,
    monthlyEnergyRows,
    orgId,
    selectedBuildingIds,
    startupMonthlyPoints,
    weekendMonthlyPoints,
  ]);

  React.useEffect(() => {
    let cancelled = false;
    if (!orgId || !startupMonthKey) return;

    (async () => {
      setStartupLoading(true);
      setStartupError(null);
      try {
        const [y, m] = startupMonthKey.split("-").map(Number);
        if (!y || !m) throw new Error("Invalid startup month");
        const currentMonthStart = `${startupMonthKey}-01`;
        const prev1 = new Date(y, m - 2, 1);
        const prev2 = new Date(y, m - 3, 1);
        const prev3 = new Date(y, m - 4, 1);
        const prev1Start = `${prev1.getFullYear()}-${String(prev1.getMonth() + 1).padStart(2, "0")}-01`;
        const prev2Start = `${prev2.getFullYear()}-${String(prev2.getMonth() + 1).padStart(2, "0")}-01`;
        const prev3Start = `${prev3.getFullYear()}-${String(prev3.getMonth() + 1).padStart(2, "0")}-01`;
        let query = supabase
          .from("green_button_startup_intensity_monthly_mv")
          .select("building_id,month_start,max_ramp_kw,ramp_interval_start_utc")
          .eq("org_id", orgId)
          .in("month_start", [currentMonthStart, prev1Start, prev2Start, prev3Start]);

        if (selectedBuildingIds.length > 0) {
          query = query.in("building_id", selectedBuildingIds);
        }

        const { data: startupRawRows, error } = await query;
        if (error) throw error;
        if (cancelled) return;

        const startupByBuildingMonth = new Map<
          string,
          { maxRampKw: number; rampTs: string | null }
        >();
        const startupPoints: StartupMonthlyPoint[] = [];
        for (const row of (startupRawRows ?? []) as Array<{
          building_id: string | null;
          month_start: string | null;
          max_ramp_kw: number | null;
          ramp_interval_start_utc: string | null;
        }>) {
          const buildingId = String(row.building_id ?? "");
          const monthKey = String(row.month_start ?? "").slice(0, 7);
          const maxRampKw = Number(row.max_ramp_kw ?? 0);
          const rampTs = row.ramp_interval_start_utc ? String(row.ramp_interval_start_utc) : null;
          if (!buildingId || !monthKey || !Number.isFinite(maxRampKw)) continue;
          startupByBuildingMonth.set(`${buildingId}|${monthKey}`, { maxRampKw, rampTs });
          startupPoints.push({ buildingId, monthKey, maxRampKw, rampTs });
        }

        const nameById = new Map(buildingOptions.map((b) => [b.id, b.name]));
        const demandMonth = demandRows.find((r) => r.monthKey === startupMonthKey);
        const computed: StartupRampRow[] = [];
        const targetBuildingIds =
          selectedBuildingIds.length > 0
            ? selectedBuildingIds
            : buildingOptions.map((b) => b.id);

        for (const buildingId of targetBuildingIds) {
          const startup = startupByBuildingMonth.get(`${buildingId}|${startupMonthKey}`);
          const maxRamp = startup?.maxRampKw ?? 0;
          const maxRampTs = startup?.rampTs ?? null;

          const peakKw = demandMonth?.peaksByBuildingId?.[buildingId]?.kw ?? null;
          const rampPctOfPeak =
            peakKw && peakKw > 0 ? (maxRamp / peakKw) * 100 : null;

          computed.push({
            buildingId,
            buildingName: nameById.get(buildingId) ?? buildingId,
            maxRampKw: maxRamp,
            rampTs: maxRampTs,
            peakKw,
            rampPctOfPeak,
          });
        }

        computed.sort((a, b) => b.maxRampKw - a.maxRampKw);
        setStartupRows(computed);
        setStartupMonthlyPoints(startupPoints);
      } catch (e: any) {
        if (!cancelled) setStartupError(e?.message ?? "Failed to load startup intensity");
      } finally {
        if (!cancelled) setStartupLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orgId, startupMonthKey, selectedBuildingIds, buildingOptions, demandRows]);

  React.useEffect(() => {
    let cancelled = false;
    if (!orgId || !startupMonthKey) return;

    (async () => {
      setPeakTimingLoading(true);
      setPeakTimingError(null);
      try {
        const monthStart = `${startupMonthKey}-01`;
        let query = supabase
          .from("green_button_peak_timing_monthly_mv")
          .select("building_id,peak_hour_local,daily_peak_count")
          .eq("org_id", orgId)
          .eq("month_start", monthStart);

        if (selectedBuildingIds.length > 0) {
          query = query.in("building_id", selectedBuildingIds);
        }

        const { data, error } = await query;
        if (error) throw error;
        if (cancelled) return;

        const countsByHour = new Map<number, number>();
        for (const row of (data ?? []) as Array<{
          building_id: string | null;
          peak_hour_local: number | null;
          daily_peak_count: number | null;
        }>) {
          const hour = Number(row.peak_hour_local);
          const count = Number(row.daily_peak_count ?? 0);
          if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isFinite(count)) continue;
          countsByHour.set(hour, (countsByHour.get(hour) ?? 0) + count);
        }

        const rows: PeakTimingRow[] = Array.from({ length: 24 }, (_, hour) => ({
          hour,
          hourLabel: `${String(hour).padStart(2, "0")}:00`,
          dailyPeakCount: countsByHour.get(hour) ?? 0,
        }));
        setPeakTimingRows(rows);
      } catch (e: any) {
        if (!cancelled) setPeakTimingError(e?.message ?? "Failed to load peak timing profile");
      } finally {
        if (!cancelled) setPeakTimingLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orgId, startupMonthKey, selectedBuildingIds]);

  React.useEffect(() => {
    let cancelled = false;
    if (!orgId || !startupMonthKey) return;

    (async () => {
      setAfterHoursLoading(true);
      setAfterHoursError(null);
      try {
        const [y, m] = startupMonthKey.split("-").map(Number);
        if (!y || !m) throw new Error("Invalid after-hours month");
        const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
        const prev1 = new Date(y, m - 2, 1);
        const prev2 = new Date(y, m - 3, 1);
        const prev3 = new Date(y, m - 4, 1);
        const prev1Start = `${prev1.getFullYear()}-${String(prev1.getMonth() + 1).padStart(2, "0")}-01`;
        const prev2Start = `${prev2.getFullYear()}-${String(prev2.getMonth() + 1).padStart(2, "0")}-01`;
        const prev3Start = `${prev3.getFullYear()}-${String(prev3.getMonth() + 1).padStart(2, "0")}-01`;

        let query = supabase
          .from("green_button_after_hours_pct_monthly_mv")
          .select("building_id,month_start,avg_2am_kw_weekdays,peak_weekday_kw,two_am_intervals_count")
          .eq("org_id", orgId)
          .in("month_start", [monthStart, prev1Start, prev2Start, prev3Start]);

        if (selectedBuildingIds.length > 0) {
          query = query.in("building_id", selectedBuildingIds);
        }

        const { data, error } = await query;
        if (error) throw error;
        if (cancelled) return;

        const byBuildingMonth = new Map<
          string,
          { avgNightKw: number; peakWeekdayKw: number; nightIntervalsCount: number }
        >();
        const baseloadPoints: AfterHoursBaseloadPoint[] = [];
        for (const row of (data ?? []) as Array<{
          building_id: string | null;
          month_start: string | null;
          avg_2am_kw_weekdays: number | null;
          peak_weekday_kw: number | null;
          two_am_intervals_count: number | null;
        }>) {
          const buildingId = String(row.building_id ?? "");
          const month = String(row.month_start ?? "").slice(0, 10);
          const monthKey = month.slice(0, 7);
          const avgNightKw = Number(row.avg_2am_kw_weekdays ?? NaN);
          const peakWeekdayKw = Number(row.peak_weekday_kw ?? NaN);
          const nightIntervalsCount = Number(row.two_am_intervals_count ?? 0);
          if (
            !buildingId ||
            !month ||
            !Number.isFinite(avgNightKw) ||
            !Number.isFinite(peakWeekdayKw) ||
            peakWeekdayKw <= 0
          ) {
            continue;
          }
          byBuildingMonth.set(`${buildingId}|${month}`, {
            avgNightKw,
            peakWeekdayKw,
            nightIntervalsCount,
          });
          if (monthKey) {
            baseloadPoints.push({ buildingId, monthKey, avgNightKw, peakWeekdayKw });
          }
        }

        const rows: AfterHoursRow[] = [];
        const targetBuildingIds =
          selectedBuildingIds.length > 0
            ? selectedBuildingIds
            : buildingOptions.map((b) => b.id);
        const nameById = new Map(buildingOptions.map((b) => [b.id, b.name]));
        const availableMonthStarts = Array.from(
          new Set(
            targetBuildingIds.flatMap((buildingId) =>
              [monthStart, prev1Start, prev2Start, prev3Start].filter((month) =>
                byBuildingMonth.has(`${buildingId}|${month}`)
              )
            )
          )
        ).sort((a, b) => a.localeCompare(b));
        const activeMonthStart =
          availableMonthStarts.includes(monthStart)
            ? monthStart
            : availableMonthStarts[availableMonthStarts.length - 1] ?? monthStart;
        const [activeY, activeM] = activeMonthStart.slice(0, 7).split("-").map(Number);
        const activePrev1 = new Date(activeY, activeM - 2, 1);
        const activePrev2 = new Date(activeY, activeM - 3, 1);
        const activePrev1Start = `${activePrev1.getFullYear()}-${String(
          activePrev1.getMonth() + 1
        ).padStart(2, "0")}-01`;
        const activePrev2Start = `${activePrev2.getFullYear()}-${String(
          activePrev2.getMonth() + 1
        ).padStart(2, "0")}-01`;

        for (const buildingId of targetBuildingIds) {
          const curRow = byBuildingMonth.get(`${buildingId}|${activeMonthStart}`);
          if (!curRow) continue;
          const nightBaseloadPct = (curRow.avgNightKw / curRow.peakWeekdayKw) * 100;
          if (!Number.isFinite(nightBaseloadPct)) continue;

          const prevRows = [activePrev1Start, activePrev2Start]
            .map((month) => byBuildingMonth.get(`${buildingId}|${month}`))
            .filter(
              (
                r
              ): r is { avgNightKw: number; peakWeekdayKw: number; nightIntervalsCount: number } =>
                !!r
            );
          let trendPct: number | null = null;
          if (prevRows.length > 0) {
            const prevAvgPct =
              prevRows.reduce((sum, r) => sum + (r.avgNightKw / r.peakWeekdayKw) * 100, 0) /
              prevRows.length;
            if (prevAvgPct > 0) {
              trendPct = ((nightBaseloadPct - prevAvgPct) / prevAvgPct) * 100;
            }
          }

          rows.push({
            buildingId,
            buildingName: nameById.get(buildingId) ?? buildingId,
            nightBaseloadPct,
            avgNightKw: curRow.avgNightKw,
            peakWeekdayKw: curRow.peakWeekdayKw,
            nightIntervalsCount: curRow.nightIntervalsCount,
            trendPct,
          });
        }

        rows.sort((a, b) => b.nightBaseloadPct - a.nightBaseloadPct);
        setAfterHoursRows(rows);
        setAfterHoursBaseloadPoints(baseloadPoints);
      } catch (e: any) {
        if (!cancelled) setAfterHoursError(e?.message ?? "Failed to load after-hours load");
      } finally {
        if (!cancelled) setAfterHoursLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orgId, startupMonthKey, selectedBuildingIds, buildingOptions]);

  React.useEffect(() => {
    let cancelled = false;
    if (!orgId) return;
    if (selectedBuildingIds.length !== 1) {
      setLoadShapePoints([]);
      setLoadShapeMonthKeyUsed("");
      setLoadShapeError(null);
      setLoadShapeLoading(false);
      return;
    }

    (async () => {
      setLoadShapeLoading(true);
      setLoadShapeError(null);
      try {
        const selectedBuildingId = selectedBuildingIds[0];
        const pageSize = 1000;
        let from = 0;
        const allRows: Array<{
          building_id: string | null;
          month_start: string | null;
          slot_index: number | null;
          hhmm: string | null;
          avg_kw: number | null;
          intervals_count: number | null;
        }> = [];

        while (true) {
          const { data, error } = await supabase
            .from("green_button_load_shape_monthly_cache")
            .select("building_id,month_start,slot_index,hhmm,avg_kw,intervals_count")
            .eq("org_id", orgId)
            .eq("building_id", selectedBuildingId)
            .order("month_start", { ascending: false })
            .order("slot_index", { ascending: true })
            .range(from, from + pageSize - 1);
          if (error) throw error;
          const batch = (data ?? []) as Array<{
            building_id: string | null;
            month_start: string | null;
            slot_index: number | null;
            hhmm: string | null;
            avg_kw: number | null;
            intervals_count: number | null;
          }>;
          allRows.push(...batch);
          if (batch.length < pageSize) break;
          from += pageSize;
        }
        if (cancelled) return;

        const points: LoadShapePoint[] = allRows
          .map((row) => ({
            buildingId: String(row.building_id ?? ""),
            monthKey: String(row.month_start ?? "").slice(0, 7),
            slotIndex: Number(row.slot_index ?? -1),
            hhmm: String(row.hhmm ?? ""),
            avgKw: Number(row.avg_kw ?? NaN),
            intervalsCount: Number(row.intervals_count ?? 0),
          }))
          .filter(
            (row) =>
              row.buildingId.length > 0 &&
              row.monthKey.length === 7 &&
              Number.isInteger(row.slotIndex) &&
              row.slotIndex >= 0 &&
              row.slotIndex <= 95 &&
              Number.isFinite(row.avgKw)
          );

        setLoadShapePoints(points);
        const availableMonths = Array.from(new Set(points.map((p) => p.monthKey))).sort((a, b) =>
          a.localeCompare(b)
        );
        const selectedAvailable =
          startupMonthKey && availableMonths.includes(startupMonthKey) ? startupMonthKey : "";
        setLoadShapeMonthKeyUsed(selectedAvailable || availableMonths[availableMonths.length - 1] || "");
      } catch (e: any) {
        if (!cancelled) setLoadShapeError(e?.message ?? "Failed to load load-shape overview");
      } finally {
        if (!cancelled) setLoadShapeLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orgId, startupMonthKey, selectedBuildingIds]);

  const afterHoursMedian = React.useMemo(() => {
    if (!afterHoursRows.length) return null;
    const vals = afterHoursRows
      .map((r) => r.nightBaseloadPct)
      .filter((v) => Number.isFinite(v))
      .sort((a, b) => a - b);
    if (!vals.length) return null;
    const mid = Math.floor(vals.length / 2);
    if (vals.length % 2 === 0) return (vals[mid - 1] + vals[mid]) / 2;
    return vals[mid];
  }, [afterHoursRows]);

  const demandRowsInChartWindow = React.useMemo(() => {
    if (!demandRows.length) return [];

    if (!kpiMonthKey) return demandRows.slice(Math.max(0, demandRows.length - 13));

    let endIndex = demandRows.findIndex((r) => r.monthKey === kpiMonthKey);
    if (endIndex < 0) {
      for (let i = demandRows.length - 1; i >= 0; i -= 1) {
        if (demandRows[i].monthKey <= kpiMonthKey) {
          endIndex = i;
          break;
        }
      }
    }
    if (endIndex < 0) return [];

    const startIndex = Math.max(0, endIndex - 12);
    return demandRows.slice(startIndex, endIndex + 1);
  }, [demandRows, kpiMonthKey]);

  const demandChartData = React.useMemo(() => {
    return demandRowsInChartWindow.map((r) => {
      const row: Record<string, any> = { month: r.monthLabel };
      for (const b of selectedBuildings) {
        const v = r.peaksByBuildingId[b.id];
        row[b.id] = v?.kw ?? null;
        row[`${b.id}__peakTs`] = v?.ts ?? null;
      }
      return row;
    });
  }, [demandRowsInChartWindow, selectedBuildings]);

  const showLoadShapeTrailing = selectedBuildingIds.length === 1;
  const activeLoadShapeMonthKey = startupMonthKey || loadShapeMonthKeyUsed;
  const loadShapeSeriesBuildings = React.useMemo(() => {
    if (!showLoadShapeTrailing || selectedBuildingIds.length !== 1) return [];
    const idsForActiveMonth = Array.from(
      new Set(
        loadShapePoints
          .filter((p) => p.monthKey === activeLoadShapeMonthKey)
          .map((p) => p.buildingId)
      )
    ).sort((a, b) => a.localeCompare(b));

    const nameById = new Map(buildingOptions.map((b) => [b.id, b.name]));
    return idsForActiveMonth.map((id) => ({ id, name: nameById.get(id) ?? id }));
  }, [activeLoadShapeMonthKey, buildingOptions, loadShapePoints, selectedBuildingIds, showLoadShapeTrailing]);
  const loadShapeChartData = React.useMemo(() => {
    const targetBuildingIds = loadShapeSeriesBuildings.map((b) => b.id);
    const targetBuildingSet = new Set(targetBuildingIds);

    const [y, m] = activeLoadShapeMonthKey.split("-").map(Number);
    const prev1Date = y && m ? new Date(y, m - 2, 1) : null;
    const prev2Date = y && m ? new Date(y, m - 3, 1) : null;
    const prev3Date = y && m ? new Date(y, m - 4, 1) : null;
    const prev1 = prev1Date
      ? `${prev1Date.getFullYear()}-${String(prev1Date.getMonth() + 1).padStart(2, "0")}`
      : "";
    const prev2 = prev2Date
      ? `${prev2Date.getFullYear()}-${String(prev2Date.getMonth() + 1).padStart(2, "0")}`
      : "";
    const prev3 = prev3Date
      ? `${prev3Date.getFullYear()}-${String(prev3Date.getMonth() + 1).padStart(2, "0")}`
      : "";
    const trailingMonthSet = new Set([prev1, prev2, prev3].filter(Boolean));
    const selectedBuildingIdForTrailing = showLoadShapeTrailing ? selectedBuildingIds[0] : "";

    const currentByBuildingSlot = new Map<string, number>();
    const trailingBySlot = new Map<number, { weightedKw: number; count: number }>();

    for (const point of loadShapePoints) {
      if (!targetBuildingSet.has(point.buildingId)) continue;

      if (point.monthKey === activeLoadShapeMonthKey) {
        currentByBuildingSlot.set(`${point.buildingId}|${point.slotIndex}`, point.avgKw);
      } else if (
        showLoadShapeTrailing &&
        point.buildingId === selectedBuildingIdForTrailing &&
        trailingMonthSet.has(point.monthKey)
      ) {
        const weight = point.intervalsCount > 0 ? point.intervalsCount : 1;
        const slotAgg = trailingBySlot.get(point.slotIndex) ?? { weightedKw: 0, count: 0 };
        slotAgg.weightedKw += point.avgKw * weight;
        slotAgg.count += weight;
        trailingBySlot.set(point.slotIndex, slotAgg);
      }
    }

    return Array.from({ length: 96 }, (_, slotIndex) => {
      const hour = Math.floor(slotIndex / 4);
      const minute = (slotIndex % 4) * 15;
      const hhmm = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      const row: Record<string, any> = {
        slotIndex,
        hhmm,
      };

      for (const buildingId of targetBuildingIds) {
        row[buildingId] = currentByBuildingSlot.get(`${buildingId}|${slotIndex}`) ?? null;
      }

      if (showLoadShapeTrailing) {
        const trailing = trailingBySlot.get(slotIndex);
        row.trailing3moAvg = trailing && trailing.count > 0 ? trailing.weightedKw / trailing.count : null;
      }

      return row;
    });
  }, [
    loadShapeSeriesBuildings,
    loadShapePoints,
    activeLoadShapeMonthKey,
    selectedBuildingIds,
    showLoadShapeTrailing,
  ]);

  const kpis = React.useMemo<DistrictKpis>(() => {
    const serviceEnergyTile = serviceKpis?.tiles[0] ?? null;
    const serviceLoadFactorTile = serviceKpis?.tiles[1] ?? null;
    const serviceDemandRiskTile = serviceKpis?.tiles[2] ?? null;
    const servicePeakTile = serviceKpis?.tiles[3] ?? null;
    const serviceStartupTile = serviceKpis?.tiles[4] ?? null;
    const serviceAfterHoursTile = serviceKpis?.tiles[5] ?? null;
    const serviceWeekendTile = serviceKpis?.tiles[6] ?? null;
    const serviceDemandSavingsTile = serviceKpis?.tiles[7] ?? null;

    return {
      tiles: [
        {
          key: "district_total_energy_kbtu",
          label: "District Energy Use",
          value: serviceEnergyTile?.value ?? null,
          unit: serviceEnergyTile?.unit ?? "kWh",
          trendValue: serviceEnergyTile?.trendValue ?? null,
          trendUnit: serviceEnergyTile?.trendUnit ?? "kWh",
          trendDirection: serviceEnergyTile?.trendDirection ?? "flat",
          status: serviceEnergyTile?.status ?? "neutral",
          notes: serviceEnergyTile?.notes,
        },
        {
          key: "district_load_factor_pct",
          label: "Load Factor",
          value: serviceLoadFactorTile?.value ?? null,
          unit: serviceLoadFactorTile?.unit ?? "%",
          trendValue: serviceLoadFactorTile?.trendValue ?? null,
          trendUnit: serviceLoadFactorTile?.trendUnit ?? "pp",
          trendDirection: serviceLoadFactorTile?.trendDirection ?? "flat",
          status: serviceLoadFactorTile?.status ?? "neutral",
          notes: serviceLoadFactorTile?.notes,
        },
        {
          key: "district_demand_risk_buildings_count",
          label: "Demand Risk Buildings",
          value: serviceDemandRiskTile?.value ?? null,
          unit: serviceDemandRiskTile?.unit ?? "buildings",
          trendValue: serviceDemandRiskTile?.trendValue ?? null,
          trendUnit: serviceDemandRiskTile?.trendUnit ?? "buildings",
          trendDirection: serviceDemandRiskTile?.trendDirection ?? "flat",
          status: serviceDemandRiskTile?.status ?? "neutral",
          notes: serviceDemandRiskTile?.notes,
        },
        {
          key: "district_peak_demand_kw",
          label: "District Peak Demand",
          value: servicePeakTile?.value ?? null,
          unit: servicePeakTile?.unit ?? "kW",
          trendValue: servicePeakTile?.trendValue ?? null,
          trendUnit: servicePeakTile?.trendUnit ?? "kW",
          trendDirection: servicePeakTile?.trendDirection ?? "flat",
          asOfTimestamp: servicePeakTile?.asOfTimestamp ?? undefined,
          peakEvents: servicePeakTile?.peakEvents ?? undefined,
          status: servicePeakTile?.status ?? "neutral",
          notes: servicePeakTile?.notes,
        },
        {
          key: "district_avg_startup_intensity_pct",
          label: "Avg Startup Intensity",
          value: serviceStartupTile?.value ?? null,
          unit: serviceStartupTile?.unit ?? "%",
          trendValue: serviceStartupTile?.trendValue ?? null,
          trendUnit: serviceStartupTile?.trendUnit ?? "pp",
          trendDirection: serviceStartupTile?.trendDirection ?? "flat",
          status: serviceStartupTile?.status ?? "neutral",
          notes: serviceStartupTile?.notes,
        },
        {
          key: "district_avg_after_hours_w_per_sqft",
          label: "Night Baseload %",
          value: serviceAfterHoursTile?.value ?? null,
          unit: serviceAfterHoursTile?.unit ?? "%",
          trendValue: serviceAfterHoursTile?.trendValue ?? null,
          trendUnit: serviceAfterHoursTile?.trendUnit ?? "pp",
          trendDirection: serviceAfterHoursTile?.trendDirection ?? "flat",
          status: serviceAfterHoursTile?.status ?? "neutral",
          notes: serviceAfterHoursTile?.notes
            ? `${serviceAfterHoursTile.notes} Formula: Avg kW (weekday 2AM hour) / Peak Weekday kW.`
            : "Formula: Avg kW (weekday 2AM hour) / Peak Weekday kW.",
        },
        {
          key: "district_weekend_operations_index_pct",
          label: "Weekend Operations Index %",
          value: serviceWeekendTile?.value ?? null,
          unit: serviceWeekendTile?.unit ?? "%",
          trendValue: serviceWeekendTile?.trendValue ?? null,
          trendUnit: serviceWeekendTile?.trendUnit ?? "pp",
          trendDirection: serviceWeekendTile?.trendDirection ?? "flat",
          status: serviceWeekendTile?.status ?? "neutral",
          notes: serviceWeekendTile?.notes
            ? `${serviceWeekendTile.notes} Formula: weekend_kwh_avg / weekday_kwh_avg.`
            : "Formula: weekend_kwh_avg / weekday_kwh_avg.",
        },
        {
          key: "district_estimated_demand_savings_usd",
          label: "Estimated Demand Savings Potential",
          value: serviceDemandSavingsTile?.value ?? null,
          unit: serviceDemandSavingsTile?.unit ?? "USD",
          trendValue: serviceDemandSavingsTile?.trendValue ?? null,
          trendUnit: serviceDemandSavingsTile?.trendUnit ?? "USD",
          trendDirection: serviceDemandSavingsTile?.trendDirection ?? "flat",
          status: serviceDemandSavingsTile?.status ?? "neutral",
          notes: serviceDemandSavingsTile?.notes,
        },
      ],
    };
  }, [serviceKpis]);

  const selectedSingleBuildingName = React.useMemo(() => {
    if (selectedBuildingIds.length !== 1) return null;
    return buildingOptions.find((b) => b.id === selectedBuildingIds[0])?.name ?? null;
  }, [buildingOptions, selectedBuildingIds]);

  const insights = React.useMemo<InsightItem[]>(() => {
    if (selectedBuildingIds.length !== 1 || !startupMonthKey) return [];

    const buildingId = selectedBuildingIds[0];
    const items: InsightItem[] = [];
    const roundPct = (value: number) => Number(value.toFixed(0));
    const fmtLocalTime = (iso: string | null) => {
      if (!iso) return null;
      return new Date(iso).toLocaleString(undefined, {
        timeZone: "America/Chicago",
        hour: "numeric",
        minute: "2-digit",
      });
    };

    const afterHours = afterHoursRows.find((row) => row.buildingId === buildingId);
    if (afterHours) {
      const value = roundPct(afterHours.nightBaseloadPct);
      if (value > 50) {
        items.push({
          key: "night-baseload",
          severity: "critical",
          title: `Night baseload is extremely high (${value}%).`,
          detail:
            "The building may be running near daytime load overnight. Immediate investigation of HVAC schedules is recommended.",
        });
      } else if (value >= 40) {
        items.push({
          key: "night-baseload",
          severity: "high",
          title: `Night baseload is unusually high (${value}%).`,
          detail:
            "Significant equipment may be operating overnight. Check HVAC schedules and ventilation runtimes.",
        });
      } else if (value >= 30) {
        items.push({
          key: "night-baseload",
          severity: "elevated",
          title: `Night baseload is elevated (${value}%).`,
          detail:
            "Typical schools operate below 30% overnight. This may indicate HVAC or lighting running after hours.",
        });
      }
    }

    const weekendPoint = weekendMonthlyPoints.find(
      (row) =>
        row.buildingId === buildingId &&
        row.monthKey === startupMonthKey &&
        typeof row.weekendKwhAvg === "number" &&
        Number.isFinite(row.weekendKwhAvg) &&
        typeof row.weekdayKwhAvg === "number" &&
        Number.isFinite(row.weekdayKwhAvg) &&
        row.weekdayKwhAvg > 0
    );
    if (weekendPoint) {
      const value = roundPct(((weekendPoint.weekendKwhAvg as number) / (weekendPoint.weekdayKwhAvg as number)) * 100);
      if (value > 80) {
        items.push({
          key: "weekend-usage",
          severity: "critical",
          title: `Weekend energy usage is extremely high (${value}% of weekday usage).`,
          detail:
            "The building may be operating almost normally on weekends. Review HVAC scheduling and facility usage.",
        });
      } else if (value >= 60) {
        items.push({
          key: "weekend-usage",
          severity: "high",
          title: `Weekend energy usage is high (${value}% of weekday usage).`,
          detail:
            "HVAC schedules or event operations may be running throughout the weekend.",
        });
      } else if (value >= 40) {
        items.push({
          key: "weekend-usage",
          severity: "elevated",
          title: `Weekend energy use is elevated (${value}% of weekday usage).`,
          detail:
            "The building may be operating longer hours than expected on weekends.",
        });
      }
    }

    const demandMonth = demandRows.find((row) => row.monthKey === startupMonthKey);
    const monthlyPeak = demandMonth?.peaksByBuildingId?.[buildingId] ?? null;
    if (monthlyPeak?.ts) {
      const local = getChicagoParts(monthlyPeak.ts);
      const timeLabel = fmtLocalTime(monthlyPeak.ts);
      const hour = local?.hour ?? null;
      if (hour != null && timeLabel) {
        if (hour >= 22 || hour < 5) {
          items.push({
            key: "overnight-peak",
            severity: "critical",
            title: `Demand peak occurred overnight (${timeLabel}).`,
            detail:
              "Schools rarely peak during unoccupied hours. This may indicate HVAC equipment running unexpectedly.",
          });
        } else if (hour >= 18 && hour < 22) {
          items.push({
            key: "overnight-peak",
            severity: "elevated",
            title: "Peak demand occurred outside normal school hours.",
            detail:
              "Evening activities or HVAC schedules may be contributing to demand charges.",
          });
        }
      }
    }

    const startup = startupRows.find((row) => row.buildingId === buildingId);
    if (startup) {
      const value = Number(startup.maxRampKw.toFixed(0));
      if (value > 100) {
        items.push({
          key: "morning-ramp",
          severity: "critical",
          title: `Morning ramp rate is extremely aggressive (${value} kW in 15 minutes).`,
          detail:
            "Startup sequencing may be causing avoidable demand spikes. Consider staggering equipment start times.",
        });
      } else if (value >= 60) {
        items.push({
          key: "morning-ramp",
          severity: "high",
          title: `Morning ramp rate is aggressive (${value} kW in 15 minutes).`,
          detail:
            "HVAC or other major equipment may be starting simultaneously, increasing demand risk.",
        });
      } else if (value >= 30) {
        items.push({
          key: "morning-ramp",
          severity: "elevated",
          title: `Morning ramp rate is elevated (${value} kW in 15 minutes).`,
          detail: "Multiple systems may be starting at the same time.",
        });
      }
    }

    return items;
  }, [afterHoursRows, demandRows, selectedBuildingIds, startupMonthKey, startupRows, weekendMonthlyPoints]);

  const latestAvailableMonthKey = kpiMonthOptions[kpiMonthOptions.length - 1]?.key ?? "";
  const selectedMonthLabel = kpiMonthKey ? fmtMonth(kpiMonthKey) : null;
  const isCurrentMonthSelection = Boolean(
    kpiMonthKey && latestAvailableMonthKey && kpiMonthKey === latestAvailableMonthKey
  );

  const toggleBuilding = (id: string) => {
    setSelectedBuildingIds((prev) => {
      const has = prev.includes(id);
      if (has) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  };

  const selectAllBuildings = () => {
    setSelectedBuildingIds(buildingOptions.map((b) => b.id));
  };

  const clearAllBuildings = () => {
    setSelectedBuildingIds([]);
  };

  const onPickFiles = () => {
    if (isIngesting) return;
    inputRef.current?.click();
  };

  const onRefreshAnalytics = async () => {
    if (!orgId || isRefreshingAnalytics || isIngesting) return;
    setIsRefreshingAnalytics(true);
    setRefreshResult(null);
    try {
      const buildingId = selectedBuildingIds.length === 1 ? selectedBuildingIds[0] : null;
      const resp = await fetch("/api/green-button/refresh-analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId,
          buildingId,
        }),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || !body?.ok) {
        setRefreshResult({
          ok: false,
          durationMs: typeof body?.durationMs === "number" ? body.durationMs : undefined,
          failures: Array.isArray(body?.failures)
            ? body.failures.map((f: any) => ({
                step: typeof f?.step === "string" ? f.step : undefined,
                message: typeof f?.message === "string" ? f.message : "Refresh step failed",
              }))
            : [{ message: typeof body?.error === "string" ? body.error : `HTTP ${resp.status}` }],
        });
      } else {
        setRefreshResult({
          ok: true,
          durationMs: typeof body?.durationMs === "number" ? body.durationMs : undefined,
          warningCount: typeof body?.warningCount === "number" ? body.warningCount : undefined,
          warnings: Array.isArray(body?.warnings)
            ? body.warnings.map((w: any) => ({
                step: typeof w?.step === "string" ? w.step : undefined,
                message: typeof w?.message === "string" ? w.message : "Warning",
              }))
            : undefined,
        });
        setRefreshToken((v) => v + 1);
      }
    } catch (e: any) {
      setRefreshResult({
        ok: false,
        failures: [{ message: e?.message ?? "Refresh request failed" }],
      });
    } finally {
      setIsRefreshingAnalytics(false);
    }
  };

  const onFilesSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (!files.length || !orgId) return;

    setIsIngesting(true);
    setIngestResults([]);

    const results: IngestResult[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgressText(`Ingesting ${i + 1}/${files.length}: ${file.name}`);

        try {
          const xml = await file.text();
          const resp = await fetch("/api/green-button/ingest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orgId,
              sourceFilename: file.name,
              xml,
              dryRun: false,
              skipAnalyticsRefresh: i < files.length - 1,
            }),
          });

          const body = await resp.json().catch(() => ({}));
          if (!resp.ok || !body?.ok) {
            results.push({
              fileName: file.name,
              ok: false,
              status: resp.status,
              message: body?.error ?? `HTTP ${resp.status}`,
            });
          } else {
            results.push({
              fileName: file.name,
              ok: true,
              message: body?.duplicate ? "Duplicate (already loaded)" : "Loaded",
              counts: body?.counts,
            });
          }
        } catch (e: any) {
          results.push({
            fileName: file.name,
            ok: false,
            message: e?.message ?? "Request failed",
          });
        }
      }
    } finally {
      setIsIngesting(false);
      setProgressText("");
      setIngestResults(results);
      setRefreshToken((v) => v + 1);
    }
  };

  if (authLoading) {
    return <div className="p-6">Loadingâ€¦</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Green Button Analytics</h1>
          <p className="text-sm text-gray-600">Bulk ingest XML files and view interval-data coverage.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onPickFiles}
            disabled={isIngesting || isRefreshingAnalytics || !orgId}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium shadow hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isIngesting ? "Ingestingâ€¦" : "Ingest Green Button Files"}
          </button>
          <button
            onClick={onRefreshAnalytics}
            disabled={isIngesting || isRefreshingAnalytics || !orgId}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium shadow hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
            title={
              selectedBuildingIds.length === 1
                ? "Runs analytics refresh (peak cache scoped to selected building)."
                : "Runs analytics refresh for the organization."
            }
            type="button"
          >
            {isRefreshingAnalytics ? "Refreshingâ€¦" : "Refresh Analytics Now"}
          </button>
          <Link href="/dashboard" className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm">
            Back to Dashboard
          </Link>
          <input
            ref={inputRef}
            type="file"
            accept=".xml,text/xml,application/xml"
            multiple
            className="hidden"
            onChange={onFilesSelected}
          />
        </div>
      </div>

      {progressText ? (
        <div className="bg-white rounded-lg shadow p-4 border border-gray-200 text-sm">
          <span className="font-medium">{progressText}</span>
        </div>
      ) : null}
      {refreshResult ? (
        <div
          className={`rounded-lg shadow p-4 border text-sm ${
            refreshResult.ok && (refreshResult.warningCount ?? 0) === 0
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : refreshResult.ok
              ? "bg-amber-50 border-amber-200 text-amber-900"
              : "bg-red-50 border-red-200 text-red-900"
          }`}
        >
          <div className="font-medium">
            {refreshResult.ok
              ? (refreshResult.warningCount ?? 0) > 0
                ? "Analytics refresh completed with warnings."
                : "Analytics refresh completed."
              : "Analytics refresh had failures."}
          </div>
          {typeof refreshResult.durationMs === "number" ? (
            <div className="text-xs mt-1">Duration: {(refreshResult.durationMs / 1000).toFixed(1)}s</div>
          ) : null}
          {refreshResult.ok && (refreshResult.warningCount ?? 0) > 0 ? (
            <div className="mt-2 text-xs">
              {refreshResult.warnings
                ?.slice(0, 5)
                .map((w) => `${w.step ? `${w.step}: ` : ""}${w.message ?? "Warning"}`)
                .join(" | ")}
            </div>
          ) : null}
          {!refreshResult.ok && (refreshResult.failures?.length ?? 0) > 0 ? (
            <div className="mt-2 text-xs">
              {refreshResult.failures
                ?.slice(0, 5)
                .map((f) => `${f.step ? `${f.step}: ` : ""}${f.message ?? "Failed"}`)
                .join(" | ")}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <div className="text-sm font-medium text-gray-600 mb-1">Imported Files</div>
          <div className="text-3xl font-bold text-gray-900">{stats.totalFiles.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <div className="text-sm font-medium text-gray-600 mb-1">Buildings Covered</div>
          <div className="text-3xl font-bold text-gray-900">{stats.buildingsCovered.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <div className="text-sm font-medium text-gray-600 mb-1">Latest Import</div>
          <div className="text-sm mt-2">{fmtDateTime(stats.latestImportAt)}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <div className="text-sm font-medium text-gray-600 mb-1">Earliest Interval</div>
          <div className="text-sm mt-2">{fmtDateTime(stats.earliestInterval)}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <div className="text-sm font-medium text-gray-600 mb-1">Latest Interval</div>
          <div className="text-sm mt-2">{fmtDateTime(stats.latestInterval)}</div>
        </div>
      </div>
      {statsError ? <div className="text-sm text-red-600">{statsError}</div> : null}

      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <h2 className="text-lg font-semibold">Building Filter</h2>
            <p className="text-sm text-gray-500">
              This selection applies to Demand Exposure and future Green Button analytics panels.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600" htmlFor="kpi-month-select">
              Month
            </label>
            <select
              id="kpi-month-select"
              value={kpiMonthKey}
              onChange={(e) => setKpiMonthKey(e.target.value)}
              className="min-w-[11rem] pl-4 pr-10 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              {kpiMonthOptions.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
            <button
              onClick={selectAllBuildings}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              type="button"
            >
              All Buildings
            </button>
            <button
              onClick={clearAllBuildings}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              type="button"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="max-h-36 overflow-auto border border-gray-200 rounded-lg p-2 bg-gray-50">
          <div className="flex flex-wrap gap-2">
            {buildingOptions.map((b, idx) => {
              const checked = selectedBuildingIds.includes(b.id);
              return (
                <label
                  key={b.id}
                  className={`inline-flex items-center gap-2 px-2 py-1 rounded border text-xs ${
                    checked ? "border-blue-300 bg-blue-50" : "border-gray-200"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleBuilding(b.id)}
                  />
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: SERIES_COLORS[idx % SERIES_COLORS.length] }}
                  />
                  <span>{b.name}</span>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      <div className="text-sm text-gray-600">
        {selectedMonthLabel ? `Month: ${selectedMonthLabel}` : "Month: -"}
        {selectedSingleBuildingName ? ` | Building: ${selectedSingleBuildingName}` : ""}
      </div>

      <DistrictKpiTiles
        kpis={kpis}
        className="grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      />

      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Insights</h2>
            <p className="text-sm text-gray-600 mt-1">
              Operational alerts and action items for the selected building and month.
            </p>
          </div>
        </div>
        {selectedBuildingIds.length !== 1 ? (
          <div className="text-sm text-gray-600">
            Select a single building to see insight and action items.
          </div>
        ) : insights.length === 0 ? (
          <div className="text-sm text-gray-600">
            No major operational alerts for this building in the selected month.
          </div>
        ) : (
          <div className="space-y-3">
            {insights.map((item) => (
              <div
                key={item.key}
                className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"
              >
                <div className="text-sm font-medium text-amber-950">{`\u26A0 ${item.title}`}</div>
                <div className="mt-1 text-sm text-amber-900">{item.detail}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Demand Exposure</h2>
            <p className="text-sm text-gray-600 mt-1">
              Monthly peak demand (kW) by building. Tooltip shows peak date/time.
            </p>
            {selectedSingleBuildingName ? (
              <p className="text-xs text-gray-600 mt-1">Building: {selectedSingleBuildingName}</p>
            ) : null}
          </div>
        </div>

        {demandLoading ? <div className="text-sm text-gray-500">Loading demand chartâ€¦</div> : null}
        {demandError ? <div className="text-sm text-red-600">{demandError}</div> : null}
        {!demandLoading && !demandError ? (
          <div style={{ width: "100%", height: 360 }}>
            <ResponsiveContainer>
              <LineChart data={demandChartData} margin={{ top: 16, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis
                  tickFormatter={(v) => `${Number(v).toFixed(0)}`}
                  label={{ value: "Peak kW", angle: -90, position: "insideLeft" }}
                />
                <Tooltip
                  formatter={(value: any, name: any, props: any) => {
                    const ts = props?.payload?.[`${String(name)}__peakTs`] as string | null;
                    const label = selectedBuildings.find((b) => b.id === name)?.name ?? String(name);
                    const dateLabel = fmtCstCdtDateTime(ts);
                    return [`${Number(value).toFixed(2)} kW (peak: ${dateLabel})`, label];
                  }}
                />
                {selectedBuildings.map((b, idx) => (
                  <Line
                    key={b.id}
                    type="monotone"
                    dataKey={b.id}
                    name={b.id}
                    stroke={SERIES_COLORS[idx % SERIES_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : null}
      </div>

      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Startup Intensity</h2>
            <p className="text-sm text-gray-600 mt-1">
              Largest 15-minute ramp in the 4am-9am window by building, ranked high to low.
            </p>
          </div>
        </div>
        {startupLoading ? <div className="text-sm text-gray-500">Loading startup intensityâ€¦</div> : null}
        {startupError ? <div className="text-sm text-red-600">{startupError}</div> : null}
        {!startupLoading && !startupError ? (
          startupRows.length > 0 ? (
            <div style={{ width: "100%", height: Math.max(320, startupRows.length * 34) }}>
              <ResponsiveContainer>
                <BarChart data={startupRows} layout="vertical" margin={{ top: 8, right: 24, left: 24, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    tickFormatter={(v) => `${Number(v).toFixed(1)}`}
                    label={{ value: "Max Ramp kW", position: "insideBottom", offset: -2 }}
                  />
                  <YAxis type="category" dataKey="buildingName" width={190} />
                  <Tooltip
                    formatter={(value: any, _name: any, props: any) => {
                      const p = props?.payload as StartupRampRow | undefined;
                      const when = p?.rampTs ? new Date(p.rampTs).toLocaleString() : "â€”";
                      const pct = p?.rampPctOfPeak != null ? `${p.rampPctOfPeak.toFixed(1)}% of peak` : "n/a";
                      return [`${Number(value).toFixed(2)} kW (${pct}) at ${when}`, "Max startup ramp"];
                    }}
                  />
                  <Bar dataKey="maxRampKw" fill="#2563eb" />
                  {startupRows.map((row) => {
                    const thresholdKw =
                      row.peakKw != null && row.peakKw > 0 ? row.peakKw * 0.3 : null;
                    if (thresholdKw == null) return null;
                    return (
                      <ReferenceDot
                        key={`startup-threshold-${row.buildingId}`}
                        x={thresholdKw}
                        y={row.buildingName}
                        r={0}
                        ifOverflow="extendDomain"
                        shape={(props: any) => {
                          const cx = props?.cx;
                          const cy = props?.cy;
                          if (typeof cx !== "number" || typeof cy !== "number") return null;
                          return (
                            <line
                              x1={cx}
                              x2={cx}
                              y1={cy - 9}
                              y2={cy + 9}
                              stroke="#dc2626"
                              strokeWidth={2}
                            />
                          );
                        }}
                      />
                    );
                  })}
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-sm text-gray-500">No startup ramp data available for the selected month.</div>
          )
        ) : null}
      </div>

      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Peak Timing Profile</h2>
            <p className="text-sm text-gray-600 mt-1">
              Distribution of daily peak times for the selected month.
            </p>
            <p className="text-xs text-gray-600 mt-1">
              {selectedSingleBuildingName ? `Building: ${selectedSingleBuildingName}` : "Building: All selected buildings"}
              {!isCurrentMonthSelection && selectedMonthLabel ? ` | Month: ${selectedMonthLabel}` : ""}
            </p>
          </div>
        </div>
        {peakTimingLoading ? <div className="text-sm text-gray-500">Loading peak timing profileâ€¦</div> : null}
        {peakTimingError ? <div className="text-sm text-red-600">{peakTimingError}</div> : null}
        {!peakTimingLoading && !peakTimingError ? (
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer>
              <BarChart data={peakTimingRows} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hourLabel" interval={1} />
                <YAxis
                  allowDecimals={false}
                  label={{ value: "Count of Daily Peaks", angle: -90, position: "insideLeft" }}
                />
                <Tooltip
                  formatter={(value: any) => [`${Number(value).toFixed(0)}`, "Daily peaks"]}
                  labelFormatter={(label: any) => `Hour: ${String(label)}`}
                />
                <Bar dataKey="dailyPeakCount" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : null}
        <div className="mt-4 text-xs text-gray-600">
          Interpretation: before 08:00 suggests startup pressure, 15:00-17:00 suggests cooling load stacking,
          broad spread suggests operational inconsistency.
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">After-Hours Load</h2>
            <p className="text-sm text-gray-600 mt-1">
              Night baseload as a percent of peak weekday demand, ranked high to low.
            </p>
          </div>
          <div className="text-xs text-gray-600">
            Formula: Avg kW (weekday 2AM hour) / Peak Weekday kW
          </div>
        </div>
        {afterHoursLoading ? <div className="text-sm text-gray-500">Loading after-hours loadâ€¦</div> : null}
        {afterHoursError ? <div className="text-sm text-red-600">{afterHoursError}</div> : null}
        {!afterHoursLoading && !afterHoursError ? (
          afterHoursRows.length > 0 ? (
            <div style={{ width: "100%", height: Math.max(320, afterHoursRows.length * 34) }}>
              <ResponsiveContainer>
                <BarChart data={afterHoursRows} layout="vertical" margin={{ top: 8, right: 24, left: 24, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    tickFormatter={(v) => `${Number(v).toFixed(2)}`}
                    label={{ value: "Night Baseload %", position: "insideBottom", offset: -2 }}
                  />
                  <YAxis type="category" dataKey="buildingName" width={220} />
                  <Tooltip
                    formatter={(value: any, _name: any, props: any) => {
                      const p = props?.payload as AfterHoursRow | undefined;
                      const trend = p?.trendPct == null ? "n/a" : `${p.trendPct >= 0 ? "â†‘" : "â†“"} ${Math.abs(p.trendPct).toFixed(1)}%`;
                      const pctVsMedian =
                        afterHoursMedian && afterHoursMedian > 0
                          ? `${(((p?.nightBaseloadPct ?? 0) - afterHoursMedian) / afterHoursMedian * 100).toFixed(1)}% vs district median`
                          : "median n/a";
                      const detail = p
                        ? `2AM avg: ${p.avgNightKw.toFixed(2)} kW, weekday peak: ${p.peakWeekdayKw.toFixed(2)} kW, intervals: ${p.nightIntervalsCount}, trend: ${trend}, ${pctVsMedian}`
                        : "";
                      return [`${Number(value).toFixed(2)}%`, detail];
                    }}
                  />
                  <Bar dataKey="nightBaseloadPct" fill="#0ea5e9" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-sm text-gray-500">No after-hours load data available for the selected month.</div>
          )
        ) : null}
        <div className="mt-4 text-xs text-gray-600">
          Watchlist: buildings 20%-40% above district median, upward 3-month drift, and no change after schedule updates.
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Load Shape Overview</h2>
            <p className="text-sm text-gray-600 mt-1">
              Weekday-only 15-minute average load profile for the selected month (96 points, local time).
            </p>
            <p className="text-xs text-gray-600 mt-1">
              {selectedSingleBuildingName
                ? `Building: ${selectedSingleBuildingName} | Includes trailing 3-month average`
                : "Select exactly one building to view Load Shape Overview."}
            </p>
            {activeLoadShapeMonthKey && activeLoadShapeMonthKey !== startupMonthKey ? (
              <p className="text-xs text-gray-600 mt-1">
                Using latest available load-shape month: {fmtMonth(activeLoadShapeMonthKey)}
              </p>
            ) : null}
          </div>
          <div className="text-xs text-gray-600">Time basis: Building local time (America/Chicago fallback)</div>
        </div>
        {!showLoadShapeTrailing ? (
          <div className="text-sm text-gray-500">
            Load Shape Overview is only shown for a single selected building.
          </div>
        ) : null}
        {loadShapeLoading ? <div className="text-sm text-gray-500">Loading load shape overview...</div> : null}
        {loadShapeError ? <div className="text-sm text-red-600">{loadShapeError}</div> : null}
        {showLoadShapeTrailing && !loadShapeLoading && !loadShapeError ? (
          loadShapeSeriesBuildings.length === 0 ? (
            <div className="text-sm text-gray-500">
              No load-shape data is available for the selected building and month.
            </div>
          ) : (
          <div style={{ width: "100%", height: 360 }}>
            <ResponsiveContainer>
              <LineChart data={loadShapeChartData} margin={{ top: 16, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="slotIndex"
                  interval={7}
                  tickFormatter={(v: any) => {
                    const slot = Number(v);
                    return Number.isFinite(slot) ? fmtSlotLocalTime(slot) : "";
                  }}
                />
                <YAxis
                  tickFormatter={(v) => `${Number(v).toFixed(1)}`}
                  label={{ value: "Avg kW", angle: -90, position: "insideLeft" }}
                />
                <Tooltip
                  labelFormatter={(_label: any, payload: any) => {
                    const slot = Number(payload?.[0]?.payload?.slotIndex ?? NaN);
                    if (!Number.isFinite(slot)) return "Time";
                    return `Time: ${fmtSlotLocalTime(slot)} (local)`;
                  }}
                  formatter={(value: any, name: any) => {
                    const valueNum = Number(value);
                    if (!Number.isFinite(valueNum)) return ["-", String(name)];
                    if (String(name) === "trailing3moAvg") {
                      return [`${valueNum.toFixed(2)} kW`, "Trailing 3-mo avg"];
                    }
                    const label =
                      loadShapeSeriesBuildings.find((b) => b.id === String(name))?.name ?? String(name);
                    return [`${valueNum.toFixed(2)} kW`, `This month - ${label}`];
                  }}
                />
                {loadShapeSeriesBuildings.map((b, idx) => (
                  <Line
                    key={`load-shape-${b.id}`}
                    type="monotone"
                    dataKey={b.id}
                    name={b.id}
                    stroke={SERIES_COLORS[idx % SERIES_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                ))}
                {showLoadShapeTrailing ? (
                  <Line
                    type="monotone"
                    dataKey="trailing3moAvg"
                    name="trailing3moAvg"
                    stroke="#f97316"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    dot={false}
                    connectNulls
                  />
                ) : null}
              </LineChart>
            </ResponsiveContainer>
          </div>
          )
        ) : null}
      </div>

      {ingestResults.length > 0 ? (
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h2 className="text-lg font-semibold mb-3">Latest Ingest Run</h2>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Status</th>
                  <th>Parsed</th>
                  <th>Inserted</th>
                  <th>Deduped</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {ingestResults.map((r) => (
                  <tr key={r.fileName}>
                    <td className="font-mono">{r.fileName}</td>
                    <td>
                      <span className={`badge ${r.ok ? "badge-green" : "badge-red"}`}>
                        {r.ok ? "ok" : "error"}
                      </span>
                    </td>
                    <td>{r.counts?.parsed ?? "â€”"}</td>
                    <td>{r.counts?.inserted ?? "â€”"}</td>
                    <td>{r.counts?.deduped ?? "â€”"}</td>
                    <td className="text-gray-600">{r.message ?? "â€”"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

    </div>
  );
}

