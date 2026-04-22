import { getDistrictKpiInputData } from "@/lib/kpiDataProvider";

export type YearMonth = `${number}${number}${number}${number}-${number}${number}`;

export interface GetDistrictKpisInput {
  districtId: string;
  month: YearMonth;
  buildingTypeFilter?: string;
  buildingIds?: string[];
  districtIntervalAgg?: DistrictIntervalAggRecord[];
  prior3moDistrictPeaks?: number[];
  buildingMonthlyEnergy?: BuildingMonthlyEnergyRecord[];
  priorMonthKwhTotal?: number | null;
  buildingTypeById?: Record<string, string>;
  buildingDemandFacts?: BuildingDemandFactRecord[];
  buildingMonthlyOps?: BuildingMonthlyOpsRecord[];
  prior3moAvgStartupIntensityPct?: number | null;
  buildingBaseload?: BuildingBaseloadRecord[];
  prior3moAvgAfterHoursWPerSqft?: number | null;
  afterHoursLoadPercentiles?: {
    p50?: number | null;
    p75?: number | null;
  };
  buildingWeekend?: BuildingWeekendRecord[];
  priorMonthWeekendIndexPct?: number | null;
  priorMonthEstimatedDemandSavingsUsd?: number | null;
  districtKwhTotal?: number | null;
  districtPeakKw?: number | null;
  hoursInPeriod?: number | null;
  prior3moAvgLoadFactorPct?: number | null;
  loadFactorThresholds?: {
    greenAbovePct?: number | null;
    yellowMinPct?: number | null;
  };
  monthlyTopPeaks?: BuildingMonthlyTopPeakRecord[];
}

export type KpiTrendDirection = "up" | "down" | "flat";

export type KpiTileStatus = "green" | "yellow" | "red" | "neutral";

export type DistrictKpiKey =
  | "district_total_energy_kbtu"
  | "district_load_factor_pct"
  | "district_demand_risk_buildings_count"
  | "district_peak_demand_kw"
  | "district_avg_startup_intensity_pct"
  | "district_avg_after_hours_w_per_sqft"
  | "district_weekend_operations_index_pct"
  | "district_estimated_demand_savings_usd";

export interface DistrictKpiTile<K extends DistrictKpiKey = DistrictKpiKey> {
  key: K;
  label: string;
  value: number | string | null;
  unit: string;
  trendValue: number | string | null;
  trendUnit: string;
  trendDirection: KpiTrendDirection;
  asOfTimestamp?: string;
  peakEvents?: PeakEvent[];
  status: KpiTileStatus;
  notes?: string;
}

export interface PeakEvent {
  rank: number;
  kw: number;
  ts: string;
}

export interface DistrictIntervalAggRecord {
  ts: string;
  kw_total: number | null;
}

export interface BuildingMonthlyEnergyRecord {
  buildingId: string;
  month: YearMonth;
  kwh_total: number | null;
}

export interface BuildingDemandFactRecord {
  buildingId: string;
  buildingName?: string;
  adjusted_demand_kw: number | null;
  tariff_min_kw: number | null;
  ratchet_kw: number | null;
  billing_demand_kw: number | null;
  effective_demand_rate_usd_per_kw: number | null;
}

export interface BuildingMonthlyOpsRecord {
  buildingId: string;
  month: YearMonth;
  monthly_peak_kw: number | null;
  max_morning_ramp_kw: number | null;
  sqft?: number | null;
}

export interface BuildingBaseloadRecord {
  buildingId: string;
  month: YearMonth;
  avg_2am_kw_weekdays?: number | null;
  avg_night_kw_10pm_4am?: number | null;
  peak_weekday_kw?: number | null;
  // Backward compatibility with older shape; no longer used for KPI #5 formula.
  avg_night_min_kw?: number | null;
  sqft?: number | null;
}

export interface BuildingWeekendRecord {
  buildingId: string;
  month: YearMonth;
  weekend_kwh_avg: number | null;
  weekday_kwh_avg: number | null;
}

export interface BuildingMonthlyTopPeakRecord {
  buildingId: string;
  month: YearMonth;
  peak_rank: number;
  peak_kw: number | null;
  peak_interval_start_utc: string | null;
}

export type DistrictKpis = {
  tiles: [
    DistrictKpiTile<"district_total_energy_kbtu">,
    DistrictKpiTile<"district_load_factor_pct">,
    DistrictKpiTile<"district_demand_risk_buildings_count">,
    DistrictKpiTile<"district_peak_demand_kw">,
    DistrictKpiTile<"district_avg_startup_intensity_pct">,
    DistrictKpiTile<"district_avg_after_hours_w_per_sqft">,
    DistrictKpiTile<"district_weekend_operations_index_pct">,
    DistrictKpiTile<"district_estimated_demand_savings_usd">
  ];
};

export interface KpiService {
  getDistrictKpis(input: GetDistrictKpisInput): Promise<DistrictKpis>;
}

const PEAK_DEMAND_DECIMALS = 1;
const ENERGY_USE_DECIMALS = 0;
const LOAD_FACTOR_DECIMALS = 1;
const STARTUP_INTENSITY_DECIMALS = 1;
const AFTER_HOURS_LOAD_DECIMALS = 0;
const WEEKEND_INDEX_DECIMALS = 0;
const DEMAND_SAVINGS_DECIMALS = 2;
const TREND_FLAT_EPSILON = 0.000001;
const DEMAND_RISK_TOLERANCE_KW = 0.5;

