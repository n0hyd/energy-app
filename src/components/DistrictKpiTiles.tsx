import * as React from "react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import type {
  DistrictKpis,
  DistrictKpiKey,
  DistrictKpiTile,
  KpiTileStatus,
  KpiTrendDirection,
} from "@/lib/kpiService";
import { cn } from "@/lib/utils";

export interface DistrictKpiTilesProps {
  kpis?: DistrictKpis;
  isLoading?: boolean;
  className?: string;
}

export function formatNumber(value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
  }).format(value);
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(value) + "%";
}

const KPI_TOOLTIP_BY_KEY: Record<DistrictKpiKey, string> = {
  district_peak_demand_kw:
    "Highest 15-minute demand across all buildings this month. Watch for spikes above the recent 3-month average; these drive demand charges and can signal startup or cooling issues.",
  district_total_energy_kbtu:
    "Total electricity used across the district this month. Look for unusual increases versus last month; large jumps may indicate schedule drift or equipment issues.",
  district_demand_risk_buildings_count:
    "Number of buildings where demand exceeded their billing threshold (ratchet or minimum). These sites have active demand savings potential this cycle.",
  district_avg_startup_intensity_pct:
    "Average morning demand ramp as a percent of each building's peak. Higher values suggest equipment starting simultaneously and possible demand spikes.",
  district_avg_after_hours_w_per_sqft:
    "Average weekday 2AM baseload as a percent of peak weekday demand. Higher values may indicate schedules not shutting down properly.",
  district_weekend_operations_index_pct:
    "Weekend energy use compared to average weekday use. Values above 65% may indicate unnecessary weekend operation.",
  district_load_factor_pct:
    "Measures how evenly demand is used throughout the month. Lower values mean spikier usage and higher demand cost exposure.",
  district_estimated_demand_savings_usd:
    "Estimated demand cost that could be avoided if at-risk buildings reduced demand to their billing threshold. Focus here for highest short-term savings opportunities.",
};

const KPI_BETTER_DIRECTION: Record<DistrictKpiKey, "up" | "down"> = {
  district_peak_demand_kw: "down",
  district_total_energy_kbtu: "down",
  district_demand_risk_buildings_count: "down",
  district_avg_startup_intensity_pct: "down",
  district_avg_after_hours_w_per_sqft: "down",
  district_weekend_operations_index_pct: "down",
  district_load_factor_pct: "up",
  district_estimated_demand_savings_usd: "down",
};

function formatValueWithUnit(tile: DistrictKpiTile): string {
  if (tile.value === null || tile.value === undefined || tile.value === "") {
    return "No data";
  }

  if (typeof tile.value === "string") {
    return tile.unit ? `${tile.value} ${tile.unit}` : tile.value;
  }

  if (tile.unit === "USD") return formatCurrency(tile.value);
  if (tile.unit === "%") return formatPercent(tile.value, 1);

  const digits = tile.unit === "W/sqft" ? 2 : 1;
  return tile.unit
    ? `${formatNumber(tile.value, digits)} ${tile.unit}`
    : formatNumber(tile.value, digits);
}

function trendToneClass(tile: DistrictKpiTile): string {
  if (tile.trendValue === null || tile.trendValue === undefined || tile.trendValue === "") {
    return "text-muted-foreground";
  }
  if (tile.trendDirection === "flat") return "text-muted-foreground";
  const betterDirection = KPI_BETTER_DIRECTION[tile.key];
  const isGood = tile.trendDirection === betterDirection;
  return isGood ? "text-green-700" : "text-red-700";
}

function nightBaseloadValueToneClass(tile: DistrictKpiTile): string {
  if (
    tile.key !== "district_avg_after_hours_w_per_sqft" &&
    tile.key !== "district_weekend_operations_index_pct"
  ) {
    return "text-gray-900";
  }
  if (typeof tile.value !== "number" || !Number.isFinite(tile.value)) return "text-gray-900";
  if (tile.key === "district_avg_after_hours_w_per_sqft") {
    if (tile.value < 30) return "text-green-700";
    if (tile.value < 40) return "text-amber-600";
    return "text-red-700";
  }
  if (tile.value < 40) return "text-green-700";
  if (tile.value < 60) return "text-amber-600";
  return "text-red-700";
}

function formatTrend(tile: DistrictKpiTile): string {
  if (tile.trendValue === null || tile.trendValue === undefined || tile.trendValue === "") {
    return "No trend";
  }

  if (typeof tile.trendValue === "string") {
    return tile.trendValue;
  }

  const sign = tile.trendValue > 0 ? "+" : tile.trendValue < 0 ? "-" : "";
  const abs = Math.abs(tile.trendValue);

  if (tile.trendUnit === "%" || tile.trendUnit === "pp") {
    return `${sign}${formatPercent(abs, 1)}`;
  }

  if (tile.trendUnit === "USD") {
    return `${sign}${formatCurrency(abs)}`;
  }

  return `${sign}${formatNumber(abs, 1)} ${tile.trendUnit}`;
}

function formatDateLabel(ts: string): string {
  return new Date(ts).toLocaleDateString();
}

function formatTimeLabel(ts: string): string {
  return new Date(ts).toLocaleTimeString();
}

function tileStatusClass(status: KpiTileStatus): string {
  return `kpi-tile--${status}`;
}

