import type {
  BuildingBaseloadRecord,
  BuildingDemandFactRecord,
  BuildingMonthlyEnergyRecord,
  BuildingMonthlyOpsRecord,
  BuildingWeekendRecord,
  DistrictIntervalAggRecord,
  GetDistrictKpisInput,
  YearMonth,
} from "@/lib/kpiService";

export interface KpiProviderContext {
  districtId: string;
  month: YearMonth;
  buildingIds?: string[];
}

export interface KpiComparisonInputs {
  prior3moDistrictPeaks: number[];
  priorMonthKwhTotal: number | null;
  prior3moAvgStartupIntensityPct: number | null;
  prior3moAvgAfterHoursWPerSqft: number | null;
  afterHoursLoadPercentiles: {
    p50?: number | null;
    p75?: number | null;
  };
  priorMonthWeekendIndexPct: number | null;
  districtKwhTotal: number | null;
  districtPeakKw: number | null;
  hoursInPeriod: number | null;
  prior3moAvgLoadFactorPct: number | null;
}

const DEFAULT_BUILDING_IDS = ["bldg-1", "bldg-2", "bldg-3", "bldg-4"];

function toNumberSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function monthStartIso(month: YearMonth): string {
  return `${month}-01T00:00:00.000Z`;
}

function addMonths(month: YearMonth, delta: number): YearMonth {
  const [year, mm] = month.split("-").map(Number);
  const dt = new Date(Date.UTC(year, (mm || 1) - 1 + delta, 1));
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}` as YearMonth;
}

function resolveBuildingIds(ctx: KpiProviderContext): string[] {
  if (ctx.buildingIds && ctx.buildingIds.length > 0) return ctx.buildingIds;
  return DEFAULT_BUILDING_IDS;
}

export async function getDistrictIntervalAggData(
  ctx: KpiProviderContext
): Promise<DistrictIntervalAggRecord[]> {
  const seed = toNumberSeed(`${ctx.districtId}:${ctx.month}`);
  const start = new Date(monthStartIso(ctx.month));
  const points: DistrictIntervalAggRecord[] = [];

  for (let i = 0; i < 96; i += 1) {
    const ts = new Date(start.getTime() + i * 15 * 60 * 1000).toISOString();
    const baseline = 280 + (seed % 35);
    const wave = Math.sin((i / 96) * Math.PI * 2) * 85;
    points.push({
      ts,
      kw_total: Math.max(0, Number((baseline + wave).toFixed(2))),
    });
  }

  return points;
}

export async function getBuildingMonthlyEnergyData(
  ctx: KpiProviderContext
): Promise<BuildingMonthlyEnergyRecord[]> {
  const seed = toNumberSeed(`energy:${ctx.districtId}:${ctx.month}`);
  return resolveBuildingIds(ctx).map((buildingId, idx) => ({
    buildingId,
    month: ctx.month,
    kwh_total: 28000 + idx * 3200 + (seed % 1800),
  }));
}

export async function getBuildingDemandFactsData(
  ctx: KpiProviderContext
): Promise<BuildingDemandFactRecord[]> {
  const seed = toNumberSeed(`demand:${ctx.districtId}:${ctx.month}`);
  return resolveBuildingIds(ctx).map((buildingId, idx) => {
    const base = 160 + idx * 14 + (seed % 9);
    return {
      buildingId,
      adjusted_demand_kw: base + 12,
      tariff_min_kw: base - 10,
      ratchet_kw: base - 6,
      billing_demand_kw: base + 5,
      effective_demand_rate_usd_per_kw: 13.5 + idx * 0.85,
    };
  });
}

export async function getBuildingMonthlyOpsData(
  ctx: KpiProviderContext
): Promise<BuildingMonthlyOpsRecord[]> {
  const seed = toNumberSeed(`ops:${ctx.districtId}:${ctx.month}`);
  return resolveBuildingIds(ctx).map((buildingId, idx) => {
    const monthlyPeakKw = 190 + idx * 20 + (seed % 11);
    const maxMorningRampKw = monthlyPeakKw * (0.11 + idx * 0.015);
    return {
      buildingId,
      month: ctx.month,
      monthly_peak_kw: Number(monthlyPeakKw.toFixed(2)),
      max_morning_ramp_kw: Number(maxMorningRampKw.toFixed(2)),
      sqft: 42000 + idx * 6500,
    };
  });
}

export async function getBuildingBaseloadData(
  ctx: KpiProviderContext
): Promise<BuildingBaseloadRecord[]> {
  const seed = toNumberSeed(`baseload:${ctx.districtId}:${ctx.month}`);
  return resolveBuildingIds(ctx).map((buildingId, idx) => ({
    buildingId,
    month: ctx.month,
    avg_night_min_kw: 18 + idx * 3.3 + (seed % 5),
    sqft: 42000 + idx * 6500,
  }));
}

export async function getBuildingWeekendData(
  ctx: KpiProviderContext
): Promise<BuildingWeekendRecord[]> {
  const seed = toNumberSeed(`weekend:${ctx.districtId}:${ctx.month}`);
  return resolveBuildingIds(ctx).map((buildingId, idx) => ({
    buildingId,
    month: ctx.month,
    weekend_kwh_avg: 780 + idx * 70 + (seed % 30),
    weekday_kwh_avg: 1200 + idx * 95 + (seed % 45),
  }));
}

export async function getBuildingTypeByIdData(
  ctx: KpiProviderContext
): Promise<Record<string, string>> {
  const ids = resolveBuildingIds(ctx);
  const map: Record<string, string> = {};
  ids.forEach((id, idx) => {
    map[id] = idx % 2 === 0 ? "school" : "office";
  });
  return map;
}

export async function getKpiComparisonInputsData(
  ctx: KpiProviderContext
): Promise<KpiComparisonInputs> {
  const seed = toNumberSeed(`compare:${ctx.districtId}:${ctx.month}`);
  const prior1 = addMonths(ctx.month, -1);
  const prior2 = addMonths(ctx.month, -2);
  const prior3 = addMonths(ctx.month, -3);
  void prior1;
  void prior2;
  void prior3;

  return {
    prior3moDistrictPeaks: [342 + (seed % 12), 355 + (seed % 10), 348 + (seed % 14)],
    priorMonthKwhTotal: 118500 + (seed % 4000),
    prior3moAvgStartupIntensityPct: 15.2 + (seed % 20) / 10,
    prior3moAvgAfterHoursWPerSqft: 0.58 + (seed % 7) / 100,
    afterHoursLoadPercentiles: { p50: 0.62, p75: 0.81 },
    priorMonthWeekendIndexPct: 63.4 + (seed % 14) / 10,
    districtKwhTotal: 121000 + (seed % 5000),
    districtPeakKw: 372 + (seed % 22),
    hoursInPeriod: 24 * 30,
    prior3moAvgLoadFactorPct: 49.5 + (seed % 20) / 10,
  };
}

export async function getDistrictKpiInputData(
  input: GetDistrictKpisInput
): Promise<GetDistrictKpisInput> {
  const ctx: KpiProviderContext = {
    districtId: input.districtId,
    month: input.month,
    buildingIds: input.buildingIds,
  };

  const [
    districtIntervalAgg,
    buildingMonthlyEnergy,
    buildingDemandFacts,
    buildingMonthlyOps,
    buildingBaseload,
    buildingWeekend,
    buildingTypeById,
    comparisons,
  ] = await Promise.all([
    getDistrictIntervalAggData(ctx),
    getBuildingMonthlyEnergyData(ctx),
    getBuildingDemandFactsData(ctx),
    getBuildingMonthlyOpsData(ctx),
    getBuildingBaseloadData(ctx),
    getBuildingWeekendData(ctx),
    getBuildingTypeByIdData(ctx),
    getKpiComparisonInputsData(ctx),
  ]);

  return {
    ...input,
    districtIntervalAgg,
    buildingMonthlyEnergy,
    buildingDemandFacts,
    buildingMonthlyOps,
    buildingBaseload,
    buildingWeekend,
    buildingTypeById,
    ...comparisons,
  };
}