export const KPI_ROUNDING_RULES = {
  district_peak_demand_kw: {
    valueDecimals: PEAK_DEMAND_DECIMALS,
    trendDecimals: PEAK_DEMAND_DECIMALS,
    trendUnit: "kW",
  },
  district_total_energy_kbtu: {
    valueDecimals: ENERGY_USE_DECIMALS,
    trendDecimals: ENERGY_USE_DECIMALS,
    trendUnit: "kWh",
  },
  district_load_factor_pct: {
    valueDecimals: LOAD_FACTOR_DECIMALS,
    trendDecimals: LOAD_FACTOR_DECIMALS,
    trendUnit: "pp",
  },
  district_demand_risk_buildings_count: {
    valueDecimals: 0,
    trendDecimals: 0,
    trendUnit: "buildings",
  },
  district_estimated_demand_savings_usd: {
    valueDecimals: DEMAND_SAVINGS_DECIMALS,
    trendDecimals: DEMAND_SAVINGS_DECIMALS,
    trendUnit: "USD",
  },
  district_avg_startup_intensity_pct: {
    valueDecimals: STARTUP_INTENSITY_DECIMALS,
    trendDecimals: STARTUP_INTENSITY_DECIMALS,
    trendUnit: "pp",
  },
  district_avg_after_hours_w_per_sqft: {
    valueDecimals: AFTER_HOURS_LOAD_DECIMALS,
    trendDecimals: AFTER_HOURS_LOAD_DECIMALS,
    trendUnit: "pp",
  },
  district_weekend_operations_index_pct: {
    valueDecimals: WEEKEND_INDEX_DECIMALS,
    trendDecimals: WEEKEND_INDEX_DECIMALS,
    trendUnit: "pp",
  },
} as const;