function tileAriaLabel(tile: DistrictKpiTile): string {
  const parts = [
    tile.label,
    `Value: ${formatValueWithUnit(tile)}`,
    `Trend: ${formatTrend(tile)}`,
    `Status: ${tile.status}`,
  ];

  if (tile.asOfTimestamp) {
    parts.push(`Occurred at ${new Date(tile.asOfTimestamp).toLocaleString()}`);
  }
  if (tile.peakEvents && tile.peakEvents.length > 0) {
    parts.push(
      `Top peaks: ${tile.peakEvents
        .slice(0, 5)
        .map((e) => `${e.rank}: ${formatNumber(e.kw, 1)} kW at ${new Date(e.ts).toLocaleString()}`)
        .join("; ")}`
    );
  }

  return parts.join(". ");
}

function TrendIcon({ direction }: { direction: KpiTrendDirection }) {
  if (direction === "up") return <TrendingUp size={14} aria-hidden="true" />;
  if (direction === "down") return <TrendingDown size={14} aria-hidden="true" />;
  return <Minus size={14} aria-hidden="true" />;
}

function DistrictKpiTileCard({ tile }: { tile: DistrictKpiTile }) {
  const hasData = tile.value !== null && tile.value !== undefined && tile.value !== "";
  const tooltipText = KPI_TOOLTIP_BY_KEY[tile.key];
  const tooltipId = `kpi-tooltip-${tile.key}`;

  return (
    <article
      aria-label={tileAriaLabel(tile)}
      className={cn(
        "kpi-tile rounded-lg border border-gray-200 bg-white p-6 shadow",
        "bg-[var(--kpi-tile-bg,var(--background))]",
        "border-[var(--kpi-tile-border,var(--border))]",
        tileStatusClass(tile.status)
      )}
      data-status={tile.status}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="text-sm font-medium leading-5">{tile.label}</h3>
          <div className="relative inline-flex items-center group">
            <button
              type="button"
              aria-label={`More information about ${tile.label}`}
              aria-describedby={tooltipId}
              className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-blue-300 bg-blue-50 text-[10px] font-semibold leading-none text-blue-700"
            >
              i
            </button>
            <div
              id={tooltipId}
              role="tooltip"
              className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 hidden w-64 -translate-x-1/2 rounded-md border border-slate-700 bg-slate-900 p-2 text-xs text-white shadow-lg group-hover:block group-focus-within:block"
            >
              {tooltipText}
            </div>
          </div>
        </div>
        <span
          aria-label={`Trend ${tile.trendDirection}`}
          className={cn("inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap", trendToneClass(tile))}
        >
          <TrendIcon direction={tile.trendDirection} />
          {formatTrend(tile)}
        </span>
      </div>

      {tile.key === "district_peak_demand_kw" &&
      Array.isArray(tile.peakEvents) &&
      tile.peakEvents.length > 0 ? (
        <>
          <div className="mt-3 flex items-start justify-between gap-3">
            <p className="text-2xl font-semibold tracking-tight" aria-live="polite">
              {formatValueWithUnit(tile)}
            </p>
            <div className="text-right text-xs leading-4 text-muted-foreground">
              <div>{formatDateLabel(tile.peakEvents[0].ts)}</div>
              <div>{formatTimeLabel(tile.peakEvents[0].ts)}</div>
            </div>
          </div>
          <div className="mt-2 space-y-1">
            <div className="font-medium text-xs text-muted-foreground">Top monthly peaks</div>
            {tile.peakEvents.slice(0, 5).map((event) => (
              <div
                key={`${tile.key}-peak-${event.rank}-${event.ts}`}
                className="flex items-center justify-between gap-3 text-xs text-muted-foreground"
              >
                <span className="truncate">
                  {formatDateLabel(event.ts)} {formatTimeLabel(event.ts)}
                </span>
                <span>{formatNumber(event.kw, 1)} kW</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-3 flex items-baseline gap-2" aria-live="polite">
          <p className={cn("text-2xl font-semibold tracking-tight", nightBaseloadValueToneClass(tile))}>
            {formatValueWithUnit(tile)}
          </p>
          {tile.key === "district_avg_after_hours_w_per_sqft" ? (
            <span className="text-xs text-gray-500">&lt;30% is goal</span>
          ) : null}
          {tile.key === "district_weekend_operations_index_pct" ? (
            <span className="text-xs text-gray-500">&lt;40% is goal</span>
          ) : null}
        </div>
      )}

      {tile.asOfTimestamp && (!tile.peakEvents || tile.peakEvents.length === 0) ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Occurred at {new Date(tile.asOfTimestamp).toLocaleString()}
        </p>
      ) : null}

      {!hasData && (
        <p className="mt-2 text-xs text-muted-foreground" role="status">
          No data available for this KPI.
        </p>
      )}

      {tile.notes ? <p className="mt-2 text-xs text-muted-foreground">{tile.notes}</p> : null}
    </article>
  );
}

function DistrictKpiSkeletonTile() {
  return (
    <div className="rounded-xl border p-4 shadow-sm" aria-hidden="true">
      <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
      <div className="mt-3 h-8 w-1/2 animate-pulse rounded bg-muted" />
      <div className="mt-3 h-3 w-1/3 animate-pulse rounded bg-muted" />
    </div>
  );
}

export function DistrictKpiTiles({ kpis, isLoading = false, className }: DistrictKpiTilesProps) {
  const tiles = kpis?.tiles ?? [];

  if (isLoading) {
    return (
      <section aria-label="District KPI tiles loading" className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4", className)}>
        {Array.from({ length: 8 }).map((_, idx) => (
          <DistrictKpiSkeletonTile key={`kpi-skeleton-${idx}`} />
        ))}
      </section>
    );
  }

  return (
    <section aria-label="District KPI tiles" className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {tiles.map((tile) => (
        <DistrictKpiTileCard key={tile.key} tile={tile} />
      ))}
    </section>
  );
}
