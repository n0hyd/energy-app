import React, { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/router";
import { useAuthGate } from "@/hooks/useAuthGate";
import { useBuildingsOverview } from "@/hooks/useBuildingsOverview";
import { useBuildingSparklines } from "@/hooks/useBuildingSparklines";
import {
  Search,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";


// TEMP: helpers for trend icon until you wire to real data
function getTrendIcon(trend: "up" | "down" | "flat" | null | undefined) {
  if (trend === "up") return <TrendingUp className="w-4 h-4 text-red-500" />;
  if (trend === "down") return <TrendingDown className="w-4 h-4 text-green-500" />;
  return <Minus className="w-4 h-4 text-gray-400" />;
}

type SparklineProps = {
  values: number[];
};

const Sparkline: React.FC<SparklineProps> = ({ values }) => {
  if (!values.length) return null;

  const width = 80;
  const height = 24;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;

  const points = values
    .map((v, i) => {
      const x = (values.length === 1 ? 0 : (i / (values.length - 1)) * width);
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-6"
      preserveAspectRatio="none"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        points={points}
      />
    </svg>
  );
};



const BuildingsPage: React.FC = () => {
  const router = useRouter();
  const { loading: authLoading, orgId } = useAuthGate();

  const {
    loading: rowsLoading,
    rows,
    error: rowsError,
  } = useBuildingsOverview(orgId ?? null);

  const { sparklinesByBuildingId } = useBuildingSparklines(orgId ?? null);

  // ✅ Rolling-12 map (building_id -> { rolling_12_cost, months_counted, ... })
  const [roll12ByBuildingId, setRoll12ByBuildingId] = useState<Record<string, any>>({});

  // PM Meters preview state (for dry run)
  const [pmPreview, setPmPreview] = useState<any[] | null>(null);
  const [pmLoading, setPmLoading] = useState(false);
  const [pmError, setPmError] = useState<string | null>(null);

  // UI state
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"schools" | "all" | "complete" | "missing">(
    "schools"
  );
  const [sortBy, setSortBy] = useState<"name" | "cost" | "gaps">("name");
  const [schoolBuildingIds, setSchoolBuildingIds] = useState<Set<string>>(new Set());

  const buildings = useMemo(() => {
    if (!rows) return [];

    const byId = new Map<string, any>();

    for (const row of rows as any[]) {
      const existing = byId.get(row.id);

      if (!existing) {
        // First time we've seen this building id
        byId.set(row.id, row);
      } else {
        // If we get multiple rows per building (e.g. different meters/providers),
        // keep the one with the latest bill end date so "Latest Cost" makes sense.
        const existingEnd = existing.last_bill_end
          ? new Date(existing.last_bill_end).getTime()
          : 0;
        const newEnd = row.last_bill_end
          ? new Date(row.last_bill_end).getTime()
          : 0;

        if (newEnd > existingEnd) {
          byId.set(row.id, row);
        }
      }
    }

    return Array.from(byId.values());
  }, [rows]);

  useEffect(() => {
    if (!orgId) {
      setSchoolBuildingIds(new Set());
      return;
    }

    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("buildings")
        .select("id")
        .eq("org_id", orgId)
        .eq("activity_code", "K-12 School");

      if (cancelled) return;
      if (error) {
        console.error("Error loading school building ids", error);
        setSchoolBuildingIds(new Set());
        return;
      }

      setSchoolBuildingIds(new Set((data ?? []).map((b: any) => String(b.id))));
    })();

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  // --- Rolling 12-month cost for ALL buildings (client-side reuse) ---
  function monthKey(d: Date) {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  // Matches the "midpoint month" idea from the building detail page
  function billMonthFromPeriod(periodStartISO?: string | null, periodEndISO?: string | null) {
    const start = periodStartISO ? new Date(periodStartISO) : null;
    const end = periodEndISO ? new Date(periodEndISO) : null;
    const hasStart = !!start && !Number.isNaN(start.getTime());
    const hasEnd = !!end && !Number.isNaN(end.getTime());

    if (hasStart && hasEnd) {
      const mid = new Date(start!.getTime() + (end!.getTime() - start!.getTime()) / 2);
      return new Date(Date.UTC(mid.getUTCFullYear(), mid.getUTCMonth(), 1));
    }

    if (hasEnd) {
      // Most utility bills ending on the 1st belong to the prior month.
      const d = new Date(Date.UTC(end!.getUTCFullYear(), end!.getUTCMonth(), end!.getUTCDate()));
      d.setUTCDate(d.getUTCDate() - 1);
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    }

    if (hasStart) {
      return new Date(Date.UTC(start!.getUTCFullYear(), start!.getUTCMonth(), 1));
    }

    return null;
  }

  useEffect(() => {
    // wait until we have buildings to look up
    if (!orgId) return;
    if (!buildings || buildings.length === 0) {
      setRoll12ByBuildingId({});
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const buildingIds = buildings.map((b: any) => b.id).filter(Boolean);

        // Pull only recent-ish bills to keep it fast.
        // This still supports a true rolling 12.
        const since = new Date();
        since.setUTCDate(1);
        since.setUTCMonth(since.getUTCMonth() - 14); // 14 months back = safe buffer

        // Build meter scope from selected buildings, then fetch bills by meter_id.
        const { data: scopeMeters, error: scopeErr } = await supabase
          .from("meters")
          .select("id, building_id")
          .in("building_id", buildingIds);
        if (scopeErr) throw scopeErr;
        if (cancelled) return;

        const meterIds = Array.from(
          new Set((scopeMeters ?? []).map((m: any) => m.id).filter(Boolean))
        );
        const meterToBuilding = new Map<string, string>();
        for (const m of scopeMeters ?? []) {
          meterToBuilding.set((m as any).id, (m as any).building_id);
        }

        if (!meterIds.length) {
          setRoll12ByBuildingId({});
          return;
        }

        const { data: bills, error } = await supabase
          .from("bills")
          .select("building_id, meter_id, period_start, period_end, total_cost")
          .in("meter_id", meterIds)
          .gte("period_end", since.toISOString().slice(0, 10));

        if (error) throw error;
        if (cancelled) return;

        // Build: building_id -> { last_bill_end, latest_month, rolling_12_cost, months_counted }
        const byBuilding: Record<string, any> = {};

        for (const bill of bills as any[] ?? []) {
          const bid = bill.building_id ?? meterToBuilding.get(bill.meter_id);
          if (!bid) continue;

          const bm = billMonthFromPeriod(bill.period_start, bill.period_end);
          if (!bm) continue;

          const key = monthKey(bm);
          const cost = Number(bill.total_cost ?? 0);

          if (!byBuilding[bid]) {
            byBuilding[bid] = {
              last_bill_end: bill.period_end ? new Date(bill.period_end).getTime() : 0,
              latest_month: bm.getTime(),
              monthly: {} as Record<string, number>,
            };
          }

          // Track last bill end + latest month
          const pe = bill.period_end ? new Date(bill.period_end).getTime() : 0;
          if (pe > byBuilding[bid].last_bill_end) byBuilding[bid].last_bill_end = pe;
          if (bm.getTime() > byBuilding[bid].latest_month) byBuilding[bid].latest_month = bm.getTime();

          // Sum cost into the month bucket
          byBuilding[bid].monthly[key] = (byBuilding[bid].monthly[key] ?? 0) + cost;
        }

        // Convert monthly buckets into rolling 12 sums
        const out: Record<string, any> = {};

        for (const [bid, info] of Object.entries(byBuilding)) {
          const latest = new Date(info.latest_month);

          let sum = 0;
          let monthsWithCost = 0;
          let monthsWithBills = 0;

          for (let i = 0; i < 12; i++) {
            const d = new Date(Date.UTC(latest.getUTCFullYear(), latest.getUTCMonth() - i, 1));
            const k = monthKey(d);
            const mCost = Number(info.monthly[k] ?? 0);
            if (Object.prototype.hasOwnProperty.call(info.monthly, k)) {
              monthsWithBills += 1;
            }
            if (mCost > 0) monthsWithCost += 1;
            sum += mCost;
          }

         const latestMonthKey = monthKey(new Date(info.latest_month));

// “Gaps” means at least 1 of last 12 months has no bill record.
const hasGaps = monthsWithBills < 12;

out[bid] = {
  rolling_12_cost: sum,
  months_counted: monthsWithBills,
  months_with_bills: monthsWithBills,
  months_with_cost: monthsWithCost,
  has_gaps: hasGaps,
  latest_month_key: latestMonthKey,
  last_bill_end: info.last_bill_end ? new Date(info.last_bill_end).toISOString() : null,
};

        }

        setRoll12ByBuildingId(out);
      } catch (e) {
        console.warn("[roll12] failed", e);
        setRoll12ByBuildingId({});
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orgId, buildings]);

const orgLatestMonthKey = useMemo(() => {
  const keys = Object.values(roll12ByBuildingId || {})
    .map((x: any) => x?.latest_month_key)
    .filter(Boolean) as string[];

  if (!keys.length) return null;

  // YYYY-MM strings sort correctly lexicographically
  return keys.sort().at(-1) ?? null;
}, [roll12ByBuildingId]);

function buildingStatusV2(buildingId: string, lastBillEndISO: string | null) {
  if (!lastBillEndISO) return "Upload Bills";

  const r = roll12ByBuildingId?.[buildingId];
  if (!r) return "Upload Bills";

  const behindOrg =
    orgLatestMonthKey && r.latest_month_key !== orgLatestMonthKey;

  const hasGaps = Boolean(r.has_gaps);

  return behindOrg || hasGaps ? "Upload Bills" : "Current";
}


  // Simple stats from live rows
  const stats = useMemo(() => {
    const total = buildings.length;
    let complete = 0;
    let missingData = 0;

    for (const b of buildings) {
      const status = buildingStatusV2(b.id, b.last_bill_end);

      if (status === "Current") complete += 1;
      else missingData += 1;
    }

    return { total, complete, missingData };
 }, [buildings, roll12ByBuildingId, orgLatestMonthKey]);


  // Filter + sort
  const filteredBuildings = useMemo(() => {
    let filtered = buildings.filter((building: any) => {
      const name = building.name?.toLowerCase() ?? "";
      const city = building.city?.toLowerCase() ?? "";
      const matchesSearch =
        name.includes(searchTerm.toLowerCase()) ||
        city.includes(searchTerm.toLowerCase());

      if (filterStatus === "schools") {
        return matchesSearch && schoolBuildingIds.has(String(building.id));
      }
      if (filterStatus === "complete") {
        return matchesSearch && buildingStatus(building.last_bill_end) === "Current";
      }
      if (filterStatus === "missing") {
        return matchesSearch && buildingStatusV2(building.id, building.last_bill_end) === "Upload Bills"
;
      }
      return matchesSearch;
    });

    filtered.sort((a: any, b: any) => {
      if (sortBy === "name") {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "cost") {
  const aCost = Number(roll12ByBuildingId?.[a.id]?.rolling_12_cost ?? 0);
  const bCost = Number(roll12ByBuildingId?.[b.id]?.rolling_12_cost ?? 0);
  return bCost - aCost;
}

      // gaps – placeholder for now until we track gap counts
      return 0;
    });

    return filtered;
}, [buildings, searchTerm, filterStatus, sortBy, roll12ByBuildingId, orgLatestMonthKey, schoolBuildingIds]);





  // PM meters handlers
  const PM_METERS_ENDPOINT = "/api/pm/sync-meters";

  async function handleDryRunMeters() {
    if (!orgId) {
      alert(
        "No orgId found on your account. Please sign out/in or contact an admin."
      );
      return;
    }
    try {
      setPmLoading(true);
      setPmError(null);
      setPmPreview(null);

      const res = await fetch(`${PM_METERS_ENDPOINT}?orgId=${orgId}&dry=1`);
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt}`);
      }
      const json = await res.json();
      const results = Array.isArray(json?.results)
        ? json.results
        : Array.isArray(json)
        ? json
        : [json];
      setPmPreview(results);
    } catch (e: any) {
      setPmError(e?.message || String(e));
    } finally {
      setPmLoading(false);
    }
  }

  async function handleCreateAllMeters() {
    if (!orgId) {
      alert(
        "No orgId found on your account. Please sign out/in or contact an admin."
      );
      return;
    }
    if (!window.confirm("Create all missing meters on Portfolio Manager?")) return;

    try {
      setPmLoading(true);
      setPmError(null);
      setPmPreview(null);

      const res = await fetch(`${PM_METERS_ENDPOINT}?orgId=${orgId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt}`);
      }
      const json = await res.json();
      const results = Array.isArray(json?.results)
        ? json.results
        : Array.isArray(json)
        ? json
        : [json];
      setPmPreview(results);
    } catch (e: any) {
      setPmError(e?.message || String(e));
    } finally {
      setPmLoading(false);
    }
  }

  // Top-level auth/org guards
  if (authLoading) {
    return <div className="p-8 text-gray-500">Loading…</div>;
  }
  if (!orgId) {
    return (
      <div className="p-8 text-gray-600">
        No organization found for your account.
      </div>
    );
  }

  // Main render
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
  <div>
    <h1 className="text-3xl font-bold text-gray-900 mb-2">Buildings</h1>
    <p className="text-gray-600">Manage and monitor all district buildings</p>
  </div>

  <div className="flex gap-2">
  <a
    href="/dashboard"
    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
  >
    Dashboard
  </a>

  <a
    href="/green-button"
    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
  >
    System Metrics
  </a>

  <a
    href="/admin"
    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
  >
    Admin
  </a>

  <a
    href="/buildings/new"
    className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
  >
    Add Building
  </a>
</div>

</div>


        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-sm text-gray-600">Total Buildings</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
            <div className="text-2xl font-bold text-gray-900">
              {stats.complete}
            </div>
            <div className="text-sm text-gray-600">Complete Data</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-red-500">
            <div className="text-2xl font-bold text-gray-900">
              {stats.missingData}
            </div>
            <div className="text-sm text-gray-600">Missing Data</div>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search buildings..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Filter Buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => setFilterStatus("schools")}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filterStatus === "schools"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Schools
              </button>
              <button
                onClick={() => setFilterStatus("all")}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filterStatus === "all"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterStatus("complete")}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filterStatus === "complete"
                    ? "bg-green-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Complete
              </button>
              <button
                onClick={() => setFilterStatus("missing")}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filterStatus === "missing"
                    ? "bg-red-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Missing Bills
              </button>
            </div>

            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e) =>
                setSortBy(e.target.value as "name" | "cost" | "gaps")
              }
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="name">Sort: A-Z</option>
              <option value="cost">Sort: Highest Cost</option>
              <option value="gaps">Sort: Most Gaps</option>
            </select>
          </div>
        </div>

        {/* Row-loading / error / empty states */}
        {rowsLoading && (
          <div className="p-4 text-gray-500">Loading buildings…</div>
        )}
        {rowsError && (
          <div className="p-4 text-red-600">Error: {rowsError}</div>
        )}
        {!rowsLoading && !rowsError && buildings.length === 0 && (
          <div className="p-4 text-gray-600">No buildings yet.</div>
        )}

              {/* Building Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredBuildings.map((building: any) => {
            const status = buildingStatusV2(building.id, building.last_bill_end);

            // kBTU history from all fuels (kWh, therms, MCF, MMBtu) via the sparkline view
            const kbtuHistory = sparklinesByBuildingId[building.id];

            const latestKbtuFromHistory =
              kbtuHistory && kbtuHistory.length
                ? kbtuHistory[kbtuHistory.length - 1]
                : 0;

            // Fallback if we don't have history yet: kWh → kBTU
            const latestKbtuFallback =
              typeof building.latest_kwh === "number"
                ? building.latest_kwh * 3.412
                : 0;

            // Prefer all-fuels history, otherwise fallback to kWh-based
            


const latestKbtu = latestKbtuFromHistory || latestKbtuFallback;

            const fallbackSparkValues = latestKbtu
              ? [
                  latestKbtu * 0.7,
                  latestKbtu * 0.9,
                  latestKbtu,
                  latestKbtu * 1.1,
                  latestKbtu * 0.95,
                ]
              : [1, 2, 1.5, 2.2, 1.8];

            // Sparkline prefers real kBTU history; otherwise uses synthetic kBTU pattern
            const sparkValues =
              kbtuHistory && kbtuHistory.length
                ? kbtuHistory
                : fallbackSparkValues;

            return (
              <div
                key={building.id}
                onClick={() => router.push(`/buildings/${building.id}`)}
                className={`bg-white rounded-lg shadow-md hover:shadow-xl transition-all cursor-pointer border-l-4 overflow-hidden ${
                  status === "Current"
                    ? "border-l-green-500"
                    : "border-l-amber-500"
                }`}
              >
                {/* Card Header */}
<div className="p-5 border-b border-gray-100">

  <div className="flex items-start gap-4">
    
    {/* Logo section on the left */}
    {building.mascot_url ? (
      <div className="flex-shrink-0">
        <img
          src={building.mascot_url}
          alt={`${building.name} mascot`}
          className="h-16 w-16 object-contain"
        />
      </div>
    ) : (
      <div className="flex-shrink-0 h-16 w-16 flex items-center justify-center border border-dashed border-gray-300 text-[10px] text-gray-400 rounded-md">
        No Logo
      </div>
    )}

    {/* Info section */}
    <div className="flex-1">
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-bold text-lg text-gray-900 leading-tight">
          {building.name}
        </h3>

        <span
          className={`px-2 py-1 rounded text-xs font-medium ${
            status === "Current"
              ? "bg-green-100 text-green-700"
              : "bg-amber-100 text-amber-700"
          }`}
        >
          {status}
        </span>
      </div>

      <p className="text-sm text-gray-600 mb-1">
        {building.city || "—"}
      </p>

      <div className="flex items-center gap-2">
        <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
          {building.square_feet
            ? `${building.square_feet.toLocaleString()} sq ft`
            : "Size unknown"}
        </span>
      </div>
    </div>

  </div>
</div>


                {/* Card Body */}
                <div className="p-5">
                  {/* Latest period & cost */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-700">
                        Latest Bill
                      </span>
                      {status === "Current" ? (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-red-500" />
                      )}
                    </div>
                    <div className="text-xs text-gray-600">
                      {building.last_bill_end
                        ? `Through ${new Date(
                            building.last_bill_end
                          ).toLocaleDateString()}`
                        : "No bills found"}
                    </div>
                  </div>

                  {/* Quick Metrics */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
  <div className="text-xs text-gray-600 mb-1">
    Rolling 12M Cost
  </div>

  <div className="text-lg font-bold text-gray-900">
    {roll12ByBuildingId?.[building.id]?.rolling_12_cost != null
      ? `$${Number(roll12ByBuildingId[building.id].rolling_12_cost).toFixed(0)}`
      : "—"}
  </div>

  <div className="text-[11px] text-gray-500 mt-1">
    {roll12ByBuildingId?.[building.id]?.months_counted != null
      ? `${roll12ByBuildingId[building.id].months_counted}/12 months`
      : ""}
  </div>
</div>


                    <div>
                      <div className="text-xs text-gray-600 mb-1">
                        Latest kBTU
                      </div>
                      <div className="text-lg font-bold text-gray-900 flex items-center gap-1">
                        {latestKbtu
                          ? `${latestKbtu.toFixed(0)} kBTU`
                          : "—"}
                        {getTrendIcon("flat")}
                      </div>
                    </div>
                  </div>

                  
                </div>
              </div>
            );
          })}
        </div>



        {/* PM Tools */}
        <div className="mt-10 bg-white rounded-lg shadow p-6 border border-gray-200 space-x-3">
          <button
            type="button"
            className="px-4 py-2 rounded-lg text-white bg-blue-600 hover:bg-blue-700 text-sm font-medium"
            onClick={() => {
              if (!orgId) {
                alert(
                  "No orgId found on your account. Please sign out/in or contact an admin."
                );
                return;
              }
              window.location.href = `/api/pm/export-properties-template?orgId=${orgId}`;
            }}
          >
            Export PM Template
          </button>

          <button
            type="button"
            className="px-4 py-2 rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 text-sm font-medium disabled:opacity-60"
            onClick={handleDryRunMeters}
            disabled={pmLoading}
          >
            {pmLoading ? "Syncing…" : "Sync Meters (Dry Run)"}
          </button>

          <button
            type="button"
            className="px-4 py-2 rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 text-sm font-medium disabled:opacity-60"
            onClick={handleCreateAllMeters}
            disabled={pmLoading}
          >
            {pmLoading ? "Creating…" : "Create All on PM"}
          </button>
        </div>

        {/* Live preview for PM */}
        <div className="mt-4">
          {pmError && (
            <div className="p-3 rounded border border-red-200 bg-red-50 text-red-800 text-sm">
              Error: {pmError}
            </div>
          )}

          {pmPreview && (() => {
            const arr = Array.isArray(pmPreview) ? pmPreview : [pmPreview];
            const inner = Array.isArray(arr[0]?.preview) ? arr[0].preview : arr;

            if (Array.isArray(inner) && inner.length === 0) {
              return (
                <div className="p-3 rounded border border-green-200 bg-green-50 text-green-800 text-sm">
                  <div className="font-semibold">
                    All set — no meters need creation.
                  </div>
                  <div className="text-green-900/80 mt-1">
                    Dry run returned 0 items to create.
                  </div>
                </div>
              );
            }

            return (
              <div className="p-3 rounded border border-blue-200 bg-blue-50 text-blue-900 text-sm">
                <div className="font-semibold mb-2">
                  Dry Run Preview{" "}
                  {Array.isArray(inner)
                    ? `(${inner.length} item${inner.length === 1 ? "" : "s"})`
                    : ""}
                </div>
                <pre className="whitespace-pre-wrap text-xs overflow-auto max-h-64">
                  {JSON.stringify(pmPreview, null, 2)}
                </pre>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
};

export default BuildingsPage;