export const KPI_VALIDATION_RULES = {
  district_peak_demand_kw: [
    "Use only records with parseable UTC timestamp and non-negative finite kw_total.",
    "If no valid records, return value=null, trendValue=null, status=red.",
    "Trend requires exactly 3 valid non-negative prior peaks; otherwise trendValue=null and status=yellow.",
  ],
  district_total_energy_kbtu: [
    "Use only rows matching selected month with non-negative finite kwh_total.",
    "Apply optional buildingIds filter if provided.",
    "Apply optional buildingTypeFilter only when buildingTypeById mapping contains the building.",
    "If no valid rows remain, return value=null, trendValue=null, status=red.",
    "Trend requires valid non-negative priorMonthKwhTotal; otherwise trendValue=null and status=yellow.",
  ],
  district_load_factor_pct: [
    "Compute load_factor_pct = (district_kwh_total / (district_peak_kw * hours_in_period)) * 100.",
    "If district_peak_kw is null/invalid/zero, return value=null.",
    "If district_kwh_total or hours_in_period missing/invalid/non-positive, return value=null.",
    "Trend compares current value against prior3moAvgLoadFactorPct (delta in percentage points).",
    "Default status thresholds: green > 60%, yellow 45%-60%, red < 45%; configurable via loadFactorThresholds.",
  ],
  district_demand_risk_buildings_count: [
    "Threshold = max(tariff_min_kw, ratchet_kw) using non-null values; if both null, threshold is null.",
    "At-risk when adjusted_demand_kw and threshold are valid and adjusted_demand_kw > threshold + 0.5 kW.",
    "When monthly interval top peaks are available, building is at-risk only if interval peak also exceeds threshold + 0.5 kW.",
    "Null/invalid adjusted_demand_kw cannot be at-risk and is excluded.",
    "KPI value is integer count of at-risk buildings; trend is not computed in this phase.",
  ],
  district_estimated_demand_savings_usd: [
    "Compute only for at-risk buildings with valid non-negative effective_demand_rate_usd_per_kw.",
    "Per-building potential = (adjusted_demand_kw - threshold_kw) * demand_rate.",
    "Buildings missing demand rate are excluded from savings dollars but still counted in demand-risk KPI.",
    "If no at-risk building has valid demand rate, return $0.00 with explanatory notes.",
    "Trend compares current value against priorMonthEstimatedDemandSavingsUsd (delta in USD).",
  ],
  district_avg_startup_intensity_pct: [
    "Per building startup_intensity_pct = (max_morning_ramp_kw / monthly_peak_kw) * 100.",
    "Exclude buildings with missing, invalid, or zero monthly_peak_kw.",
    "Exclude buildings with missing or invalid max_morning_ramp_kw.",
    "District KPI value is arithmetic average of included building startup_intensity_pct values.",
    "Trend compares current value against prior3moAvgStartupIntensityPct (delta in percentage points).",
  ],
  district_avg_after_hours_w_per_sqft: [
    "Per building night_baseload_pct = (avg_2am_kw_weekdays / peak_weekday_kw) * 100.",
    "Exclude buildings with missing/invalid avg_2am_kw_weekdays or missing/invalid/non-positive peak_weekday_kw.",
    "District KPI value is arithmetic average across included building night_baseload_pct values.",
    "Trend compares current value against prior3moAvgAfterHoursWPerSqft.",
    "Status uses percentiles: green <= p50, yellow > p50 and <= p75, red > p75.",
  ],
  district_weekend_operations_index_pct: [
    "Per building weekend_index_pct = (weekend_kwh_avg / weekday_kwh_avg) * 100.",
    "Exclude buildings with missing/invalid weekend_kwh_avg or missing/invalid/non-positive weekday_kwh_avg.",
    "District KPI value is arithmetic average across included building weekend_index_pct values.",
    "Trend compares current value against priorMonthWeekendIndexPct (delta in percentage points).",
    "Status thresholds: green < 50%, yellow 50%-65%, red > 65%.",
  ],
} as const;

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function getTrendDirection(delta: number): KpiTrendDirection {
  if (Math.abs(delta) < TREND_FLAT_EPSILON) return "flat";
  return delta > 0 ? "up" : "down";
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isValidUtcTimestamp(ts: string): boolean {
  return !Number.isNaN(Date.parse(ts));
}

function getDemandThresholdKw(record: BuildingDemandFactRecord): number | null {
  const candidates = [record.tariff_min_kw, record.ratchet_kw].filter(
    isNonNegativeFiniteNumber
  );
  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}

interface AtRiskDemandBuilding {
  buildingId: string;
  buildingName?: string;
  thresholdKw: number;
  adjustedDemandKw: number;
  overageKw: number;
  demandRateUsdPerKw: number | null;
}

interface IgnoredDemandBuilding {
  buildingId: string;
  buildingName?: string;
  reason: string;
}

function getIntervalPeakByBuilding(
  monthlyTopPeaks: BuildingMonthlyTopPeakRecord[] | undefined,
  month: YearMonth | undefined
): Map<string, number> {
  const peakByBuilding = new Map<string, number>();
  if (!monthlyTopPeaks || monthlyTopPeaks.length === 0) return peakByBuilding;

  for (const peak of monthlyTopPeaks) {
    if (month && peak.month !== month) continue;
    if (!isNonNegativeFiniteNumber(peak.peak_kw)) continue;

    const current = peakByBuilding.get(peak.buildingId);
    if (current === undefined || peak.peak_kw > current) {
      peakByBuilding.set(peak.buildingId, peak.peak_kw);
    }
  }

  return peakByBuilding;
}

function evaluateAtRiskDemandBuildings(
  facts: BuildingDemandFactRecord[] | undefined,
  options?: {
    month?: YearMonth;
    monthlyTopPeaks?: BuildingMonthlyTopPeakRecord[];
  }
): { atRisk: AtRiskDemandBuilding[]; ignored: IgnoredDemandBuilding[] } {
  const rows = facts ?? [];
  const atRisk: AtRiskDemandBuilding[] = [];
  const ignored: IgnoredDemandBuilding[] = [];
  const intervalPeakByBuilding = getIntervalPeakByBuilding(
    options?.monthlyTopPeaks,
    options?.month
  );
  const hasIntervalPeaks = intervalPeakByBuilding.size > 0;

  for (const row of rows) {
    if (!isNonNegativeFiniteNumber(row.adjusted_demand_kw)) {
      ignored.push({
        buildingId: row.buildingId,
        buildingName: row.buildingName,
        reason: "adjusted_demand_kw is missing/invalid",
      });
      continue;
    }

    const threshold = getDemandThresholdKw(row);
    if (threshold === null) continue;
    if (row.adjusted_demand_kw <= threshold + DEMAND_RISK_TOLERANCE_KW) continue;
    if (hasIntervalPeaks) {
      const intervalPeak = intervalPeakByBuilding.get(row.buildingId);
      if (
        typeof intervalPeak !== "number" ||
        !Number.isFinite(intervalPeak) ||
        intervalPeak <= threshold + DEMAND_RISK_TOLERANCE_KW
      ) {
        continue;
      }
    }

    atRisk.push({
      buildingId: row.buildingId,
      buildingName: row.buildingName,
      thresholdKw: threshold,
      adjustedDemandKw: row.adjusted_demand_kw,
      overageKw: row.adjusted_demand_kw - threshold,
      demandRateUsdPerKw: isNonNegativeFiniteNumber(
        row.effective_demand_rate_usd_per_kw
      )
        ? row.effective_demand_rate_usd_per_kw
        : null,
    });
  }

  return { atRisk, ignored };
}

export function computeDistrictPeakDemandKpi(input: {
  month?: YearMonth;
  buildingIds?: string[];
  districtIntervalAgg?: DistrictIntervalAggRecord[];
  prior3moDistrictPeaks?: number[];
  buildingDemandFacts?: BuildingDemandFactRecord[];
  monthlyTopPeaks?: BuildingMonthlyTopPeakRecord[];
}): DistrictKpiTile<"district_peak_demand_kw"> {
  const records = input.districtIntervalAgg ?? [];
  const validRecords = records.filter(
    (r) => isNonNegativeFiniteNumber(r.kw_total) && isValidUtcTimestamp(r.ts)
  );

  const floorFacts = (input.buildingDemandFacts ?? [])
    .map((f) => ({
      buildingId: f.buildingId,
      buildingName: f.buildingName,
      floorKw: getDemandThresholdKw(f),
    }))
    .filter((f): f is { buildingId: string; buildingName?: string; floorKw: number } =>
      isNonNegativeFiniteNumber(f.floorKw)
    );
  const ratchetNote =
    floorFacts.length === 1
      ? `${
          floorFacts[0].buildingName?.trim() || floorFacts[0].buildingId
        } billing threshold floor: ${roundTo(floorFacts[0].floorKw, PEAK_DEMAND_DECIMALS)} kW.`
      : floorFacts.length > 1
      ? `Billing threshold floors present in ${floorFacts.length} buildings (max ${roundTo(
          Math.max(...floorFacts.map((f) => f.floorKw)),
          PEAK_DEMAND_DECIMALS
        )} kW).`
      : undefined;
  const withRatchetNote = (notes?: string): string | undefined => {
    if (notes && ratchetNote) return `${notes} ${ratchetNote}`;
    return notes ?? ratchetNote;
  };
  const peakEvents =
    input.month &&
    input.buildingIds &&
    input.buildingIds.length === 1 &&
    Array.isArray(input.monthlyTopPeaks)
      ? input.monthlyTopPeaks
          .filter(
            (p) =>
              p.buildingId === input.buildingIds?.[0] &&
              p.month === input.month &&
              Number.isInteger(p.peak_rank) &&
              p.peak_rank >= 1 &&
              isNonNegativeFiniteNumber(p.peak_kw) &&
              !!p.peak_interval_start_utc &&
              isValidUtcTimestamp(p.peak_interval_start_utc)
          )
          .sort((a, b) => {
            const kwDelta = (b.peak_kw as number) - (a.peak_kw as number);
            if (Math.abs(kwDelta) > TREND_FLAT_EPSILON) return kwDelta;
            return Date.parse(b.peak_interval_start_utc as string) - Date.parse(a.peak_interval_start_utc as string);
          })
          .slice(0, 5)
          .map((p, idx) => ({
            rank: idx + 1,
            kw: roundTo(p.peak_kw as number, PEAK_DEMAND_DECIMALS),
            ts: p.peak_interval_start_utc as string,
          }))
      : undefined;

  if (validRecords.length === 0) {
    return {
      key: "district_peak_demand_kw",
      label: "District Peak Demand",
      value: null,
      unit: "kW",
      trendValue: null,
      trendUnit: "kW",
      trendDirection: "flat",
      status: "red",
      notes: withRatchetNote("No valid 15-minute district demand records for selected month."),
      peakEvents,
    };
  }

  const peakRecord = validRecords.reduce((max, current) =>
    (current.kw_total as number) > (max.kw_total as number) ? current : max
  );
  const peakKw = roundTo(peakRecord.kw_total as number, PEAK_DEMAND_DECIMALS);

  const priorPeaks = (input.prior3moDistrictPeaks ?? []).filter(
    isNonNegativeFiniteNumber
  );

  if (priorPeaks.length !== 3) {
    return {
      key: "district_peak_demand_kw",
      label: "District Peak Demand",
      value: peakKw,
      unit: "kW",
      trendValue: null,
      trendUnit: "kW",
      trendDirection: "flat",
      asOfTimestamp: peakRecord.ts,
      status: "yellow",
      notes: withRatchetNote(
        "Peak computed; trend unavailable because prior 3-month peaks are incomplete or invalid."
      ),
      peakEvents,
    };
  }

  const priorAveragePeak = priorPeaks.reduce((a, b) => a + b, 0) / 3;
  const delta = peakKw - priorAveragePeak;

  return {
    key: "district_peak_demand_kw",
    label: "District Peak Demand",
    value: peakKw,
    unit: "kW",
    trendValue: roundTo(delta, PEAK_DEMAND_DECIMALS),
    trendUnit: "kW",
    trendDirection: getTrendDirection(delta),
    asOfTimestamp: peakRecord.ts,
    status: "green",
    notes: withRatchetNote(),
    peakEvents,
  };
}

export function computeDistrictEnergyUseKpi(input: {
  month: YearMonth;
  buildingMonthlyEnergy?: BuildingMonthlyEnergyRecord[];
  buildingIds?: string[];
  buildingTypeFilter?: string;
  buildingTypeById?: Record<string, string>;
  priorMonthKwhTotal?: number | null;
}): DistrictKpiTile<"district_total_energy_kbtu"> {
  const rows = input.buildingMonthlyEnergy ?? [];
  const wantedBuildingIds =
    input.buildingIds && input.buildingIds.length > 0
      ? new Set(input.buildingIds)
      : null;
  const buildingTypeById = input.buildingTypeById ?? {};
  const normalizedTypeFilter = input.buildingTypeFilter?.trim().toLowerCase();

  const validRows = rows.filter((r) => {
    if (r.month !== input.month) return false;
    if (!isNonNegativeFiniteNumber(r.kwh_total)) return false;
    if (wantedBuildingIds && !wantedBuildingIds.has(r.buildingId)) return false;
    if (!normalizedTypeFilter) return true;
    const type = buildingTypeById[r.buildingId];
    return !!type && type.trim().toLowerCase() === normalizedTypeFilter;
  });

  if (validRows.length === 0) {
    return {
      key: "district_total_energy_kbtu",
      label: "District Energy Use",
      value: null,
      unit: "kWh",
      trendValue: null,
      trendUnit: "kWh",
      trendDirection: "flat",
      status: "red",
      notes: "No valid monthly building energy rows for selected month/filter.",
    };
  }

  const currentTotal = roundTo(
    validRows.reduce((sum, row) => sum + (row.kwh_total as number), 0),
    ENERGY_USE_DECIMALS
  );

  if (!isNonNegativeFiniteNumber(input.priorMonthKwhTotal)) {
    return {
      key: "district_total_energy_kbtu",
      label: "District Energy Use",
      value: currentTotal,
      unit: "kWh",
      trendValue: null,
      trendUnit: "kWh",
      trendDirection: "flat",
      status: "yellow",
      notes: "Energy total computed; trend unavailable because priorMonthKwhTotal is missing or invalid.",
    };
  }

  const delta = currentTotal - input.priorMonthKwhTotal;
  return {
    key: "district_total_energy_kbtu",
    label: "District Energy Use",
    value: currentTotal,
    unit: "kWh",
    trendValue: roundTo(delta, ENERGY_USE_DECIMALS),
    trendUnit: "kWh",
    trendDirection: getTrendDirection(delta),
    status: "green",
  };
}

export function computeLoadFactorKpi(input: {
  district_kwh_total?: number | null;
  district_peak_kw?: number | null;
  hours_in_period?: number | null;
  prior3moAvgLoadFactorPct?: number | null;
  loadFactorThresholds?: {
    greenAbovePct?: number | null;
    yellowMinPct?: number | null;
  };
}): DistrictKpiTile<"district_load_factor_pct"> {
  const peakKw = input.district_peak_kw;
  if (!isNonNegativeFiniteNumber(peakKw) || peakKw === 0) {
    return {
      key: "district_load_factor_pct",
      label: "Load Factor",
      value: null,
      unit: "%",
      trendValue: null,
      trendUnit: "pp",
      trendDirection: "flat",
      status: "red",
      notes: "Load factor unavailable: district_peak_kw is missing, invalid, or zero.",
    };
  }

  const kwhTotal = input.district_kwh_total;
  const hoursInPeriod = input.hours_in_period;
  if (
    !isNonNegativeFiniteNumber(kwhTotal) ||
    typeof hoursInPeriod !== "number" ||
    !Number.isFinite(hoursInPeriod) ||
    hoursInPeriod <= 0
  ) {
    return {
      key: "district_load_factor_pct",
      label: "Load Factor",
      value: null,
      unit: "%",
      trendValue: null,
      trendUnit: "pp",
      trendDirection: "flat",
      status: "red",
      notes: "Load factor unavailable: district_kwh_total or hours_in_period is missing/invalid.",
    };
  }

  const rawLoadFactor = (kwhTotal / (peakKw * hoursInPeriod)) * 100;
  const loadFactorPct = roundTo(rawLoadFactor, LOAD_FACTOR_DECIMALS);

  const thresholdGreenAbove = input.loadFactorThresholds?.greenAbovePct;
  const thresholdYellowMin = input.loadFactorThresholds?.yellowMinPct;
  const greenAbove =
    typeof thresholdGreenAbove === "number" && Number.isFinite(thresholdGreenAbove)
      ? thresholdGreenAbove
      : 60;
  const yellowMin =
    typeof thresholdYellowMin === "number" && Number.isFinite(thresholdYellowMin)
      ? thresholdYellowMin
      : 45;

  let status: KpiTileStatus = "red";
  if (loadFactorPct > greenAbove) status = "green";
  else if (loadFactorPct >= yellowMin) status = "yellow";

  const notesParts: string[] = [];
  if (!(greenAbove > yellowMin)) {
    notesParts.push("Configured thresholds are not strictly ordered (greenAbove should exceed yellowMin).");
  }

  if (!isNonNegativeFiniteNumber(input.prior3moAvgLoadFactorPct)) {
    return {
      key: "district_load_factor_pct",
      label: "Load Factor",
      value: loadFactorPct,
      unit: "%",
      trendValue: null,
      trendUnit: "pp",
      trendDirection: "flat",
      status,
      notes:
        notesParts.length > 0
          ? `${notesParts.join(" ")} Trend unavailable: prior3moAvgLoadFactorPct missing/invalid.`
          : "Trend unavailable: prior3moAvgLoadFactorPct missing/invalid.",
    };
  }

  const delta = loadFactorPct - input.prior3moAvgLoadFactorPct;
  return {
    key: "district_load_factor_pct",
    label: "Load Factor",
    value: loadFactorPct,
    unit: "%",
    trendValue: roundTo(delta, LOAD_FACTOR_DECIMALS),
    trendUnit: "pp",
    trendDirection: getTrendDirection(delta),
    status,
    notes: notesParts.length > 0 ? notesParts.join(" ") : undefined,
  };
}

export function computeDemandRiskBuildingsKpi(input: {
  buildingDemandFacts?: BuildingDemandFactRecord[];
  month?: YearMonth;
  monthlyTopPeaks?: BuildingMonthlyTopPeakRecord[];
}): DistrictKpiTile<"district_demand_risk_buildings_count"> {
  const { atRisk } = evaluateAtRiskDemandBuildings(input.buildingDemandFacts, {
    month: input.month,
    monthlyTopPeaks: input.monthlyTopPeaks,
  });
  const atRiskLabels = atRisk.map((r) => r.buildingName?.trim() || r.buildingId);

  const notesParts: string[] = [];
  if (atRiskLabels.length > 0) {
    notesParts.push(`At-risk buildings: ${atRiskLabels.join(", ")}`);
  }

  return {
    key: "district_demand_risk_buildings_count",
    label: "Demand Risk Buildings",
    value: atRisk.length,
    unit: "buildings",
    trendValue: null,
    trendUnit: "buildings",
    trendDirection: "flat",
    status: "green",
    notes: notesParts.length > 0 ? notesParts.join(" ") : undefined,
  };
}

export function computeEstimatedDemandSavingsPotentialKpi(input: {
  buildingDemandFacts?: BuildingDemandFactRecord[];
  priorMonthEstimatedDemandSavingsUsd?: number | null;
  month?: YearMonth;
  monthlyTopPeaks?: BuildingMonthlyTopPeakRecord[];
}): DistrictKpiTile<"district_estimated_demand_savings_usd"> {
  const { atRisk, ignored } = evaluateAtRiskDemandBuildings(
    input.buildingDemandFacts,
    {
      month: input.month,
      monthlyTopPeaks: input.monthlyTopPeaks,
    }
  );
  const withRate = atRisk.filter((r) => r.demandRateUsdPerKw !== null);
  const missingRateCount = atRisk.length - withRate.length;

  const savingsTotal = roundTo(
    withRate.reduce(
      (sum, b) => sum + b.overageKw * (b.demandRateUsdPerKw as number),
      0
    ),
    DEMAND_SAVINGS_DECIMALS
  );

  const notesParts: string[] = [];
  if (missingRateCount > 0) {
    notesParts.push(
      `${missingRateCount} at-risk building(s) excluded from savings due to missing demand rate.`
    );
  }
  if (ignored.length > 0) {
    notesParts.push(
      `${ignored.length} building(s) ignored due to missing/invalid adjusted_demand_kw.`
    );
  }

  if (!isNonNegativeFiniteNumber(input.priorMonthEstimatedDemandSavingsUsd)) {
    return {
      key: "district_estimated_demand_savings_usd",
      label: "Estimated Demand Savings Potential",
      value: savingsTotal,
      unit: "USD",
      trendValue: null,
      trendUnit: "USD",
      trendDirection: "flat",
      status: "green",
      notes:
        notesParts.length > 0
          ? `${notesParts.join(" ")} Trend unavailable: prior month savings missing/invalid.`
          : "Trend unavailable: prior month savings missing/invalid.",
    };
  }

  const delta = savingsTotal - input.priorMonthEstimatedDemandSavingsUsd;
  return {
    key: "district_estimated_demand_savings_usd",
    label: "Estimated Demand Savings Potential",
    value: savingsTotal,
    unit: "USD",
    trendValue: roundTo(delta, DEMAND_SAVINGS_DECIMALS),
    trendUnit: "USD",
    trendDirection: getTrendDirection(delta),
    status: "green",
    notes: notesParts.length > 0 ? notesParts.join(" ") : undefined,
  };
}

export function computeAvgStartupIntensityKpi(input: {
  month: YearMonth;
  buildingMonthlyOps?: BuildingMonthlyOpsRecord[];
  buildingIds?: string[];
  buildingTypeFilter?: string;
  buildingTypeById?: Record<string, string>;
  prior3moAvgStartupIntensityPct?: number | null;
}): DistrictKpiTile<"district_avg_startup_intensity_pct"> {
  const rows = input.buildingMonthlyOps ?? [];
  const wantedBuildingIds =
    input.buildingIds && input.buildingIds.length > 0
      ? new Set(input.buildingIds)
      : null;
  const buildingTypeById = input.buildingTypeById ?? {};
  const normalizedTypeFilter = input.buildingTypeFilter?.trim().toLowerCase();

  let excludedInvalidPeakCount = 0;
  let excludedInvalidRampCount = 0;
  const startupPcts: number[] = [];

  for (const row of rows) {
    if (row.month !== input.month) continue;
    if (wantedBuildingIds && !wantedBuildingIds.has(row.buildingId)) continue;
    if (normalizedTypeFilter) {
      const type = buildingTypeById[row.buildingId];
      if (!type || type.trim().toLowerCase() !== normalizedTypeFilter) continue;
    }

    if (
      typeof row.monthly_peak_kw !== "number" ||
      !Number.isFinite(row.monthly_peak_kw) ||
      row.monthly_peak_kw <= 0
    ) {
      excludedInvalidPeakCount += 1;
      continue;
    }
    if (!isNonNegativeFiniteNumber(row.max_morning_ramp_kw)) {
      excludedInvalidRampCount += 1;
      continue;
    }

    startupPcts.push((row.max_morning_ramp_kw / row.monthly_peak_kw) * 100);
  }

  if (startupPcts.length === 0) {
    return {
      key: "district_avg_startup_intensity_pct",
      label: "Avg Startup Intensity",
      value: null,
      unit: "%",
      trendValue: null,
      trendUnit: "pp",
      trendDirection: "flat",
      status: "red",
      notes: "No valid buildings after startup intensity exclusions.",
    };
  }

  const avgIntensityRaw =
    startupPcts.reduce((sum, value) => sum + value, 0) / startupPcts.length;
  const avgIntensity = roundTo(avgIntensityRaw, STARTUP_INTENSITY_DECIMALS);

  let status: KpiTileStatus = "red";
  if (avgIntensity < 15) status = "green";
  else if (avgIntensity <= 25) status = "yellow";

  const notesParts: string[] = [];
  if (excludedInvalidPeakCount > 0) {
    notesParts.push(
      `${excludedInvalidPeakCount} building(s) excluded due to missing/zero/invalid monthly_peak_kw.`
    );
  }
  if (excludedInvalidRampCount > 0) {
    notesParts.push(
      `${excludedInvalidRampCount} building(s) excluded due to missing/invalid max_morning_ramp_kw.`
    );
  }

  if (!isNonNegativeFiniteNumber(input.prior3moAvgStartupIntensityPct)) {
    return {
      key: "district_avg_startup_intensity_pct",
      label: "Avg Startup Intensity",
      value: avgIntensity,
      unit: "%",
      trendValue: null,
      trendUnit: "pp",
      trendDirection: "flat",
      status,
      notes:
        notesParts.length > 0
          ? `${notesParts.join(" ")} Trend unavailable: prior3moAvgStartupIntensityPct missing/invalid.`
          : "Trend unavailable: prior3moAvgStartupIntensityPct missing/invalid.",
    };
  }

  const delta = avgIntensity - input.prior3moAvgStartupIntensityPct;
  return {
    key: "district_avg_startup_intensity_pct",
    label: "Avg Startup Intensity",
    value: avgIntensity,
    unit: "%",
    trendValue: roundTo(delta, STARTUP_INTENSITY_DECIMALS),
    trendUnit: "pp",
    trendDirection: getTrendDirection(delta),
    status,
    notes: notesParts.length > 0 ? notesParts.join(" ") : undefined,
  };
}

export function computeAvgAfterHoursLoadKpi(input: {
  month: YearMonth;
  buildingBaseload?: BuildingBaseloadRecord[];
  buildingIds?: string[];
  buildingTypeFilter?: string;
  buildingTypeById?: Record<string, string>;
  prior3moAvgAfterHoursWPerSqft?: number | null;
}): DistrictKpiTile<"district_avg_after_hours_w_per_sqft"> {
  const rows = input.buildingBaseload ?? [];
  const wantedBuildingIds =
    input.buildingIds && input.buildingIds.length > 0
      ? new Set(input.buildingIds)
      : null;
  const buildingTypeById = input.buildingTypeById ?? {};
  const normalizedTypeFilter = input.buildingTypeFilter?.trim().toLowerCase();

  let excludedInvalidNightKwCount = 0;
  let excludedInvalidPeakWeekdayKwCount = 0;
  const values: number[] = [];

  for (const row of rows) {
    if (row.month !== input.month) continue;
    if (wantedBuildingIds && !wantedBuildingIds.has(row.buildingId)) continue;
    if (normalizedTypeFilter) {
      const type = buildingTypeById[row.buildingId];
      if (!type || type.trim().toLowerCase() !== normalizedTypeFilter) continue;
    }

    const avgNightKw = isNonNegativeFiniteNumber(row.avg_2am_kw_weekdays)
      ? row.avg_2am_kw_weekdays
      : isNonNegativeFiniteNumber(row.avg_night_kw_10pm_4am)
      ? row.avg_night_kw_10pm_4am
      : isNonNegativeFiniteNumber(row.avg_night_min_kw)
      ? row.avg_night_min_kw
      : null;
    if (!isNonNegativeFiniteNumber(avgNightKw)) {
      excludedInvalidNightKwCount += 1;
      continue;
    }
    const peakWeekdayKw = row.peak_weekday_kw;
    if (
      typeof peakWeekdayKw !== "number" ||
      !Number.isFinite(peakWeekdayKw) ||
      peakWeekdayKw <= 0
    ) {
      excludedInvalidPeakWeekdayKwCount += 1;
      continue;
    }

    values.push((avgNightKw / peakWeekdayKw) * 100);
  }

  if (values.length === 0) {
    return {
      key: "district_avg_after_hours_w_per_sqft",
      label: "Night Baseload %",
      value: null,
      unit: "%",
      trendValue: null,
      trendUnit: "pp",
      trendDirection: "flat",
      status: "red",
      notes: "No valid buildings after after-hours load exclusions.",
    };
  }

  const avgRaw = values.reduce((sum, v) => sum + v, 0) / values.length;
  const avgLoad = roundTo(avgRaw, AFTER_HOURS_LOAD_DECIMALS);

  let status: KpiTileStatus = "red";
  if (avgLoad < 30) status = "green";
  else if (avgLoad < 40) status = "yellow";

  const notesParts: string[] = [];
  if (excludedInvalidNightKwCount > 0) {
    notesParts.push(
      `${excludedInvalidNightKwCount} building(s) excluded due to missing/invalid avg_kW (weekday 2AM hour).`
    );
  }
  if (excludedInvalidPeakWeekdayKwCount > 0) {
    notesParts.push(
      `${excludedInvalidPeakWeekdayKwCount} building(s) excluded due to missing/invalid peak_weekday_kw.`
    );
  }

  if (!isNonNegativeFiniteNumber(input.prior3moAvgAfterHoursWPerSqft)) {
    return {
      key: "district_avg_after_hours_w_per_sqft",
      label: "Night Baseload %",
      value: avgLoad,
      unit: "%",
      trendValue: null,
      trendUnit: "pp",
      trendDirection: "flat",
      status,
      notes:
        notesParts.length > 0
          ? `${notesParts.join(" ")} Trend unavailable: prior3moAvgAfterHoursWPerSqft missing/invalid.`
          : "Trend unavailable: prior3moAvgAfterHoursWPerSqft missing/invalid.",
    };
  }

  const delta = avgLoad - input.prior3moAvgAfterHoursWPerSqft;
  return {
    key: "district_avg_after_hours_w_per_sqft",
    label: "Night Baseload %",
    value: avgLoad,
    unit: "%",
    trendValue: roundTo(delta, AFTER_HOURS_LOAD_DECIMALS),
    trendUnit: "pp",
    trendDirection: getTrendDirection(delta),
    status,
    notes: notesParts.length > 0 ? notesParts.join(" ") : undefined,
  };
}

export function computeWeekendOperationsIndexKpi(input: {
  month: YearMonth;
  buildingWeekend?: BuildingWeekendRecord[];
  buildingIds?: string[];
  buildingTypeFilter?: string;
  buildingTypeById?: Record<string, string>;
  priorMonthWeekendIndexPct?: number | null;
}): DistrictKpiTile<"district_weekend_operations_index_pct"> {
  const rows = input.buildingWeekend ?? [];
  const wantedBuildingIds =
    input.buildingIds && input.buildingIds.length > 0
      ? new Set(input.buildingIds)
      : null;
  const buildingTypeById = input.buildingTypeById ?? {};
  const normalizedTypeFilter = input.buildingTypeFilter?.trim().toLowerCase();

  let excludedInvalidWeekendCount = 0;
  let excludedInvalidWeekdayCount = 0;
  const weekendIndexPcts: number[] = [];

  for (const row of rows) {
    if (row.month !== input.month) continue;
    if (wantedBuildingIds && !wantedBuildingIds.has(row.buildingId)) continue;
    if (normalizedTypeFilter) {
      const type = buildingTypeById[row.buildingId];
      if (!type || type.trim().toLowerCase() !== normalizedTypeFilter) continue;
    }

    if (!isNonNegativeFiniteNumber(row.weekend_kwh_avg)) {
      excludedInvalidWeekendCount += 1;
      continue;
    }
    if (
      typeof row.weekday_kwh_avg !== "number" ||
      !Number.isFinite(row.weekday_kwh_avg) ||
      row.weekday_kwh_avg <= 0
    ) {
      excludedInvalidWeekdayCount += 1;
      continue;
    }

    weekendIndexPcts.push((row.weekend_kwh_avg / row.weekday_kwh_avg) * 100);
  }

  if (weekendIndexPcts.length === 0) {
    return {
      key: "district_weekend_operations_index_pct",
      label: "Weekend Operations Index %",
      value: null,
      unit: "%",
      trendValue: null,
      trendUnit: "pp",
      trendDirection: "flat",
      status: "red",
      notes: "No valid buildings after weekend index exclusions.",
    };
  }

  const avgWeekendIndexRaw =
    weekendIndexPcts.reduce((sum, v) => sum + v, 0) / weekendIndexPcts.length;
  const avgWeekendIndex = roundTo(avgWeekendIndexRaw, WEEKEND_INDEX_DECIMALS);

  let status: KpiTileStatus = "red";
  if (avgWeekendIndex < 50) status = "green";
  else if (avgWeekendIndex <= 65) status = "yellow";

  const notesParts: string[] = [];
  if (excludedInvalidWeekendCount > 0) {
    notesParts.push(
      `${excludedInvalidWeekendCount} building(s) excluded due to missing/invalid weekend_kwh_avg.`
    );
  }
  if (excludedInvalidWeekdayCount > 0) {
    notesParts.push(
      `${excludedInvalidWeekdayCount} building(s) excluded due to missing/invalid/zero weekday_kwh_avg.`
    );
  }

  if (!isNonNegativeFiniteNumber(input.priorMonthWeekendIndexPct)) {
    return {
      key: "district_weekend_operations_index_pct",
      label: "Weekend Operations Index %",
      value: avgWeekendIndex,
      unit: "%",
      trendValue: null,
      trendUnit: "pp",
      trendDirection: "flat",
      status,
      notes:
        notesParts.length > 0
          ? `${notesParts.join(" ")} Trend unavailable: priorMonthWeekendIndexPct missing/invalid.`
          : "Trend unavailable: priorMonthWeekendIndexPct missing/invalid.",
    };
  }

  const delta = avgWeekendIndex - input.priorMonthWeekendIndexPct;
  return {
    key: "district_weekend_operations_index_pct",
    label: "Weekend Operations Index %",
    value: avgWeekendIndex,
    unit: "%",
    trendValue: roundTo(delta, WEEKEND_INDEX_DECIMALS),
    trendUnit: "pp",
    trendDirection: getTrendDirection(delta),
    status,
    notes: notesParts.length > 0 ? notesParts.join(" ") : undefined,
  };
}

function neutralTile<K extends DistrictKpiKey>(
  key: K,
  label: string,
  unit: string
): DistrictKpiTile<K> {
  return {
    key,
    label,
    value: null,
    unit,
    trendValue: null,
    trendUnit: unit,
    trendDirection: "flat",
    status: "neutral",
    notes: "Not implemented in this phase.",
  };
}

export const kpiService: KpiService = {
  async getDistrictKpis(input) {
    const providerData = await getDistrictKpiInputData(input);
    const mergedInput: GetDistrictKpisInput = {
      ...providerData,
      ...input,
      districtIntervalAgg: input.districtIntervalAgg ?? providerData.districtIntervalAgg,
      buildingMonthlyEnergy: input.buildingMonthlyEnergy ?? providerData.buildingMonthlyEnergy,
      buildingDemandFacts: input.buildingDemandFacts ?? providerData.buildingDemandFacts,
      buildingMonthlyOps: input.buildingMonthlyOps ?? providerData.buildingMonthlyOps,
      buildingBaseload: input.buildingBaseload ?? providerData.buildingBaseload,
      buildingWeekend: input.buildingWeekend ?? providerData.buildingWeekend,
      buildingTypeById: input.buildingTypeById ?? providerData.buildingTypeById,
      prior3moDistrictPeaks: input.prior3moDistrictPeaks ?? providerData.prior3moDistrictPeaks,
      priorMonthKwhTotal: input.priorMonthKwhTotal ?? providerData.priorMonthKwhTotal,
      prior3moAvgStartupIntensityPct:
        input.prior3moAvgStartupIntensityPct ?? providerData.prior3moAvgStartupIntensityPct,
      prior3moAvgAfterHoursWPerSqft:
        input.prior3moAvgAfterHoursWPerSqft ?? providerData.prior3moAvgAfterHoursWPerSqft,
      afterHoursLoadPercentiles: input.afterHoursLoadPercentiles ?? providerData.afterHoursLoadPercentiles,
      priorMonthWeekendIndexPct: input.priorMonthWeekendIndexPct ?? providerData.priorMonthWeekendIndexPct,
      priorMonthEstimatedDemandSavingsUsd:
        input.priorMonthEstimatedDemandSavingsUsd ?? providerData.priorMonthEstimatedDemandSavingsUsd,
      districtKwhTotal: input.districtKwhTotal ?? providerData.districtKwhTotal,
      districtPeakKw: input.districtPeakKw ?? providerData.districtPeakKw,
      hoursInPeriod: input.hoursInPeriod ?? providerData.hoursInPeriod,
      prior3moAvgLoadFactorPct: input.prior3moAvgLoadFactorPct ?? providerData.prior3moAvgLoadFactorPct,
      monthlyTopPeaks: input.monthlyTopPeaks ?? providerData.monthlyTopPeaks,
    };

    const energyUse = computeDistrictEnergyUseKpi(mergedInput);
    const peakDemand = computeDistrictPeakDemandKpi(mergedInput);
    const loadFactor = computeLoadFactorKpi({
      district_kwh_total:
        typeof energyUse.value === "number" ? energyUse.value : mergedInput.districtKwhTotal,
      district_peak_kw:
        typeof peakDemand.value === "number" ? peakDemand.value : mergedInput.districtPeakKw,
      hours_in_period: mergedInput.hoursInPeriod,
      prior3moAvgLoadFactorPct: mergedInput.prior3moAvgLoadFactorPct,
      loadFactorThresholds: mergedInput.loadFactorThresholds,
    });
    const demandRiskBuildings = computeDemandRiskBuildingsKpi(mergedInput);
    const demandSavingsPotential = computeEstimatedDemandSavingsPotentialKpi(mergedInput);
    const avgStartupIntensity = computeAvgStartupIntensityKpi(mergedInput);
    const avgAfterHoursLoad = computeAvgAfterHoursLoadKpi(mergedInput);
    const weekendOperationsIndex = computeWeekendOperationsIndexKpi(mergedInput);

    return {
      tiles: [
        energyUse,
        loadFactor,
        demandRiskBuildings,
        peakDemand,
        avgStartupIntensity,
        avgAfterHoursLoad,
        weekendOperationsIndex,
        demandSavingsPotential,
      ],
    };
  },
};

export const getDistrictKpis: KpiService["getDistrictKpis"] = (input) =>
  kpiService.getDistrictKpis(input);
