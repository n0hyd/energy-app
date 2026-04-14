import React, { useState } from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, ReferenceDot } from 'recharts';
import { TrendingUp, TrendingDown, Zap, DollarSign, Target } from 'lucide-react';
import { useEffect } from "react";
import { useSession, useSupabaseClient } from "@supabase/auth-helpers-react";
import Link from "next/link";

const NoWrapTick = ({ x, y, payload, format }) => {
  const raw = payload.value || "";
  const text = format ? format(raw) : raw;

  // Shorten long names
  const label = text.length > 18 ? text.slice(0, 17) + "…" : text;

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={-10}           // move 10px to the LEFT of the axis line
        y={0}
        dy={4}
        textAnchor="end"  // right-align the text to that x position
        style={{ fontSize: 11 }}
      >
        {label}
      </text>
    </g>
  );
};


function useAnnualCostMoMTrendFromLatest(
  orgId: string | null,
  buildingType: "k12" | "other" | "all"
) {

  const sb = useSupabaseClient();
  const [value, setValue] = React.useState<string>("$0");
  const [trend, setTrend] = React.useState<string>("—");
  const [isUp, setIsUp] = React.useState<boolean>(false);
  const [debug, setDebug] = React.useState<any>(null);

  const isoDate = (d: Date) => d.toISOString().slice(0, 10);

  React.useEffect(() => {
    if (!orgId) return;

    (async () => {
      try {
        setDebug({ step: "start", orgId });

        const { data: authData, error: authErr } = await sb.auth.getUser();
        if (authErr || !authData?.user) {
          setDebug({ step: "not-authenticated" });
          return;
        }

                let bldgQuery = sb
          .from("buildings")
          .select("id")
          .eq("org_id", orgId);

        if (buildingType === "k12") {
          bldgQuery = bldgQuery.eq("activity_code", "K-12 School");
        } else if (buildingType === "other") {
          bldgQuery = bldgQuery.neq("activity_code", "K-12 School");
        }

        const { data: bldgs, error: bErr } = await bldgQuery;


        if (bErr) throw bErr;
        const buildingIds = (bldgs || []).map((r: any) => r.id);
        if (!buildingIds.length) {
          setDebug({ step: "no-buildings", orgId });
          setValue("$0");
          setTrend("—");
          setIsUp(false);
          return;
        }

        const { data: latestRows, error: lErr } = await sb
          .from("bills")
          .select("period_start")
          .in("building_id", buildingIds)
          .not("period_start", "is", null)
          .order("period_start", { ascending: false })
          .limit(1);

        if (lErr) throw lErr;
        const latestStart = latestRows?.[0]?.period_start
          ? new Date(latestRows[0].period_start)
          : null;

        if (!latestStart) {
          setDebug({ step: "latest-check", orgId, latestStatus: { error: null, count: 0, sample: null } });
          setValue("$0");
          setTrend("—");
          setIsUp(false);
          return;
        }

        const currStart = new Date(latestStart.getFullYear(), latestStart.getMonth(), 1);
        const currEndExcl = new Date(latestStart.getFullYear(), latestStart.getMonth() + 1, 1);
        const prevStart = new Date(latestStart.getFullYear(), latestStart.getMonth() - 1, 1);
        const prevEndExcl = new Date(latestStart.getFullYear(), latestStart.getMonth(), 1);



        const { data: rangeRows, error: wErr } = await sb
          .from("bills")
          .select("id, total_cost, period_start, building_id")
          .in("building_id", buildingIds)
          .gte("period_start", isoDate(prevStart))
          .lt("period_start", isoDate(currEndExcl));

        if (wErr) throw wErr;

        const inMonth = (rows: any[], d0: Date, d1: Date) =>
          (rows || []).filter((r) => {
            const ps = r?.period_start ? new Date(r.period_start) : null;
            return ps && ps >= d0 && ps < d1;
          });

        const prevRows = inMonth(rangeRows || [], prevStart, prevEndExcl);
        const currRows = inMonth(rangeRows || [], currStart, currEndExcl);

        const sumCost = (rows: any[]) =>
          rows.reduce((acc, r) => acc + (typeof r.total_cost === "number" ? r.total_cost : 0), 0);

        const prevCost = sumCost(prevRows);
        const currCost = sumCost(currRows);

        const fmtMoney = (n: number) =>
          n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M`
          : n >= 1_000 ? `$${(n / 1_000).toFixed(1)}K`
          : `$${n.toFixed(0)}`;

        setValue(fmtMoney(currCost));

        if (prevCost > 0) {
          const deltaPct = ((currCost - prevCost) / prevCost) * 100;
          setTrend(`${Math.abs(deltaPct).toFixed(1)}%`);
          setIsUp(deltaPct <= 0 ? true : false); // green if down in cost
        } else {
          setTrend("—");
          setIsUp(false);
        }

        setDebug({
          step: "ok",
          orgId,
          latest: isoDate(latestStart),
          prevCost,
          currCost,
          counts: { prev: prevRows.length, curr: currRows.length },
        });
      } catch (e: any) {
        setValue("$0");
        setTrend("—");
        setTrend("â€”");
        setTrend("-");
        setIsUp(false);
        setDebug({ step: "exception", error: String(e) });
      }
    })();
   }, [orgId, sb, buildingType]);


  return { value, trend, isUp, debug };
}

// ---------------- Hook 2: District Avg ENERGY STAR Score ----------------
function useDistrictAvgEnergyStarScore(
  orgId: string | null,
  buildingType: "k12" | "other" | "all"
) {

  const sb = useSupabaseClient();
  const [value, setValue] = React.useState<string>("—");
  const [trend, setTrend] = React.useState<number | undefined>(undefined);
  const [isUp, setIsUp] = React.useState<boolean>(false);
  const [debug, setDebug] = React.useState<any>(null);

  React.useEffect(() => {
    if (!orgId) return;

    (async () => {
      try {
        // 1️⃣ Auth check
        const { data: authData, error: authErr } = await sb.auth.getUser();
        if (authErr || !authData?.user) {
          setDebug({ step: "not-authenticated" });
          return;
        }

               // 2️⃣ Get all pm_property_ids for this org (respect buildingType)
        let bldgQuery = sb
          .from("buildings")
          .select("pm_property_id")
          .eq("org_id", orgId)
          .not("pm_property_id", "is", null);

        if (buildingType === "k12") {
          bldgQuery = bldgQuery.eq("activity_code", "K-12 School");
        } else if (buildingType === "other") {
          bldgQuery = bldgQuery.neq("activity_code", "K-12 School");
        }

        const { data: buildings, error: bErr } = await bldgQuery;


        if (bErr) throw bErr;
        const propIds = (buildings ?? [])
          .map(b => b.pm_property_id)
          .filter(Boolean);

        if (!propIds.length) {
          setValue("—");
          setDebug({ step: "no-properties" });
          return;
        }

        // 3️⃣ Pull all non-null scores for those properties
        const { data: scores, error: sErr } = await sb
          .from("pm_property_scores_latest")
          .select("score")
          .in("pm_property_id", propIds)
          .not("score", "is", null);

        if (sErr) throw sErr;

        if (!scores?.length) {
          setValue("—");
          setDebug({ step: "no-scores" });
          return;
        }

        // 4️⃣ Compute average
        const numericScores = scores
          .map(r => Number(r.score))
          .filter(Number.isFinite);

        if (!numericScores.length) {
          setValue("—");
          setDebug({ step: "no-numeric-scores" });
          return;
        }

        const avg = numericScores.reduce((sum, s) => sum + s, 0) / numericScores.length;
        setValue(String(Math.round(avg)));

        // Optional: could compute trend later if you track historical averages
        setTrend(undefined);
        setIsUp(false);

        setDebug({
          step: "ok",
          count: numericScores.length,
          avg,
        });
      } catch (e: any) {
        setValue("—");
        setTrend(undefined);
        setIsUp(false);
        setDebug({ step: "exception", error: String(e) });
      }
    })();
}, [orgId, sb, buildingType]);


  return { value, trend, isUp, debug };
}

// end average energy star hook

// ---------------- Hook 3: District Avg EUI Score ----------------

function useDistrictAverageEUI(
  orgId: string | null,
  buildingType: "k12" | "other" | "all"
) {
  const sb = useSupabaseClient();
  const [value, setValue] = React.useState<string>("—");
  const [avg, setAvg] = React.useState<number | null>(null);
  const [debug, setDebug] = React.useState<any>({ step: "init" });
  const [nationalEui, setNationalEui] = React.useState<any | null>(null);


  useEffect(() => {
    if (!orgId) return;

    (async () => {
      try {
// 🔹 Load national EUI benchmark for K-12
const { data: nationalEuiRow } = await sb
  .from("national_eui")
  .select("*")
  .eq("activity_code", "K-12 School")
  .single();

setNationalEui(nationalEuiRow || null);

        

// 1️⃣ Buildings in this org that are linked to PM (respect buildingType)
        let bldgQuery = sb
          .from("buildings")
          .select("pm_property_id")
          .eq("org_id", orgId)
          .not("pm_property_id", "is", null);

        if (buildingType === "k12") {
          bldgQuery = bldgQuery.eq("activity_code", "K-12 School");
        } else if (buildingType === "other") {
          bldgQuery = bldgQuery.neq("activity_code", "K-12 School");
        }

        const { data: blds, error: bErr } = await bldgQuery;
        if (bErr) throw bErr;

        const propIds = (blds ?? [])
          .map((b: any) => b.pm_property_id)
          .filter(Boolean);

        if (!propIds.length) {
          setValue("—");
          setAvg(null);
          setDebug({ step: "no-properties" });
          return;
        }

        // 2️⃣ Weather-normalized EUI values for those PM properties
        const { data, error } = await sb
          .from("pm_property_scores")
          .select("site_eui_wn_kbtu_ft2, pm_property_id")
          .in("pm_property_id", propIds)
          .not("site_eui_wn_kbtu_ft2", "is", null);

        if (error) throw error;

        if (!data?.length) {
          setValue("—");
          setAvg(null);
          setDebug({ step: "no-valid-eui" });
          return;
        }

        const nums = data
          .map((r: any) => Number(r.site_eui_wn_kbtu_ft2))
          .filter((n) => Number.isFinite(n));

        if (!nums.length) {
          setValue("—");
          setAvg(null);
          setDebug({ step: "no-numeric-eui" });
          return;
        }

        const avgVal =
          nums.reduce((sum: number, n: number) => sum + n, 0) / nums.length;

        setAvg(avgVal);
        setValue(`${avgVal.toFixed(1)} kBtu/ft²`);
        setDebug({ step: "ok", count: nums.length, avg: avgVal, nationalEui: nationalEuiRow });

      } catch (e: any) {
        setValue("—");
        setAvg(null);
        setDebug({ step: "exception", error: String(e) });
      }
    })();
  }, [orgId, sb, buildingType]);

  return { value, avg, nationalEui, debug };

}

function useDistrictPmMetricMoM(
  orgId: string | null,
  buildingType: "k12" | "other" | "all",
  metricColumn: "score" | "site_eui_kbtu_ft2" | "site_eui_wn_kbtu_ft2",
  basis: "as_of" | "sync" = "as_of"
) {
  const sb = useSupabaseClient();
  const [current, setCurrent] = React.useState<number | null>(null);
  const [previous, setPrevious] = React.useState<number | null>(null);
  const [delta, setDelta] = React.useState<number | null>(null);
  const [deltaPct, setDeltaPct] = React.useState<number | null>(null);
  const [latestAsOf, setLatestAsOf] = React.useState<string | null>(null);
  const [previousAsOf, setPreviousAsOf] = React.useState<string | null>(null);
  const [debug, setDebug] = React.useState<any>({ step: "init" });

  React.useEffect(() => {
    if (!orgId) return;

    (async () => {
      try {
        let bldgQuery = sb
          .from("buildings")
          .select("pm_property_id")
          .eq("org_id", orgId)
          .not("pm_property_id", "is", null);

        if (buildingType === "k12") {
          bldgQuery = bldgQuery.eq("activity_code", "K-12 School");
        } else if (buildingType === "other") {
          bldgQuery = bldgQuery.neq("activity_code", "K-12 School");
        }

        const { data: buildings, error: bErr } = await bldgQuery;
        if (bErr) throw bErr;

        const propIds = (buildings ?? [])
          .map((b: any) => b.pm_property_id)
          .filter(Boolean);

        if (!propIds.length) {
          setCurrent(null);
          setPrevious(null);
          setDelta(null);
          setDeltaPct(null);
          setLatestAsOf(null);
          setPreviousAsOf(null);
          setDebug({ step: "no-properties" });
          return;
        }

        let latestDateStr: string | null = null;
        let prevDateStr: string | null = null;
        let latestVals: number[] = [];
        let prevVals: number[] = [];
        const normalizeMetricMonthKey = (isoLike: string | null) => {
          if (!isoLike) return null;
          const d = new Date(isoLike);
          if (Number.isNaN(d.getTime())) return null;
          return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
        };

        if (basis === "sync") {
          const { data: runRows, error: runErr } = await sb
            .from("pm_property_metric_snapshots")
            .select(`metric_as_of_date, ${metricColumn}`)
            .eq("org_id", orgId)
            .in("pm_property_id", propIds)
            .not(metricColumn, "is", null)
            .order("metric_as_of_date", { ascending: false });

          if (!runErr && runRows?.length) {
            const monthKeys = Array.from(
              new Set(
                runRows
                  .map((r: any) => normalizeMetricMonthKey(r.metric_as_of_date))
                  .filter(Boolean)
              )
            ).sort((a: any, b: any) => (a > b ? -1 : a < b ? 1 : 0));

            latestDateStr = (monthKeys[0] as string) ?? null;
            prevDateStr = (monthKeys[1] as string) ?? null;

            if (latestDateStr) {
              latestVals = (runRows ?? [])
                .filter((r: any) => normalizeMetricMonthKey(r.metric_as_of_date) === latestDateStr)
                .map((r: any) => Number(r[metricColumn]))
                .filter((n: number) => Number.isFinite(n));
            }
            if (prevDateStr) {
              prevVals = (runRows ?? [])
                .filter((r: any) => normalizeMetricMonthKey(r.metric_as_of_date) === prevDateStr)
                .map((r: any) => Number(r[metricColumn]))
                .filter((n: number) => Number.isFinite(n));
            }
          } else {
            // Fallback: use the metric month stored on pm_property_scores.
            const { data: createdRows, error: cErr } = await sb
              .from("pm_property_scores")
              .select(`as_of_date, ${metricColumn}`)
              .in("pm_property_id", propIds)
              .not(metricColumn, "is", null)
              .order("as_of_date", { ascending: false });

            if (cErr) throw cErr;

            const monthKeys = Array.from(
              new Set(
                (createdRows ?? [])
                  .map((r: any) => normalizeMetricMonthKey(r.as_of_date))
                  .filter(Boolean)
              )
            ).sort((a: any, b: any) => (a > b ? -1 : a < b ? 1 : 0));

            latestDateStr = (monthKeys[0] as string) ?? null;
            prevDateStr = (monthKeys[1] as string) ?? null;

            if (latestDateStr) {
              latestVals = (createdRows ?? [])
                .filter((r: any) => normalizeMetricMonthKey(r.as_of_date) === latestDateStr)
                .map((r: any) => Number(r[metricColumn]))
                .filter((n: number) => Number.isFinite(n));
            }
            if (prevDateStr) {
              prevVals = (createdRows ?? [])
                .filter((r: any) => normalizeMetricMonthKey(r.as_of_date) === prevDateStr)
                .map((r: any) => Number(r[metricColumn]))
                .filter((n: number) => Number.isFinite(n));
            }
          }
        } else {
          const { data: latestRows, error: lErr } = await sb
            .from("pm_property_scores")
            .select("as_of_date")
            .in("pm_property_id", propIds)
            .not(metricColumn, "is", null)
            .order("as_of_date", { ascending: false })
            .limit(1);

          if (lErr) throw lErr;

          latestDateStr = latestRows?.[0]?.as_of_date ?? null;
          if (latestDateStr) {
            const latestDate = new Date(`${latestDateStr}T00:00:00Z`);
            const prevDate = addMonths(latestDate, -1);
            prevDateStr = yyyyMm01(prevDate);
          }

          const { data: rows, error: rErr } = await sb
            .from("pm_property_scores")
            .select(`as_of_date, ${metricColumn}`)
            .in("pm_property_id", propIds)
            .in("as_of_date", [latestDateStr, prevDateStr].filter(Boolean) as string[])
            .not(metricColumn, "is", null);

          if (rErr) throw rErr;

          if (latestDateStr) {
            latestVals = (rows ?? [])
              .filter((r: any) => r.as_of_date === latestDateStr)
              .map((r: any) => Number(r[metricColumn]))
              .filter((n: number) => Number.isFinite(n));
          }
          if (prevDateStr) {
            prevVals = (rows ?? [])
              .filter((r: any) => r.as_of_date === prevDateStr)
              .map((r: any) => Number(r[metricColumn]))
              .filter((n: number) => Number.isFinite(n));
          }
        }

        if (!latestDateStr) {
          setCurrent(null);
          setPrevious(null);
          setDelta(null);
          setDeltaPct(null);
          setLatestAsOf(null);
          setPreviousAsOf(null);
          setDebug({ step: "no-latest-month", metricColumn, basis });
          return;
        }

        const avgOf = (arr: number[]) =>
          arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : null;

        const curAvg = avgOf(latestVals);
        const prevAvg = avgOf(prevVals);
        const d = curAvg != null && prevAvg != null ? curAvg - prevAvg : null;
        const p = d != null && prevAvg && prevAvg !== 0 ? (d / prevAvg) * 100 : null;

        setCurrent(curAvg);
        setPrevious(prevAvg);
        setDelta(d);
        setDeltaPct(p);
        setLatestAsOf(latestDateStr);
        setPreviousAsOf(prevDateStr);
        setDebug({
          step: "ok",
          metricColumn,
          basis,
          latestDateStr,
          prevDateStr,
          curCount: latestVals.length,
          prevCount: prevVals.length,
          curAvg,
          prevAvg,
          d,
          p,
        });
      } catch (e: any) {
        setCurrent(null);
        setPrevious(null);
        setDelta(null);
        setDeltaPct(null);
        setLatestAsOf(null);
        setPreviousAsOf(null);
        setDebug({ step: "exception", metricColumn, error: String(e) });
      }
    })();
  }, [orgId, sb, buildingType, metricColumn, basis]);

  return { current, previous, delta, deltaPct, latestAsOf, previousAsOf, debug };
}


// ----------------- Helpers (keep near the top of the file) -----------------
function yyyyMm01(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
function addMonths(d: Date, n: number) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  x.setUTCMonth(x.getUTCMonth() + n);
  return x;
}
// Pure helper: compute rolling 12-month windows
function rolling12Bounds() {
  const now = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)); // 1st of current month
  const lastFull = addMonths(now, -1);       // first of last full month
  const curStart = addMonths(lastFull, -11); // start of current 12-month window
  return {
    curStartStr: yyyyMm01(curStart),
    curEndStr:   yyyyMm01(now),
    prevStartStr: yyyyMm01(addMonths(curStart, -1)),
    prevEndStr:   yyyyMm01(addMonths(now, -1)),
  };
}

// Display formatter (optional)
function fmtMillionsKBtu(x: number) {
  const m = x / 1_000_000;
  return `${m.toFixed(1)} M kBtu`;
}

function gasMmbtuFromUsage(u: any): number | null {
  const mmbtu = Number(u?.usage_mmbtu);
  if (Number.isFinite(mmbtu)) return mmbtu;
  const therms = Number(u?.therms);
  if (Number.isFinite(therms)) return therms * 0.1; // 1 therm = 0.1 MMBtu
  const mcf = Number(u?.usage_mcf);
  if (Number.isFinite(mcf)) return mcf * 1.037; // approx MMBtu per MCF
  return null;
}

function billMonthFromPeriod(periodStartISO?: string | null, periodEndISO?: string | null): string | null {
  const start = periodStartISO ? new Date(periodStartISO) : null;
  const end = periodEndISO ? new Date(periodEndISO) : null;
  const hasStart = !!start && !Number.isNaN(start.getTime());
  const hasEnd = !!end && !Number.isNaN(end.getTime());

  if (hasStart && hasEnd) {
    const mid = new Date(start!.getTime() + (end!.getTime() - start!.getTime()) / 2);
    return `${mid.getUTCFullYear()}-${String(mid.getUTCMonth() + 1).padStart(2, "0")}-01`;
  }
  if (hasEnd) {
    const d = new Date(Date.UTC(end!.getUTCFullYear(), end!.getUTCMonth(), end!.getUTCDate()));
    d.setUTCDate(d.getUTCDate() - 1);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
  }
  if (hasStart) {
    return `${start!.getUTCFullYear()}-${String(start!.getUTCMonth() + 1).padStart(2, "0")}-01`;
  }
  return null;
}

function monthBoundsFromBillMonth(monthIso: string): { startIso: string; endIso: string } | null {
  const d = new Date(`${monthIso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return {
    startIso: start.toISOString().slice(0, 10),
    endIso: end.toISOString().slice(0, 10),
  };
}

function sumUsageRowsKBtu(rows: any[]): { kBtuElec: number; kBtuGas: number } {
  let kBtuElec = 0;
  const gasMaxByMonthMeter = new Map<string, number>();

  for (const r of rows ?? []) {
    const bill = Array.isArray(r?.bills) ? r.bills[0] : r?.bills;
    const meterId = String(bill?.meter_id ?? "");
    const monthIso = billMonthFromPeriod(bill?.period_start ?? null, bill?.period_end ?? null);

    const kwh = Number(r?.usage_kwh ?? 0);
    if (Number.isFinite(kwh) && monthIso) {
      kBtuElec += kwh * 3.412;
    }

    const gasMmbtu = gasMmbtuFromUsage(r);
    if (gasMmbtu == null || !monthIso || !meterId) continue;
    const key = `${monthIso}|${meterId}`;
    const prev = gasMaxByMonthMeter.get(key);
    if (prev == null || gasMmbtu > prev) {
      gasMaxByMonthMeter.set(key, gasMmbtu);
    }
  }

  let kBtuGas = 0;
  for (const v of gasMaxByMonthMeter.values()) {
    kBtuGas += v * 1000;
  }

  return { kBtuElec, kBtuGas };
}

// UUID filter helper
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const onlyUuids = (arr: any[]) =>
  (arr ?? [])
    .map((v) => (typeof v === "string" ? v : String(v ?? "")))
    .filter((v) => UUID_RX.test(v));

function normalizeBillMonthKey(raw: any): string | null {
  const txt = String(raw ?? "");
  if (!txt) return null;
  if (/^\d{4}-\d{2}$/.test(txt)) return `${txt}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(txt)) return `${txt.slice(0, 7)}-01`;
  const d = new Date(txt);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function monthKeyFromMonthlySpendRow(row: any): string | null {
  const monthText = String(row?.month ?? "").trim();
  const yearVal = Number(row?.year);
  if (!monthText || !Number.isFinite(yearVal)) return null;
  const fullYear = yearVal < 100 ? 2000 + yearVal : yearVal;
  const d = new Date(`${monthText} 1, ${fullYear}`);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function latestCompleteMonthFromMonthlySpendDebug(debug: any): string | null {
  const currentKeys = Array.isArray(debug?.currentKeys) ? debug.currentKeys : [];
  const skipped = new Set(Array.isArray(debug?.skippedIncompleteCurrentKeys) ? debug.skippedIncompleteCurrentKeys : []);
  for (let i = currentKeys.length - 1; i >= 0; i--) {
    const key = String(currentKeys[i] ?? "");
    if (key && !skipped.has(key)) return key;
  }
  const explicit = String(debug?.latestCompleteMonth ?? "");
  return explicit || null;
}

function shiftMonthKeyByYears(monthKey: string | null, yearDelta: number): string | null {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(monthKey ?? ""));
  if (!m) return null;
  const year = Number(m[1]) + yearDelta;
  return `${year}-${m[2]}-01`;
}

function currentUtcMonthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

async function getLatestCompleteBillMonth(
  sb: any,
  buildingIds: string[]
): Promise<{ latestCompleteMonth: string | null; source: string }> {
  const fuelFromMeter = (m: any): "electric" | "gas" => {
    const typeText = String(m?.type ?? "").toLowerCase();
    const utilityText = String(m?.utility ?? "").toLowerCase();
    const txt = `${typeText} ${utilityText}`;
    if (txt.includes("gas")) return "gas";
    return "electric";
  };

  const { data: meters, error: mErr } = await sb
    .from("meters")
    .select("id, type, utility")
    .in("building_id", buildingIds);
  if (mErr) throw mErr;

  const meterFuelById = new Map<string, "electric" | "gas">();
  for (const m of meters ?? []) {
    const fuel = fuelFromMeter(m);
    const meterId = String((m as any).id ?? "");
    if (!meterId) continue;
    meterFuelById.set(meterId, fuel);
  }

  const currentMonthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const currentMonthKey = currentUtcMonthKey();
  const monthFuelCoverage = new Map<string, { electric: boolean; gas: boolean }>();

  let billMonthsSource = "bill_months:building_id";
  let monthRows: any[] | null = null;
  let monthErr: any = null;

  {
    const q1 = await sb
      .from("bill_months")
      .select("bill_month, building_id, meter_id")
      .in("building_id", buildingIds)
      .not("bill_month", "is", null)
      .order("bill_month", { ascending: true });
    monthRows = (q1.data as any[]) ?? null;
    monthErr = q1.error;
  }

  if (monthErr) {
    const q2 = await sb
      .from("bill_months")
      .select("bill_month, meter_id")
      .not("bill_month", "is", null)
      .order("bill_month", { ascending: true });
    monthRows = (q2.data as any[]) ?? null;
    monthErr = q2.error;
    billMonthsSource = "bill_months:no-building-id";
  }

  if (!monthErr && monthRows?.length) {
    for (const row of monthRows) {
      const monthKey = normalizeBillMonthKey((row as any).bill_month);
      if (!monthKey || monthKey >= currentMonthKey) continue;
      const fuel = meterFuelById.get(String((row as any).meter_id ?? "")) ?? "electric";
      const coverage = monthFuelCoverage.get(monthKey) ?? { electric: false, gas: false };
      if (fuel === "electric") coverage.electric = true;
      if (fuel === "gas") coverage.gas = true;
      monthFuelCoverage.set(monthKey, coverage);
    }

    const latestCompleteMonth =
      Array.from(monthFuelCoverage.entries())
        .filter(([, c]) => c.electric && c.gas)
        .map(([m]) => m)
        .sort((a, b) => (a > b ? -1 : a < b ? 1 : 0))[0] ?? null;

    if (latestCompleteMonth) {
      return { latestCompleteMonth, source: billMonthsSource };
    }
  }

  const lookbackStart = addMonths(currentMonthStart, -48);
  const { data: recentBills, error: rbErr } = await sb
    .from("bills")
    .select("period_start, period_end, meter_id, building_id")
    .in("building_id", buildingIds)
    .not("period_end", "is", null)
    .gte("period_end", yyyyMm01(lookbackStart));
  if (rbErr) throw rbErr;

  for (const row of recentBills ?? []) {
    const monthKey = billMonthFromPeriod((row as any).period_start, (row as any).period_end);
    if (!monthKey || monthKey >= currentMonthKey) continue;
    const fuel = meterFuelById.get(String((row as any).meter_id ?? "")) ?? "electric";
    const coverage = monthFuelCoverage.get(monthKey) ?? { electric: false, gas: false };
    if (fuel === "electric") coverage.electric = true;
    if (fuel === "gas") coverage.gas = true;
    monthFuelCoverage.set(monthKey, coverage);
  }

  const latestCompleteMonth =
    Array.from(monthFuelCoverage.entries())
      .filter(([, c]) => c.electric && c.gas)
      .map(([m]) => m)
      .sort((a, b) => (a > b ? -1 : a < b ? 1 : 0))[0] ?? null;

  return { latestCompleteMonth, source: "bills" };
}

// ----------------- Hook -----------------
export function useTotalEnergyKBtuRolling(
  orgId: string | null,
  buildingType: "k12" | "other" | "all"
) {

  const sb = useSupabaseClient();
  const [value, setValue] = React.useState<string>("0.0 M kBtu");
  const [trend, setTrend] = React.useState<string>("—");
  const [isUp, setIsUp] = React.useState<boolean>(false);
  const [debug, setDebug] = React.useState<any>({ step: "init" });

  React.useEffect(() => {
  if (!orgId) return;

  (async () => {
    try { // [T0 open]

      // 1) Buildings for org (respect buildingType)
let bldgQuery = sb
  .from("buildings")
  .select("id")
  .eq("org_id", orgId);

if (buildingType === "k12") {
  bldgQuery = bldgQuery.eq("activity_code", "K-12 School");
} else if (buildingType === "other") {
  bldgQuery = bldgQuery.neq("activity_code", "K-12 School");
}

const { data: blds, error: bErr } = await bldgQuery;


      if (bErr) {
        setDebug({ step: "buildings-error", error: bErr.message });
        return;
      }

      const buildingIds = onlyUuids((blds ?? []).map((b: any) => b.id));
      if (buildingIds.length === 0) {
        setValue("0.0 M kBtu");
        setTrend("—");
        setIsUp(false);
        setDebug({ step: "no-buildings" });
        return;
      }

      const { latestCompleteMonth, source } = await getLatestCompleteBillMonth(sb, buildingIds);
      if (!latestCompleteMonth) {
        setValue("0.0 M kBtu");
        setTrend("â€”");
        setTrend("â€”");
        setIsUp(false);
        setTrend("-");
        setDebug({ step: "no-eligible-month", note: "No full month has both gas and electric bills." });
        return;
      }

      const anchorStart = new Date(`${latestCompleteMonth}T00:00:00Z`);
      const bounds = {
        curStartStr: yyyyMm01(addMonths(anchorStart, -11)),
        curEndStr: yyyyMm01(addMonths(anchorStart, 1)),
        prevStartStr: yyyyMm01(addMonths(anchorStart, -12)),
        prevEndStr: yyyyMm01(anchorStart),
        anchorMonth: latestCompleteMonth,
        anchorSource: source,
      };
      setDebug({ step: "bounds", bounds });

      // 2) Current window (JOIN w/ bills)
      let curKBtu = 0;
      { // [C0 open]
        const { data: curUsage, error: uErr } = await sb
          .from("usage_readings")
          .select(`
            usage_kwh,
            usage_mmbtu,
            therms,
            usage_mcf,
            bills!inner(
              period_start,
              period_end,
              building_id,
              meter_id
            )
          `)
          .gte("bills.period_end", bounds.curStartStr)
          .lt("bills.period_end", bounds.curEndStr)
          .in("bills.building_id", buildingIds);

        if (uErr) {
          setDebug({
            step: "usage-current-error",
            error: uErr.message,
            code: (uErr as any).code,
            details: (uErr as any).details,
          });
          return;
        }

       {
         const sums = sumUsageRowsKBtu(curUsage ?? []);
         curKBtu = sums.kBtuElec + sums.kBtuGas;
       }

        setDebug((d: any) => ({
  ...d,
  step: "usage-current-ok",
  curRows: curUsage?.length ?? 0,
}));
      } // [C0 close]

      // 3) Previous window (JOIN w/ bills)
      let prevKBtu = 0;
      { // [P0 open]
        const { data: prevUsage, error: puErr } = await sb
          .from("usage_readings")
          .select(`
            usage_kwh,
            usage_mmbtu,
            therms,
            usage_mcf,
            bills!inner(
              period_start,
              period_end,
              building_id,
              meter_id
            )
          `)
          .gte("bills.period_end", bounds.prevStartStr)
          .lt("bills.period_end", bounds.prevEndStr)
          .in("bills.building_id", buildingIds);

        if (puErr) {
          setDebug({
            step: "usage-prev-error",
            error: puErr.message,
            code: (puErr as any).code,
            details: (puErr as any).details,
          });
          return;
        }

        {
          const sums = sumUsageRowsKBtu(prevUsage ?? []);
          prevKBtu = sums.kBtuElec + sums.kBtuGas;
        }

        setDebug((d: any) => ({
          ...d,
          step: "usage-prev-ok",
          prevRows: prevUsage?.length ?? 0,
        }));
      } // [P0 close]




     // 4) Trend + display
const delta = curKBtu - prevKBtu;
const pct = prevKBtu > 0 ? (curKBtu / prevKBtu - 1) * 100 : 0;

setValue(fmtMillionsKBtu(curKBtu));
setTrend(`${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`);
setIsUp(pct > 0);

setDebug((d: any) => ({
  ...d,
  step: "done",
  curKBtu,
  prevKBtu,
  delta,
  pct,
  bounds,
  buildingCount: buildingIds.length,
}));

    } catch (e) { // [T0 catch] — if you still see an error here, the issue is above
      setValue("0.0 M kBtu");
      setTrend("—");
      setIsUp(false);
      setDebug({ step: "catch", error: (e as any)?.message || String(e) });
    }
    })();
}, [orgId, sb, buildingType]);


  return { value, trend, isUp, debug };
}






// END KBTU District KPI

function useAnnualTotalCostRolling(
  orgId: string | null,
  buildingType: "k12" | "other" | "all",
  latestCompleteMonthOverride?: string | null
) {
  const sb = useSupabaseClient();
  const [value, setValue] = React.useState<string>("$0");
  const [trend, setTrend] = React.useState<string>("—");
  const [isUp, setIsUp] = React.useState<boolean>(false);
  const [savingsSinceSep2025Vs2024, setSavingsSinceSep2025Vs2024] = React.useState<number | null>(null);
  const [electricSavingsSinceSep2025Vs2024, setElectricSavingsSinceSep2025Vs2024] = React.useState<number | null>(null);
  const [gasSavingsSinceSep2025Vs2024, setGasSavingsSinceSep2025Vs2024] = React.useState<number | null>(null);
  const [debug, setDebug] = React.useState<any>({ step: "init" });

  React.useEffect(() => {
    if (!orgId) return;

    (async () => {
      try {
        setDebug({ step: "start", orgId, buildingType });

        // 1) Buildings for this org, respecting buildingType
        let bldgQuery = sb.from("buildings").select("id").eq("org_id", orgId);

        if (buildingType === "k12") {
          bldgQuery = bldgQuery.eq("activity_code", "K-12 School");
        } else if (buildingType === "other") {
          bldgQuery = bldgQuery.neq("activity_code", "K-12 School");
        }

        const { data: blds, error: bErr } = await bldgQuery;
        if (bErr) throw bErr;

        const buildingIds = onlyUuids((blds ?? []).map((b: any) => b.id));
        if (!buildingIds.length) {
          setValue("$0");
          setTrend("—");
          setIsUp(false);
          setSavingsSinceSep2025Vs2024(null);
          setElectricSavingsSinceSep2025Vs2024(null);
          setGasSavingsSinceSep2025Vs2024(null);
          setDebug({ step: "no-buildings" });
          return;
        }

        const fuelFromMeter = (m: any): "electric" | "gas" | null => {
          const typeText = String(m?.type ?? "").toLowerCase();
          const utilityText = String(m?.utility ?? "").toLowerCase();
          const txt = `${typeText} ${utilityText}`;
          if (txt.includes("gas")) return "gas";
          if (txt.includes("electric")) return "electric";
          return null;
        };

        // 2) Determine the latest full month with BOTH electric and gas bills present
        const { data: meters, error: mErr } = await sb
          .from("meters")
          .select("id, type, utility")
          .in("building_id", buildingIds);
        if (mErr) throw mErr;

        const meterFuelById = new Map<string, "electric" | "gas">();
        for (const m of meters ?? []) {
          const fuel = fuelFromMeter(m);
          const meterId = String((m as any).id ?? "");
          if (!fuel || !meterId) continue;
          meterFuelById.set(meterId, fuel);
        }

        const currentMonthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
        const currentMonthKey = yyyyMm01(currentMonthStart);
        const lookbackStart = addMonths(currentMonthStart, -48);

        const { data: recentBills, error: rbErr } = await sb
          .from("bills")
          .select("period_start, period_end, meter_id, total_cost, building_id")
          .in("building_id", buildingIds)
          .not("period_end", "is", null)
          .gte("period_end", yyyyMm01(lookbackStart));
        if (rbErr) throw rbErr;

        const normalizedBills: Array<{ monthKey: string; totalCost: number; fuel: "electric" | "gas" | null }> = [];
        for (const row of recentBills ?? []) {
          const monthKey = billMonthFromPeriod((row as any).period_start, (row as any).period_end);
          if (!monthKey) continue;
          if (monthKey >= currentMonthKey) continue; // only full months before current month
          const totalCost = Number((row as any).total_cost ?? 0);
          if (!Number.isFinite(totalCost)) continue;

          const fuel = meterFuelById.get(String((row as any).meter_id ?? ""));
          normalizedBills.push({ monthKey, totalCost, fuel: fuel ?? null });
        }

        const helperAnchor = latestCompleteMonthOverride
          ? { latestCompleteMonth: latestCompleteMonthOverride, source: "monthlySpend" }
          : await getLatestCompleteBillMonth(sb, buildingIds);
        const { latestCompleteMonth: anchorMonth, source: anchorSource } = helperAnchor;
        if (!anchorMonth) {
          setValue("$0");
          setTrend("—");
          setIsUp(false);
          setSavingsSinceSep2025Vs2024(null);
          setElectricSavingsSinceSep2025Vs2024(null);
          setGasSavingsSinceSep2025Vs2024(null);
          setDebug({
            step: "no-eligible-month",
            note: "No full month has both gas and electric bills.",
          });
          return;
        }

        const anchorStart = new Date(`${anchorMonth}T00:00:00Z`);
        const endExclusiveStr = yyyyMm01(addMonths(anchorStart, 1));
        const bounds = {
          curStartStr: yyyyMm01(addMonths(anchorStart, -11)),
          curEndStr: endExclusiveStr,
          prevStartStr: yyyyMm01(addMonths(anchorStart, -12)),
          prevEndStr: yyyyMm01(anchorStart),
          anchorMonth,
          anchorSource,
        };

        const inWindow = (monthKey: string, startStr: string, endStr: string) =>
          monthKey >= startStr && monthKey < endStr;
        const sumWindowCostByMonth = (
          startStr: string,
          endStr: string,
          fuel?: "electric" | "gas"
        ) =>
          normalizedBills.reduce((acc, b) => {
            if (!inWindow(b.monthKey, startStr, endStr)) return acc;
            if (fuel && b.fuel !== fuel) return acc;
            return acc + b.totalCost;
          }, 0);
        const countWindowBillsByMonth = (startStr: string, endStr: string) =>
          normalizedBills.filter((b) => inWindow(b.monthKey, startStr, endStr)).length;

        const currCost = sumWindowCostByMonth(bounds.curStartStr, bounds.curEndStr);
        const prevCost = sumWindowCostByMonth(bounds.prevStartStr, bounds.prevEndStr);

        // Savings window: Sep 2025 -> latest full month vs Sep 2024 -> matching months
        const savingsCurrentStartStr = "2025-09-01";
        const savingsBaselineStartStr = "2024-09-01";
        const savingsCurrentEnd = new Date(`${bounds.curEndStr}T00:00:00Z`);
        const savingsBaselineEndStr = yyyyMm01(addMonths(savingsCurrentEnd, -12));

        let savingsTotal: number | null = null;
        let electricSavingsTotal: number | null = null;
        let gasSavingsTotal: number | null = null;

        if (bounds.curEndStr > savingsCurrentStartStr) {
          const currentWindowCost = sumWindowCostByMonth(savingsCurrentStartStr, bounds.curEndStr);
          const baselineWindowCost = sumWindowCostByMonth(savingsBaselineStartStr, savingsBaselineEndStr);
          const currentElectricCost = sumWindowCostByMonth(savingsCurrentStartStr, bounds.curEndStr, "electric");
          const baselineElectricCost = sumWindowCostByMonth(savingsBaselineStartStr, savingsBaselineEndStr, "electric");
          const currentGasCost = sumWindowCostByMonth(savingsCurrentStartStr, bounds.curEndStr, "gas");
          const baselineGasCost = sumWindowCostByMonth(savingsBaselineStartStr, savingsBaselineEndStr, "gas");

          savingsTotal = baselineWindowCost - currentWindowCost;
          electricSavingsTotal = baselineElectricCost - currentElectricCost;
          gasSavingsTotal = baselineGasCost - currentGasCost;
        }

        const fmtMoney = (n: number) =>
          n >= 1_000_000
            ? `$${(n / 1_000_000).toFixed(2)}M`
            : n >= 1_000
            ? `$${(n / 1_000).toFixed(1)}K`
            : `$${n.toFixed(0)}`;

        const pct =
          prevCost > 0 ? (currCost / prevCost - 1) * 100 : 0;

        setValue(fmtMoney(currCost));
        setTrend(`${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`);
        setIsUp(pct > 0);
        setSavingsSinceSep2025Vs2024(savingsTotal);
        setElectricSavingsSinceSep2025Vs2024(electricSavingsTotal);
        setGasSavingsSinceSep2025Vs2024(gasSavingsTotal);

        setDebug({
          step: "ok",
          bounds,
          currCost,
          prevCost,
          savingsSinceSep2025Vs2024: savingsTotal,
          electricSavingsSinceSep2025Vs2024: electricSavingsTotal,
          gasSavingsSinceSep2025Vs2024: gasSavingsTotal,
          savingsRange: {
            current: { start: savingsCurrentStartStr, endExclusive: bounds.curEndStr },
            baseline: { start: savingsBaselineStartStr, endExclusive: savingsBaselineEndStr },
          },
          counts: {
            curr: countWindowBillsByMonth(bounds.curStartStr, bounds.curEndStr),
            prev: countWindowBillsByMonth(bounds.prevStartStr, bounds.prevEndStr),
          },
        });
      } catch (e: any) {
        setValue("$0");
        setTrend("—");
        setIsUp(false);
        setSavingsSinceSep2025Vs2024(null);
        setElectricSavingsSinceSep2025Vs2024(null);
        setGasSavingsSinceSep2025Vs2024(null);
        setDebug({ step: "exception", error: String(e) });
      }
    })();
  }, [orgId, sb, buildingType, latestCompleteMonthOverride]);

  return {
    value,
    trend,
    isUp,
    savingsSinceSep2025Vs2024,
    electricSavingsSinceSep2025Vs2024,
    gasSavingsSinceSep2025Vs2024,
    debug,
  };
}

function useAnnualTotalCostRollingAligned(
  orgId: string | null,
  buildingType: "k12" | "other" | "all",
  latestCompleteMonthOverride?: string | null
) {
  const sb = useSupabaseClient();
  const [value, setValue] = React.useState<string>("$0");
  const [trend, setTrend] = React.useState<string>("â€”");
  const [isUp, setIsUp] = React.useState<boolean>(false);
  const [savingsSinceSep2025Vs2024, setSavingsSinceSep2025Vs2024] = React.useState<number | null>(null);
  const [electricSavingsSinceSep2025Vs2024, setElectricSavingsSinceSep2025Vs2024] = React.useState<number | null>(null);
  const [gasSavingsSinceSep2025Vs2024, setGasSavingsSinceSep2025Vs2024] = React.useState<number | null>(null);
  const [debug, setDebug] = React.useState<any>({ step: "init" });

  React.useEffect(() => {
    if (!orgId) return;

    (async () => {
      try {
        let bldgQuery = sb.from("buildings").select("id").eq("org_id", orgId);

        if (buildingType === "k12") {
          bldgQuery = bldgQuery.eq("activity_code", "K-12 School");
        } else if (buildingType === "other") {
          bldgQuery = bldgQuery.neq("activity_code", "K-12 School");
        }

        const { data: blds, error: bErr } = await bldgQuery;
        if (bErr) throw bErr;

        const buildingIds = onlyUuids((blds ?? []).map((b: any) => b.id));
        if (!buildingIds.length) {
          setValue("$0");
          setTrend("â€”");
          setIsUp(false);
          setSavingsSinceSep2025Vs2024(null);
          setElectricSavingsSinceSep2025Vs2024(null);
          setGasSavingsSinceSep2025Vs2024(null);
          setDebug({ step: "no-buildings" });
          return;
        }

        let normalizedBills: Array<{ monthKey: string; totalCost: number; fuel: "electric" | "gas" }> = [];
        let anchorSource = "monthlySpend";
        const currentMonthKey = currentUtcMonthKey();

        let monthRows: any[] | null = null;
        let monthErr: any = null;
        let billMonthsSource = "bill_months:building_id";

        {
          const q1 = await sb
            .from("bill_months")
            .select("bill_month, building_id, meter_id, total_cost")
            .in("building_id", buildingIds)
            .not("bill_month", "is", null)
            .order("bill_month", { ascending: true });
          monthRows = (q1.data as any[]) ?? null;
          monthErr = q1.error;
        }

        if (monthErr) {
          const q2 = await sb
            .from("bill_months")
            .select("bill_month, meter_id, total_cost")
            .not("bill_month", "is", null)
            .order("bill_month", { ascending: true });
          monthRows = (q2.data as any[]) ?? null;
          monthErr = q2.error;
          billMonthsSource = "bill_months:no-building-id";
        }

        if (!monthErr && monthRows?.length) {
          const meterIds = Array.from(
            new Set((monthRows as any[]).map((r) => r.meter_id).filter((id) => !!id))
          );
          const meterTypeById = new Map<string, string>();
          if (meterIds.length) {
            const { data: meters, error: mErr } = await sb
              .from("meters")
              .select("id, type")
              .in("id", meterIds);
            if (mErr) throw mErr;
            for (const m of meters ?? []) {
              meterTypeById.set((m as any).id, (m as any).type);
            }
          }

          for (const r of monthRows as any[]) {
            const monthKey = normalizeBillMonthKey(r.bill_month);
            if (!monthKey || monthKey >= currentMonthKey) continue;
            const totalCost = Number(r.total_cost ?? 0);
            if (!Number.isFinite(totalCost)) continue;
            const meterType = String(meterTypeById.get(r.meter_id) || "electric").toLowerCase();
            const fuel: "electric" | "gas" = meterType.includes("gas") ? "gas" : "electric";
            normalizedBills.push({ monthKey, totalCost, fuel });
          }
          anchorSource = billMonthsSource;
        } else {
          const fuelFromMeter = (m: any): "electric" | "gas" => {
            const txt = `${String(m?.type ?? "").toLowerCase()} ${String(m?.utility ?? "").toLowerCase()}`;
            if (txt.includes("gas")) return "gas";
            return "electric";
          };

          const { data: meters, error: mErr } = await sb
            .from("meters")
            .select("id, type, utility")
            .in("building_id", buildingIds);
          if (mErr) throw mErr;

          const meterFuelById = new Map<string, "electric" | "gas">();
          for (const m of meters ?? []) {
            const meterId = String((m as any).id ?? "");
            if (!meterId) continue;
            meterFuelById.set(meterId, fuelFromMeter(m));
          }

          const currentMonthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
          const currentMonthKey = yyyyMm01(currentMonthStart);
          const lookbackStart = addMonths(currentMonthStart, -48);

          const { data: recentBills, error: rbErr } = await sb
            .from("bills")
            .select("period_start, period_end, meter_id, total_cost, building_id")
            .in("building_id", buildingIds)
            .not("period_end", "is", null)
            .gte("period_end", yyyyMm01(lookbackStart));
          if (rbErr) throw rbErr;

          for (const row of recentBills ?? []) {
            const monthKey = billMonthFromPeriod((row as any).period_start, (row as any).period_end);
            if (!monthKey || monthKey >= currentMonthKey) continue;
            const totalCost = Number((row as any).total_cost ?? 0);
            if (!Number.isFinite(totalCost)) continue;
            const fuel = meterFuelById.get(String((row as any).meter_id ?? "")) ?? "electric";
            normalizedBills.push({ monthKey, totalCost, fuel });
          }
          anchorSource = "bills";
        }

        const anchorMonth =
          latestCompleteMonthOverride ??
          (() => {
            const monthFuelCoverage = new Map<string, { electric: boolean; gas: boolean }>();
            for (const row of normalizedBills) {
              const coverage = monthFuelCoverage.get(row.monthKey) ?? { electric: false, gas: false };
              if (row.fuel === "electric") coverage.electric = true;
              if (row.fuel === "gas") coverage.gas = true;
              monthFuelCoverage.set(row.monthKey, coverage);
            }
            return (
              Array.from(monthFuelCoverage.entries())
                .filter(([, c]) => c.electric && c.gas)
                .map(([m]) => m)
                .sort((a, b) => (a > b ? -1 : a < b ? 1 : 0))[0] ?? null
            );
          })();

        if (!anchorMonth) {
          setValue("$0");
          setTrend("â€”");
          setIsUp(false);
          setSavingsSinceSep2025Vs2024(null);
          setElectricSavingsSinceSep2025Vs2024(null);
          setGasSavingsSinceSep2025Vs2024(null);
          setDebug({ step: "no-eligible-month", normalizedBillCount: normalizedBills.length });
          return;
        }

        const anchorStart = new Date(`${anchorMonth}T00:00:00Z`);
        const bounds = {
          curStartStr: yyyyMm01(addMonths(anchorStart, -11)),
          curEndStr: yyyyMm01(addMonths(anchorStart, 1)),
          prevStartStr: yyyyMm01(addMonths(anchorStart, -12)),
          prevEndStr: yyyyMm01(anchorStart),
          anchorMonth,
          anchorSource,
          latestCompleteMonthOverride,
        };

        const inWindow = (monthKey: string, startStr: string, endStr: string) =>
          monthKey >= startStr && monthKey < endStr;

        const sumWindowCostByMonth = (startStr: string, endStr: string, fuel?: "electric" | "gas") =>
          normalizedBills.reduce((acc, b) => {
            if (!inWindow(b.monthKey, startStr, endStr)) return acc;
            if (fuel && b.fuel !== fuel) return acc;
            return acc + b.totalCost;
          }, 0);

        const currCost = sumWindowCostByMonth(bounds.curStartStr, bounds.curEndStr);
        const prevCost = sumWindowCostByMonth(bounds.prevStartStr, bounds.prevEndStr);

        const savingsCurrentStartStr = "2025-09-01";
        const savingsBaselineStartStr = "2024-09-01";
        const savingsCurrentEnd = new Date(`${bounds.curEndStr}T00:00:00Z`);
        const savingsBaselineEndStr = yyyyMm01(addMonths(savingsCurrentEnd, -12));

        let savingsTotal: number | null = null;
        let electricSavingsTotal: number | null = null;
        let gasSavingsTotal: number | null = null;

        if (bounds.curEndStr > savingsCurrentStartStr) {
          const currentWindowCost = sumWindowCostByMonth(savingsCurrentStartStr, bounds.curEndStr);
          const baselineWindowCost = sumWindowCostByMonth(savingsBaselineStartStr, savingsBaselineEndStr);
          const currentElectricCost = sumWindowCostByMonth(savingsCurrentStartStr, bounds.curEndStr, "electric");
          const baselineElectricCost = sumWindowCostByMonth(savingsBaselineStartStr, savingsBaselineEndStr, "electric");
          const currentGasCost = sumWindowCostByMonth(savingsCurrentStartStr, bounds.curEndStr, "gas");
          const baselineGasCost = sumWindowCostByMonth(savingsBaselineStartStr, savingsBaselineEndStr, "gas");

          savingsTotal = baselineWindowCost - currentWindowCost;
          electricSavingsTotal = baselineElectricCost - currentElectricCost;
          gasSavingsTotal = baselineGasCost - currentGasCost;
        }

        const fmtMoney = (n: number) =>
          n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `$${(n / 1_000).toFixed(1)}K` : `$${n.toFixed(0)}`;

        const pct = prevCost > 0 ? (currCost / prevCost - 1) * 100 : 0;

        setValue(fmtMoney(currCost));
        setTrend(`${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`);
        setIsUp(pct > 0);
        setSavingsSinceSep2025Vs2024(savingsTotal);
        setElectricSavingsSinceSep2025Vs2024(electricSavingsTotal);
        setGasSavingsSinceSep2025Vs2024(gasSavingsTotal);
        setDebug({
          step: "ok",
          bounds,
          currCost,
          prevCost,
          normalizedBillCount: normalizedBills.length,
          savingsRange: {
            current: { start: savingsCurrentStartStr, endExclusive: bounds.curEndStr },
            baseline: { start: savingsBaselineStartStr, endExclusive: savingsBaselineEndStr },
          },
        });
      } catch (e: any) {
        setValue("$0");
        setTrend("â€”");
        setIsUp(false);
        setSavingsSinceSep2025Vs2024(null);
        setElectricSavingsSinceSep2025Vs2024(null);
        setGasSavingsSinceSep2025Vs2024(null);
        setDebug({ step: "exception", error: String(e) });
      }
    })();
  }, [orgId, sb, buildingType, latestCompleteMonthOverride]);

  return {
    value,
    trend,
    isUp,
    savingsSinceSep2025Vs2024,
    electricSavingsSinceSep2025Vs2024,
    gasSavingsSinceSep2025Vs2024,
    debug,
  };
}

// ----------------- Hook: Monthly Total Spend -----------------
function useMonthlyTotalSpend(
  orgId: string | null,
  buildingType: "k12" | "other" | "all"
) {
  const sb = useSupabaseClient();
  const [data, setData] = React.useState<any[]>([]);
  const [debug, setDebug] = React.useState<any>({ step: "init" });

  React.useEffect(() => {
    if (!orgId) return;

    (async () => {
      try {
        // 1️⃣ Get all building IDs for this org (respect buildingType)
        let bldgQuery = sb
          .from("buildings")
          .select("id")
          .eq("org_id", orgId);

        if (buildingType === "k12") {
          bldgQuery = bldgQuery.eq("activity_code", "K-12 School");
        } else if (buildingType === "other") {
          bldgQuery = bldgQuery.neq("activity_code", "K-12 School");
        }

        const { data: blds, error: bErr } = await bldgQuery;
        if (bErr) throw bErr;

        const ids = blds?.map((b: any) => b.id) ?? [];
        if (!ids.length) {
          setData([]);
          setDebug({ step: "no-buildings" });
          return;
        }

        // Prefer pre-standardized monthly rollups from bill_months when available.
        // Fallback to raw bills below if bill_months isn't available in this environment.
        // Try bill_months with building filter first; if schema differs, retry without building_id.
        let billMonthsAttempt: any = null;
        let monthRows: any[] | null = null;
        let monthErr: any = null;
        let billMonthsSource = "bill_months:building_id";

        {
          const q1 = await sb
            .from("bill_months")
            .select("bill_month, building_id, meter_id, total_cost")
            .in("building_id", ids)
            .not("bill_month", "is", null)
            .order("bill_month", { ascending: true });
          monthRows = (q1.data as any[]) ?? null;
          monthErr = q1.error;
        }

        if (monthErr) {
          const q2 = await sb
            .from("bill_months")
            .select("bill_month, meter_id, total_cost")
            .not("bill_month", "is", null)
            .order("bill_month", { ascending: true });
          monthRows = (q2.data as any[]) ?? null;
          monthErr = q2.error;
          billMonthsSource = "bill_months:no-building-id";
        }

        if (!monthErr && monthRows?.length) {
          const monthly: Record<string, { electric: number; gas: number; total: number; hasElectric: boolean; hasGas: boolean }> = {};
          const currentMonthKey = currentUtcMonthKey();
          const meterIds = Array.from(
            new Set(
              (monthRows as any[])
                .map((r) => r.meter_id)
                .filter((id) => !!id)
            )
          );
          const meterTypeById = new Map<string, string>();
          if (meterIds.length) {
            const { data: meters, error: mErr } = await sb
              .from("meters")
              .select("id, type")
              .in("id", meterIds);
            if (mErr) throw mErr;
            for (const m of meters ?? []) {
              meterTypeById.set((m as any).id, (m as any).type);
            }
          }

          const normalizeMonthKey = (raw: any) => {
            const txt = String(raw ?? "");
            if (!txt) return null;
            if (/^\d{4}-\d{2}$/.test(txt)) {
              return `${txt}-01`;
            }
            if (/^\d{4}-\d{2}-\d{2}$/.test(txt)) {
              return `${txt.slice(0, 7)}-01`;
            }
            const d = new Date(txt);
            if (Number.isNaN(d.getTime())) return null;
            return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
          };

          for (const r of monthRows as any[]) {
            const month = normalizeMonthKey(r.bill_month);
            if (!month || month >= currentMonthKey) continue;

            const meterType = String(meterTypeById.get(r.meter_id) || "electric").toLowerCase();
            const isGas = meterType.includes("gas");
            const total = Number(r.total_cost ?? 0);

            if (!monthly[month]) {
              monthly[month] = { electric: 0, gas: 0, total: 0, hasElectric: false, hasGas: false };
            }
            if (isGas) {
              monthly[month].gas += Number.isFinite(total) ? total : 0;
              monthly[month].hasGas = true;
            } else {
              monthly[month].electric += Number.isFinite(total) ? total : 0;
              monthly[month].hasElectric = true;
            }
            monthly[month].total += Number.isFinite(total) ? total : 0;
          }

          const keys = Object.keys(monthly).sort((a, b) => (a > b ? 1 : a < b ? -1 : 0));
          if (!keys.length) {
            setData([]);
            setDebug({ step: "bill_months-empty-after-aggregate" });
            return;
          }

          type Row = {
            label: string;
            month: string;
            year: number;
            electricCost: number;
            gasCost: number;
            lastYearTotalCost: number;
          };

          const completeKeys = keys.filter((key) => {
            const bucket = monthly[key];
            return !!bucket && bucket.hasElectric && bucket.hasGas;
          });
          const selectedKeys = completeKeys.slice(-12);

          const result: Row[] = [];
          let latestCompleteMonth: string | null = selectedKeys[selectedKeys.length - 1] ?? null;
          const currentKeys: string[] = [...selectedKeys];
          const priorKeys: string[] = [];
          const missingPriorKeys: string[] = [];
          const skippedIncompleteCurrentKeys: string[] = keys.filter((key) => !selectedKeys.includes(key));
          const latestMonth = keys[keys.length - 1];
          for (const key of selectedKeys) {
            const d = new Date(`${key}T00:00:00Z`);
            const y = d.getUTCFullYear();
            const m = d.getUTCMonth() + 1;
            const priorKey = `${y - 1}-${String(m).padStart(2, "0")}-01`;
            const labelDate = new Date(y, m - 1, 1);
            const mShort = labelDate.toLocaleString("en-US", { month: "short" });
            const yy = String(labelDate.getFullYear()).slice(-2);

            const bucket = monthly[key] || { electric: 0, gas: 0, total: 0, hasElectric: false, hasGas: false };
            const prior = monthly[priorKey] || { electric: 0, gas: 0, total: 0 };
            priorKeys.push(priorKey);
            if (!monthly[priorKey]) missingPriorKeys.push(priorKey);

            result.push({
              label: `${mShort} '${yy}`,
              month: mShort,
              year: Number(yy),
              electricCost: Math.round(bucket.electric / 1000),
              gasCost: Math.round(bucket.gas / 1000),
              lastYearTotalCost: Math.round(prior.total / 1000),
            });
          }

          setData(result);
          setDebug({
            step: "ok",
            source: "bill_months",
            billMonthsSource,
            latestMonth,
            latestCompleteMonth,
            earliestMonth: keys[0] ?? null,
            availableKeySample: {
              first: keys.slice(0, 6),
              last: keys.slice(-6),
            },
            currentKeys,
            priorKeys,
            missingPriorKeys,
            skippedIncompleteCurrentKeys,
            currentStart: selectedKeys[0] ?? null,
            priorStart: result[0]
              ? (() => {
                  const d = new Date(`${latestMonth}T00:00:00Z`);
                  const s = new Date(Date.UTC(d.getUTCFullYear() - 1, d.getUTCMonth() - 11, 1));
                  return `${s.getUTCFullYear()}-${String(s.getUTCMonth() + 1).padStart(2, "0")}-01`;
                })()
              : null,
            count: result.length,
          });
          return;
        }
        billMonthsAttempt = {
          step: "bill_months-unavailable-or-empty",
          source: "bills-fallback",
          billMonthsSource,
          monthErr: monthErr ? String(monthErr.message ?? monthErr) : null,
          monthRowCount: monthRows?.length ?? 0,
        };
        setDebug(billMonthsAttempt);

        // 2️⃣ Find latest bill month (anchor the chart to real data)
const { data: latestRow, error: latestErr } = await sb
  .from("bills")
  .select("period_start, period_end")
  .in("building_id", ids)
  .not("period_end", "is", null)
  .order("period_end", { ascending: false })
  .limit(1)
  .single();

if (latestErr || !latestRow?.period_end) {
  setData([]);
  setDebug({ ...(billMonthsAttempt ?? {}), step: "no-latest-bill" });
  return;
}

const latestMonthIso = billMonthFromPeriod(latestRow.period_start ?? null, latestRow.period_end);
const latestBounds = latestMonthIso ? monthBoundsFromBillMonth(latestMonthIso) : null;
if (!latestMonthIso || !latestBounds) {
  setData([]);
  setDebug({ ...(billMonthsAttempt ?? {}), step: "no-latest-bill-month" });
  return;
}

// Last full month with data (exclusive upper bound)
const end = new Date(latestBounds.endIso);
const start = new Date(end.getFullYear(), end.getMonth() - 12, 1);
const startWithPriorYear = new Date(start.getFullYear() - 1, start.getMonth(), 1);

const startIso = start.toISOString().slice(0, 10);
const startWithPriorYearIso = startWithPriorYear.toISOString().slice(0, 10);


        // 3️⃣ Get all bills for current range plus prior-year comparison range
        const { data: bills, error } = await sb
          .from("bills")
          .select("id, period_start, period_end, total_cost, meter_id")
          .in("building_id", ids)
          .gte("period_end", startWithPriorYearIso)
          .order("period_end", { ascending: true });

        if (error) throw error;

        if (!bills || !bills.length) {
          setData([]);
          setDebug({ ...(billMonthsAttempt ?? {}), step: "no-bills" });
          return;
        }

        // 4️⃣ Load meter types so we know which bills are gas vs electric
        const meterIds = Array.from(
          new Set(
            (bills as any[])
              .map((b) => b.meter_id)
              .filter((id) => !!id)
          )
        );

        const { data: meters, error: mErr } = await sb
          .from("meters")
          .select("id, type")
          .in("id", meterIds);

        if (mErr) throw mErr;

        const meterTypeById = new Map<string, string>();
        for (const m of meters ?? []) {
          meterTypeById.set((m as any).id, (m as any).type);
        }

        // 5️⃣ Group costs by month and split into electric vs gas
        const monthly: Record<string, { electric: number; gas: number; total: number; hasElectric: boolean; hasGas: boolean }> = {};

        for (const b of bills as any[]) {
          const monthIso = billMonthFromPeriod(b.period_start ?? null, b.period_end ?? null);
          if (!monthIso) continue;
          if (monthIso < `${startWithPriorYearIso.slice(0, 7)}-01` || monthIso >= latestBounds.endIso) continue;
          const key = monthIso.slice(0, 7);

          const meterType = meterTypeById.get(b.meter_id) || "electric";
          const isGas = meterType === "gas"; // tweak if you have other gas types
          const total = Number(b.total_cost) || 0;

          if (!monthly[key]) {
            monthly[key] = { electric: 0, gas: 0, total: 0, hasElectric: false, hasGas: false };
          }

          if (isGas) {
            monthly[key].gas += total;
            monthly[key].hasGas = true;
          } else {
            monthly[key].electric += total;
            monthly[key].hasElectric = true;
          }
          monthly[key].total += total;
        }

        // 6️⃣ Build a complete 12-month timeline from start → end (oldest → newest)
        type Row = {
          label: string;
          month: string;
          year: number;
          electricCost: number; // $K
          gasCost: number;      // $K
          lastYearTotalCost: number; // $K
        };

        const completeKeys = Object.keys(monthly)
          .filter((key) => {
            const bucket = monthly[key];
            return !!bucket && bucket.hasElectric && bucket.hasGas;
          })
          .sort((a, b) => (a > b ? 1 : a < b ? -1 : 0))
          .slice(-12);
        const result: Row[] = [];
        let latestCompleteMonth: string | null =
          completeKeys.length ? `${completeKeys[completeKeys.length - 1]}-01` : null;
        const skippedIncompleteCurrentKeys: string[] = Object.keys(monthly).filter((key) => !completeKeys.includes(key));

        for (const key of completeKeys) {
          const d = new Date(`${key}-01T00:00:00Z`);
          const y = d.getUTCFullYear();
          const m = d.getUTCMonth() + 1;
          const priorKey = `${y - 1}-${String(m).padStart(2, "0")}`;
          const bucket = monthly[key] || { electric: 0, gas: 0, total: 0, hasElectric: false, hasGas: false };
          const prior = monthly[priorKey] || { electric: 0, gas: 0, total: 0 };
          const mShort = d.toLocaleString("en-US", { month: "short" });
          const yy = String(y).slice(-2);
          const label = `${mShort} ’${yy}`;

          result.push({
            label,
            month: mShort,
            year: Number(yy),
            electricCost: Math.round(bucket.electric / 1000),
            gasCost: Math.round(bucket.gas / 1000),
            lastYearTotalCost: Math.round(prior.total / 1000),
          });
        }

        setData(result);
        setDebug({
          ...(billMonthsAttempt ?? {}),
          step: "ok",
          source: "bills",
          count: result.length,
          latestCompleteMonth,
          skippedIncompleteCurrentKeys,
          window: { start: startIso, end: endIso, compareStart: startWithPriorYearIso },
        });
      } catch (e: any) {
        setData([]);
        setDebug({ step: "error", error: String(e) });
      }
    })();
  }, [orgId, sb, buildingType]);

  return { data, debug };
}

function useBuildingMonthlySpendYoYSinceSep2025(
  orgId: string | null,
  buildingType: "k12" | "other" | "all",
  currentEndExclusiveStr: string | null
) {
  const sb = useSupabaseClient();
  const [months, setMonths] = React.useState<Array<{ key: string; label: string; priorKey: string }>>([]);
  const [rows, setRows] = React.useState<any[]>([]);
  const [debug, setDebug] = React.useState<any>({ step: "init" });

  React.useEffect(() => {
    if (!orgId) return;

    (async () => {
      try {
        const currentStartStr = "2025-09-01";
        const fallbackEndExclusive = yyyyMm01(
          new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))
        );
        const endExclusiveStr =
          currentEndExclusiveStr && /^\d{4}-\d{2}-\d{2}$/.test(currentEndExclusiveStr)
            ? currentEndExclusiveStr
            : fallbackEndExclusive;

        if (endExclusiveStr <= currentStartStr) {
          setMonths([]);
          setRows([]);
          setDebug({ step: "empty-window", currentStartStr, endExclusiveStr });
          return;
        }

        let bldgQuery = sb
          .from("buildings")
          .select("id, name, activity_code")
          .eq("org_id", orgId);

        if (buildingType === "k12") {
          bldgQuery = bldgQuery.eq("activity_code", "K-12 School");
        } else if (buildingType === "other") {
          bldgQuery = bldgQuery.neq("activity_code", "K-12 School");
        }

        const { data: blds, error: bErr } = await bldgQuery;
        if (bErr) throw bErr;

        const buildings = (blds ?? []).map((b: any) => ({
          id: String(b.id),
          name: String(b.name ?? "Unnamed Building"),
        }));
        const buildingIds = buildings.map((b) => b.id);

        if (!buildingIds.length) {
          setMonths([]);
          setRows([]);
          setDebug({ step: "no-buildings" });
          return;
        }

        const { data: meters, error: mErr } = await sb
          .from("meters")
          .select("id, type, utility")
          .in("building_id", buildingIds);
        if (mErr) throw mErr;

        const meterFuelById = new Map<string, "electric" | "gas" | null>();
        for (const m of meters ?? []) {
          const typeText = String((m as any)?.type ?? "").toLowerCase();
          const utilityText = String((m as any)?.utility ?? "").toLowerCase();
          const text = `${typeText} ${utilityText}`;
          const fuel =
            text.includes("gas") ? "gas" : text.includes("electric") ? "electric" : null;
          meterFuelById.set(String((m as any).id), fuel);
        }

        const { data: bills, error: billErr } = await sb
          .from("bills")
          .select("building_id, meter_id, period_start, period_end, total_cost")
          .in("building_id", buildingIds)
          .not("period_end", "is", null)
          .gte("period_end", "2024-08-01");
        if (billErr) throw billErr;

        const costMap = new Map<string, number>();
        for (const b of bills ?? []) {
          const monthKey = billMonthFromPeriod((b as any).period_start, (b as any).period_end);
          if (!monthKey) continue;
          if (monthKey < "2024-09-01" || monthKey >= endExclusiveStr) continue;
          const fuel = meterFuelById.get(String((b as any).meter_id ?? ""));
          if (fuel !== "electric" && fuel !== "gas") continue;
          const buildingId = String((b as any).building_id ?? "");
          if (!buildingId) continue;
          const cost = Number((b as any).total_cost ?? 0);
          if (!Number.isFinite(cost)) continue;
          const key = `${buildingId}|${monthKey}|${fuel}`;
          costMap.set(key, (costMap.get(key) ?? 0) + cost);
        }

        const monthCols: Array<{ key: string; label: string; priorKey: string }> = [];
        for (
          let d = new Date(`${currentStartStr}T00:00:00Z`);
          yyyyMm01(d) < endExclusiveStr;
          d = addMonths(d, 1)
        ) {
          const key = yyyyMm01(d);
          const priorKey = yyyyMm01(addMonths(d, -12));
          const labelDate = new Date(d.getUTCFullYear(), d.getUTCMonth(), 1);
          const label = labelDate.toLocaleString("en-US", { month: "short", year: "2-digit" });
          monthCols.push({ key, label, priorKey });
        }

        const tableRows = [...buildings]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((b) => {
            const byMonth = monthCols.map((m) => {
              const elecCY = costMap.get(`${b.id}|${m.key}|electric`) ?? 0;
              const elecPY = costMap.get(`${b.id}|${m.priorKey}|electric`) ?? 0;
              const gasCY = costMap.get(`${b.id}|${m.key}|gas`) ?? 0;
              const gasPY = costMap.get(`${b.id}|${m.priorKey}|gas`) ?? 0;
              return {
                key: m.key,
                electric: { cy: elecCY, py: elecPY, delta: elecCY - elecPY },
                gas: { cy: gasCY, py: gasPY, delta: gasCY - gasPY },
              };
            });

            return {
              buildingId: b.id,
              name: b.name,
              byMonth,
            };
          });

        setMonths(monthCols);
        setRows(tableRows);
        setDebug({
          step: "ok",
          buildingCount: tableRows.length,
          monthCount: monthCols.length,
          currentStartStr,
          endExclusiveStr,
        });
      } catch (e: any) {
        setMonths([]);
        setRows([]);
        setDebug({ step: "error", error: String(e) });
      }
    })();
  }, [orgId, sb, buildingType, currentEndExclusiveStr]);

  return { months, rows, debug };
}

function useMonthlyAverageEui(
  orgId: string | null,
  buildingType: "k12" | "other" | "all"
) {
  const sb = useSupabaseClient();
  const [data, setData] = React.useState<
    Array<{ label: string; avgEui: number | null; lastYearAvgEui: number | null }>
  >([]);
  const [debug, setDebug] = React.useState<any>({ step: "init" });

  React.useEffect(() => {
    if (!orgId) return;

    (async () => {
      try {
        let bldgQuery = sb
          .from("buildings")
          .select("pm_property_id")
          .eq("org_id", orgId)
          .not("pm_property_id", "is", null);

        if (buildingType === "k12") {
          bldgQuery = bldgQuery.eq("activity_code", "K-12 School");
        } else if (buildingType === "other") {
          bldgQuery = bldgQuery.neq("activity_code", "K-12 School");
        }

        const { data: blds, error: bErr } = await bldgQuery;
        if (bErr) throw bErr;

        const propIds = (blds ?? [])
          .map((b: any) => b.pm_property_id)
          .filter(Boolean);

        if (!propIds.length) {
          setData([]);
          setDebug({ step: "no-properties" });
          return;
        }

        const normalizeMetricMonthKey = (isoLike: string | null) => {
          if (!isoLike) return null;
          const d = new Date(isoLike);
          if (Number.isNaN(d.getTime())) return null;
          return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
        };

        let sourceBasis: "metric_as_of_date" | "as_of_date" = "metric_as_of_date";
        let sourceRows: Array<{ metricMonth: string; value: number }> = [];

        const { data: snapRows, error: snapErr } = await sb
          .from("pm_property_metric_snapshots")
          .select("metric_as_of_date, site_eui_wn_kbtu_ft2")
          .eq("org_id", orgId)
          .in("pm_property_id", propIds)
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
          sourceBasis = "as_of_date";
          const { data: createdRows, error: cErr } = await sb
            .from("pm_property_scores")
            .select("as_of_date, site_eui_wn_kbtu_ft2")
            .in("pm_property_id", propIds)
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
          setData([]);
          setDebug({ step: "no-latest-eui-month", sourceBasis });
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

        setData(out);
        setDebug({
          step: "ok",
          latestAsOf,
          sourceBasis,
          range: {
            currentStart: yyyyMm01(currentStart),
            endExclusive: yyyyMm01(endExclusive),
            compareStart: yyyyMm01(compareStart),
          },
          count: out.length,
        });
      } catch (e: any) {
        setData([]);
        setDebug({ step: "error", error: String(e) });
      }
    })();
  }, [orgId, sb, buildingType]);

  return { data, debug };
}


// ----------------- Hook: Annual Cost per Square Foot by School -----------------
function useAnnualCostPerSqFt(
  orgId: string | null,
  buildingType: "k12" | "other" | "all"
) {
  const sb = useSupabaseClient();
  const [data, setData] = React.useState<any[]>([]);
  const [debug, setDebug] = React.useState<any>({ step: "init" });

  React.useEffect(() => {
    if (!orgId) return;
    (async () => {
      try {
        // 1️⃣ Get buildings for org (need id, name, and sq_ft, respect buildingType)
        let bldgQuery = sb
          .from("buildings")
          .select("id, name, square_feet")
          .eq("org_id", orgId)
          .not("square_feet", "is", null);

        if (buildingType === "k12") {
          bldgQuery = bldgQuery.eq("activity_code", "K-12 School");
        } else if (buildingType === "other") {
          bldgQuery = bldgQuery.neq("activity_code", "K-12 School");
        }

        const { data: blds, error: bErr } = await bldgQuery;
        if (bErr) throw bErr;

        if (!blds?.length) {
          setData([]);
          setDebug({ step: "no-buildings" });
          return;
        }

        const ids = blds.map((b) => b.id);

        // 2️⃣ Anchor rolling window to latest bill period_end (not "today")
        const { data: latestRow, error: latestErr } = await sb
          .from("bills")
          .select("period_start, period_end")
          .in("building_id", ids)
          .not("period_end", "is", null)
          .order("period_end", { ascending: false })
          .limit(1)
          .single();

        if (latestErr || !latestRow?.period_end) {
          setData([]);
          setDebug({ step: "no-latest-bill" });
          return;
        }

        const latestMonthIso = billMonthFromPeriod(latestRow.period_start ?? null, latestRow.period_end);
        const latestBounds = latestMonthIso ? monthBoundsFromBillMonth(latestMonthIso) : null;
        if (!latestMonthIso || !latestBounds) {
          setData([]);
          setDebug({ step: "no-latest-bill-month" });
          return;
        }

        // end = first day of month AFTER latest period_end (exclusive upper bound)
        const end = new Date(latestBounds.endIso);
        const start = new Date(end.getFullYear(), end.getMonth() - 12, 1);

        const startIso = start.toISOString().slice(0, 10);

        // 3️⃣ Get bills in that window using period_end
        const { data: bills, error: billErr } = await sb
          .from("bills")
          .select("building_id, total_cost, period_start, period_end")
          .in("building_id", ids)
          .not("period_end", "is", null)
          .gte("period_end", startIso);

        if (billErr) throw billErr;

        // 4️⃣ Sum costs per building for the period
        const totals: Record<string, number> = {};
        for (const b of bills ?? []) {
          const monthIso = billMonthFromPeriod((b as any).period_start ?? null, (b as any).period_end ?? null);
          if (!monthIso || monthIso < startIso || monthIso >= latestBounds.endIso) continue;
          totals[b.building_id] =
            (totals[b.building_id] || 0) + (Number(b.total_cost) || 0);
        }

        // 4b️⃣ Baseline annual $/sf for Sep 2024 through Aug 2025
        const baselineStart = "2024-09-01";
        const baselineEndExclusive = "2025-09-01";
        const { data: baselineRows, error: baselineErr } = await sb
          .from("bill_months")
          .select("building_id, total_cost")
          .in("building_id", ids)
          .gte("bill_month", baselineStart)
          .lt("bill_month", baselineEndExclusive);
        if (baselineErr) throw baselineErr;

        const baselineTotals: Record<string, number> = {};
        for (const r of baselineRows ?? []) {
          baselineTotals[r.building_id] =
            (baselineTotals[r.building_id] || 0) + (Number(r.total_cost) || 0);
        }

        // 5️⃣ Calculate cost per square foot
        const rows = blds.map((b) => {
          const totalCost = totals[b.id] || 0;
          const costPerSF = b.square_feet ? totalCost / b.square_feet : 0;
          const baselineTotal = baselineTotals[b.id] || 0;
          const baselineCostPerSF = b.square_feet ? baselineTotal / b.square_feet : null;
          return {
            id: b.id,
            name: b.name,
            costPerSF: Number(costPerSF.toFixed(2)),
            baselineCostPerSF:
              baselineCostPerSF == null || !Number.isFinite(baselineCostPerSF)
                ? null
                : Number(baselineCostPerSF.toFixed(2)),
          };
        });

        setData(rows.sort((a, b) => b.costPerSF - a.costPerSF));
        setDebug({
          step: "ok",
          count: rows.length,
          window: { start: startIso, end: latestBounds.endIso, latest: latestMonthIso },
          billCount: bills?.length ?? 0,
          baselineWindow: { start: baselineStart, endExclusive: baselineEndExclusive },
          baselineCount: baselineRows?.length ?? 0,
        });
      } catch (e: any) {
        setData([]);
        setDebug({ step: "error", error: String(e) });
      }
    })();
  }, [orgId, sb, buildingType]);

  return { data, debug };
}

// ----------------- Hook: ENERGY STAR Score by School -----------------
function useEnergyStarScoreBySchool(
  orgId: string | null,
  buildingType: "k12" | "other" | "all"
) {
  const sb = useSupabaseClient();
  const [data, setData] = React.useState<any[]>([]);
  const [debug, setDebug] = React.useState<any>({ step: "init" });

  React.useEffect(() => {
    if (!orgId) return;
    (async () => {
      try {
        // 1️⃣ Get buildings for this org (need name + pm_property_id, respect buildingType)
        let bldgQuery = sb
          .from("buildings")
          .select("name, pm_property_id, square_feet, id")
          .eq("org_id", orgId)
          .not("pm_property_id", "is", null);

        if (buildingType === "k12") {
          bldgQuery = bldgQuery.eq("activity_code", "K-12 School");
        } else if (buildingType === "other") {
          bldgQuery = bldgQuery.neq("activity_code", "K-12 School");
        }

        const { data: blds, error: bErr } = await bldgQuery;

        if (bErr) throw bErr;
        if (!blds?.length) {
          setData([]);
          setDebug({ step: "no-buildings" });
          return;
        }

        const propIds = blds.map((b) => b.pm_property_id).filter(Boolean);

        // 2️⃣ Join to pm_property_scores table
        const { data: scores, error: sErr } = await sb
         .from("pm_property_scores_latest")
          .select("pm_property_id, score, site_eui_kbtu_ft2")
          .in("pm_property_id", propIds)
          .not("score", "is", null);

        if (sErr) throw sErr;

        // 3️⃣ Merge building info + score + EUI
const rows = blds.map((b) => {
  const found = scores.find((s) => s.pm_property_id === b.pm_property_id);
  return {
    id: b.id,
    name: b.name,
    score: found?.score ?? null,
    eui: found?.site_eui_kbtu_ft2 ?? null,
    square_feet: b.square_feet,
  };
});


        // 4️⃣ Filter out missing scores and sort high → low
        const filtered = rows
          .filter((r) => r.score !== null)
          .sort((a, b) => b.score - a.score);

        setData(filtered);
        setDebug({ step: "ok", count: filtered.length });
      } catch (e: any) {
        setData([]);
        setDebug({ step: "error", error: String(e) });
      }
    })();
  }, [orgId, sb, buildingType]);

  return { data, debug };
}


// ----------------- Hook: Monthly Energy Consumption Trend (last 12 full months) -----------------
function useMonthlyEnergyTrend(
  orgId: string | null,
  buildingType: "k12" | "other" | "all"
) {
  const sb = useSupabaseClient();
  const [data, setData] = React.useState<
    { label: string; electricity: number; gas: number; totalEnergy: number; lastYearTotalEnergy: number }[]
  >([]);
  const [debug, setDebug] = React.useState<any>({ step: "init" });

  React.useEffect(() => {
    if (!orgId) return;

    (async () => {
      try {
                // 1) Buildings in org (respect buildingType)
        let bldgQuery = sb
          .from("buildings")
          .select("id")
          .eq("org_id", orgId);

        if (buildingType === "k12") {
          bldgQuery = bldgQuery.eq("activity_code", "K-12 School");
        } else if (buildingType === "other") {
          bldgQuery = bldgQuery.neq("activity_code", "K-12 School");
        }

        const { data: blds, error: bErr } = await bldgQuery;

        if (bErr) throw bErr;

        const ids = (blds ?? []).map(b => b.id);
        if (!ids.length) {
          setData([]);
          setDebug({ step: "no-buildings" });
          return;
        }

        // 2️⃣ Find latest bill month (anchor to real data)
const { data: latestRow, error: latestErr } = await sb
  .from("bills")
  .select("period_start, period_end")
  .in("building_id", ids)
  .not("period_end", "is", null)
  .order("period_end", { ascending: false })
  .limit(1)
  .single();

if (latestErr || !latestRow?.period_end) {
  setData([]);
  setDebug({ step: "no-latest-bill" });
  return;
}

const latestMonthIso = billMonthFromPeriod(latestRow.period_start ?? null, latestRow.period_end);
const latestBounds = latestMonthIso ? monthBoundsFromBillMonth(latestMonthIso) : null;
if (!latestMonthIso || !latestBounds) {
  setData([]);
  setDebug({ step: "no-latest-bill-month" });
  return;
}

// Last full month with data (exclusive end)
const end = new Date(latestBounds.endIso);
const start = new Date(end.getFullYear(), end.getMonth() - 12, 1);
const compareStart = new Date(start.getFullYear(), start.getMonth() - 12, 1);


        // 3) Pull usage joined to bills for the range
        const { data: rows, error: uErr } = await sb
          .from("usage_readings")
          .select(`
            usage_kwh,
            usage_mmbtu,
            therms,
            usage_mcf,
            bills!inner(
              period_start,
              period_end,
              building_id,
              meter_id
            )
          `)
          .gte("bills.period_end", compareStart.toISOString().slice(0,10))
          .in("bills.building_id", ids);

        if (uErr) throw uErr;

        // 4) Group by YYYY-MM; convert to kBtu
        const monthly: Record<string, { elec: number; gas: number; date: Date }> = {};
        const gasMaxByMonthMeter = new Map<string, number>();
        for (const r of rows ?? []) {
          const bill = Array.isArray((r as any).bills) ? (r as any).bills[0] : (r as any).bills;
          const monthIso = billMonthFromPeriod(bill?.period_start ?? null, bill?.period_end ?? null);
          if (!monthIso) continue;
          if (monthIso < compareStart.toISOString().slice(0, 10) || monthIso >= latestBounds.endIso) continue;
          const d = new Date(`${monthIso}T00:00:00Z`);
          const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

          const kBtuElec = Number(r.usage_kwh ?? 0) * 3.412;
          const gasMmbtu = gasMmbtuFromUsage(r);
          const meterId = String(bill?.meter_id ?? "");

          if (!monthly[ym]) monthly[ym] = { elec: 0, gas: 0, date: new Date(d.getFullYear(), d.getMonth(), 1) };
          monthly[ym].elec += Number.isFinite(kBtuElec) ? kBtuElec : 0;

          if (gasMmbtu != null && meterId) {
            const key = `${monthIso}|${meterId}`;
            const prev = gasMaxByMonthMeter.get(key);
            if (prev == null || gasMmbtu > prev) {
              gasMaxByMonthMeter.set(key, gasMmbtu);
            }
          }
        }

        for (const [key, maxMmbtu] of gasMaxByMonthMeter.entries()) {
          const monthIso = key.slice(0, 10);
          const ym = monthIso.slice(0, 7);
          const d = new Date(`${monthIso}T00:00:00Z`);
          if (!monthly[ym]) monthly[ym] = { elec: 0, gas: 0, date: new Date(d.getUTCFullYear(), d.getUTCMonth(), 1) };
          monthly[ym].gas += maxMmbtu * 1000;
        }

        // 5) Build a complete 12-month sequence (oldest -> newest), fill zeros if missing
        const result: Array<{
          label: string;
          electricity: number;
          gas: number;
          totalEnergy: number;
          lastYearTotalEnergy: number;
        }> = [];
        for (let i = 0; i < 12; i++) {
  const d = new Date(start.getFullYear(), start.getMonth() + i, 1);

          const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,"0")}`;
          const priorYm = `${d.getFullYear() - 1}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          const m = monthly[ym];
          const prior = monthly[priorYm];
          const mShort = d.toLocaleString("en-US", { month: "short" });
          const yy = String(d.getFullYear()).slice(-2);

          // store values in *thousands* of kBtu to match chart label easily
          const electricity = m ? Math.round(m.elec / 1000) : 0;
          const gas = m ? Math.round(m.gas / 1000) : 0;
          const totalEnergy = electricity + gas;
          const lastYearTotalEnergy = prior ? Math.round((prior.elec + prior.gas) / 1000) : 0;

          result.push({ label: `${mShort} ’${yy}`, electricity, gas, totalEnergy, lastYearTotalEnergy });
        }

        setData(result);
        setDebug({ step: "ok", count: result.length });
      } catch (e: any) {
        setData([]);
        setDebug({ step: "error", error: String(e) });
      }
    })();
 }, [orgId, sb, buildingType]);


  return { data, debug };
}

function useMonthlyEnergyTrendCompleteMonthsOnly(
  orgId: string | null,
  buildingType: "k12" | "other" | "all"
) {
  const sb = useSupabaseClient();
  const [data, setData] = React.useState<
    { label: string; electricity: number; gas: number; totalEnergy: number; lastYearTotalEnergy: number }[]
  >([]);
  const [debug, setDebug] = React.useState<any>({ step: "init" });

  React.useEffect(() => {
    if (!orgId) return;

    (async () => {
      try {
        let bldgQuery = sb
          .from("buildings")
          .select("id")
          .eq("org_id", orgId);

        if (buildingType === "k12") {
          bldgQuery = bldgQuery.eq("activity_code", "K-12 School");
        } else if (buildingType === "other") {
          bldgQuery = bldgQuery.neq("activity_code", "K-12 School");
        }

        const { data: blds, error: bErr } = await bldgQuery;
        if (bErr) throw bErr;

        const ids = (blds ?? []).map((b) => b.id);
        if (!ids.length) {
          setData([]);
          setDebug({ step: "no-buildings" });
          return;
        }

        let billMonthsAttempt: any = null;
        let monthRows: any[] | null = null;
        let monthErr: any = null;
        let billMonthsSource = "bill_months:building_id";
        let latestMonth: string | null = null;
        let currentKeys: string[] = [];
        let skippedIncompleteCurrentKeys: string[] = [];
        const completeMonths = new Set<string>();

        {
          const q1 = await sb
            .from("bill_months")
            .select("bill_month, building_id, meter_id, total_cost")
            .in("building_id", ids)
            .not("bill_month", "is", null)
            .order("bill_month", { ascending: true });
          monthRows = (q1.data as any[]) ?? null;
          monthErr = q1.error;
        }

        if (monthErr) {
          const q2 = await sb
            .from("bill_months")
            .select("bill_month, meter_id, total_cost")
            .not("bill_month", "is", null)
            .order("bill_month", { ascending: true });
          monthRows = (q2.data as any[]) ?? null;
          monthErr = q2.error;
          billMonthsSource = "bill_months:no-building-id";
        }

        if (!monthErr && monthRows?.length) {
          const monthlyCoverage: Record<string, { hasElectric: boolean; hasGas: boolean }> = {};
          const currentMonthKey = currentUtcMonthKey();
          const meterIds = Array.from(
            new Set((monthRows as any[]).map((r) => r.meter_id).filter((id) => !!id))
          );
          const meterTypeById = new Map<string, string>();
          if (meterIds.length) {
            const { data: meters, error: mErr } = await sb
              .from("meters")
              .select("id, type")
              .in("id", meterIds);
            if (mErr) throw mErr;
            for (const m of meters ?? []) {
              meterTypeById.set((m as any).id, (m as any).type);
            }
          }

          const normalizeMonthKey = (raw: any) => {
            const txt = String(raw ?? "");
            if (!txt) return null;
            if (/^\d{4}-\d{2}$/.test(txt)) return `${txt}-01`;
            if (/^\d{4}-\d{2}-\d{2}$/.test(txt)) return `${txt.slice(0, 7)}-01`;
            const d = new Date(txt);
            if (Number.isNaN(d.getTime())) return null;
            return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
          };

          for (const r of monthRows as any[]) {
            const month = normalizeMonthKey(r.bill_month);
            if (!month || month >= currentMonthKey) continue;

            const meterType = String(meterTypeById.get(r.meter_id) || "electric").toLowerCase();
            const isGas = meterType.includes("gas");

            if (!monthlyCoverage[month]) {
              monthlyCoverage[month] = { hasElectric: false, hasGas: false };
            }
            if (isGas) {
              monthlyCoverage[month].hasGas = true;
            } else {
              monthlyCoverage[month].hasElectric = true;
            }
          }

          const keys = Object.keys(monthlyCoverage).sort((a, b) => (a > b ? 1 : a < b ? -1 : 0));
          latestMonth = keys[keys.length - 1] ?? null;

          if (latestMonth) {
            currentKeys = [...keys];
            for (const key of keys) {
              const bucket = monthlyCoverage[key] || { hasElectric: false, hasGas: false };
              if (bucket.hasElectric && bucket.hasGas) {
                completeMonths.add(key);
              } else {
                skippedIncompleteCurrentKeys.push(key);
              }
            }
          }
        } else {
          billMonthsAttempt = {
            step: "bill_months-unavailable-or-empty",
            source: "bills-fallback",
            billMonthsSource,
            monthErr: monthErr ? String(monthErr.message ?? monthErr) : null,
            monthRowCount: monthRows?.length ?? 0,
          };
        }

        if (!latestMonth) {
          const { data: latestRow, error: latestErr } = await sb
            .from("bills")
            .select("period_start, period_end")
            .in("building_id", ids)
            .not("period_end", "is", null)
            .order("period_end", { ascending: false })
            .limit(1)
            .single();

          if (latestErr || !latestRow?.period_end) {
            setData([]);
            setDebug({ ...(billMonthsAttempt ?? {}), step: "no-latest-bill" });
            return;
          }

          latestMonth = billMonthFromPeriod(latestRow.period_start ?? null, latestRow.period_end);
          if (!latestMonth) {
            setData([]);
            setDebug({ ...(billMonthsAttempt ?? {}), step: "no-latest-bill" });
            return;
          }

          const latest = new Date(`${latestMonth}T00:00:00Z`);
          const endForCompleteness = new Date(Date.UTC(latest.getUTCFullYear(), latest.getUTCMonth() + 1, 1));
          const startForCompleteness = new Date(
            Date.UTC(endForCompleteness.getUTCFullYear(), endForCompleteness.getUTCMonth() - 12, 1)
          );

          const { data: bills, error: billsErr } = await sb
            .from("bills")
            .select("period_start, period_end, meter_id")
            .in("building_id", ids)
            .gte("period_end", startForCompleteness.toISOString().slice(0, 10))
            .lt("period_end", endForCompleteness.toISOString().slice(0, 10))
            .order("period_end", { ascending: true });
          if (billsErr) throw billsErr;

          const meterIds = Array.from(
            new Set((((bills as any[]) ?? []).map((b) => b.meter_id)).filter((id) => !!id))
          );
          const meterTypeById = new Map<string, string>();
          if (meterIds.length) {
            const { data: meters, error: mErr } = await sb
              .from("meters")
              .select("id, type")
              .in("id", meterIds);
            if (mErr) throw mErr;
            for (const m of meters ?? []) {
              meterTypeById.set((m as any).id, (m as any).type);
            }
          }

          const monthlyCoverage: Record<string, { hasElectric: boolean; hasGas: boolean }> = {};
          for (const b of (bills as any[]) ?? []) {
            const month = billMonthFromPeriod(b.period_start ?? null, b.period_end ?? null);
            if (!month) continue;

            const meterType = String(meterTypeById.get(b.meter_id) || "electric").toLowerCase();
            const isGas = meterType.includes("gas");
            if (!monthlyCoverage[month]) {
              monthlyCoverage[month] = { hasElectric: false, hasGas: false };
            }
            if (isGas) {
              monthlyCoverage[month].hasGas = true;
            } else {
              monthlyCoverage[month].hasElectric = true;
            }
          }

          const coverageKeys = Object.keys(monthlyCoverage).sort((a, b) => (a > b ? 1 : a < b ? -1 : 0));
          currentKeys = [...coverageKeys];
          for (const key of coverageKeys) {
            const bucket = monthlyCoverage[key] || { hasElectric: false, hasGas: false };
            if (bucket.hasElectric && bucket.hasGas) {
              completeMonths.add(key);
            } else {
              skippedIncompleteCurrentKeys.push(key);
            }
          }
        }

        const priorCurrentKeys = [...currentKeys];
        const selectedCompleteMonths = Array.from(completeMonths)
          .sort((a, b) => (a > b ? 1 : a < b ? -1 : 0))
          .slice(-12);
        const selectedCompleteMonthSet = new Set(selectedCompleteMonths);
        currentKeys = selectedCompleteMonths;
        skippedIncompleteCurrentKeys = priorCurrentKeys.filter((key) => !selectedCompleteMonthSet.has(key));

        const latest = new Date(`${latestMonth}T00:00:00Z`);
        const end = new Date(Date.UTC(latest.getUTCFullYear(), latest.getUTCMonth() + 1, 1));
        const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 12, 1));
        const compareStart = new Date(Date.UTC(start.getUTCFullYear() - 1, start.getUTCMonth(), 1));

        const { data: rows, error: uErr } = await sb
          .from("usage_readings")
          .select(`
            usage_kwh,
            usage_mmbtu,
            therms,
            usage_mcf,
            bills!inner(
              period_start,
              period_end,
              building_id,
              meter_id
            )
          `)
          .gte("bills.period_end", compareStart.toISOString().slice(0, 10))
          .in("bills.building_id", ids);
        if (uErr) throw uErr;

        const monthly: Record<string, { elec: number; gas: number }> = {};
        const gasMaxByMonthMeter = new Map<string, number>();

        for (const r of rows ?? []) {
          const bill = Array.isArray((r as any).bills) ? (r as any).bills[0] : (r as any).bills;
          const monthIso = billMonthFromPeriod(bill?.period_start ?? null, bill?.period_end ?? null);
          if (!monthIso) continue;
          if (monthIso < compareStart.toISOString().slice(0, 10) || monthIso >= end.toISOString().slice(0, 10)) continue;

          const d = new Date(`${monthIso}T00:00:00Z`);
          const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
          const kBtuElec = Number(r.usage_kwh ?? 0) * 3.412;
          const gasMmbtu = gasMmbtuFromUsage(r);
          const meterId = String(bill?.meter_id ?? "");

          if (!monthly[ym]) monthly[ym] = { elec: 0, gas: 0 };
          monthly[ym].elec += Number.isFinite(kBtuElec) ? kBtuElec : 0;

          if (gasMmbtu != null && meterId) {
            const key = `${monthIso}|${meterId}`;
            const prev = gasMaxByMonthMeter.get(key);
            if (prev == null || gasMmbtu > prev) {
              gasMaxByMonthMeter.set(key, gasMmbtu);
            }
          }
        }

        for (const [key, maxMmbtu] of gasMaxByMonthMeter.entries()) {
          const monthIso = key.slice(0, 10);
          const ym = monthIso.slice(0, 7);
          if (!monthly[ym]) monthly[ym] = { elec: 0, gas: 0 };
          monthly[ym].gas += maxMmbtu * 1000;
        }

        const result: Array<{
          label: string;
          electricity: number;
          gas: number;
          totalEnergy: number;
          lastYearTotalEnergy: number;
        }> = [];

        for (const monthKey of selectedCompleteMonths) {
          const d = new Date(`${monthKey}T00:00:00Z`);
          const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
          const priorYm = `${d.getUTCFullYear() - 1}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
          const current = monthly[ym];
          const prior = monthly[priorYm];
          const mShort = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
          const yy = String(d.getUTCFullYear()).slice(-2);

          const electricity = current ? Math.round(current.elec / 1000) : 0;
          const gas = current ? Math.round(current.gas / 1000) : 0;
          const totalEnergy = electricity + gas;
          const lastYearTotalEnergy = prior ? Math.round((prior.elec + prior.gas) / 1000) : 0;

          result.push({ label: `${mShort} '${yy}`, electricity, gas, totalEnergy, lastYearTotalEnergy });
        }

        setData(result);
        setDebug({
          ...(billMonthsAttempt ?? {}),
          step: "ok",
          latestMonth,
          billMonthsSource,
          currentKeys,
          skippedIncompleteCurrentKeys,
          count: result.length,
        });
      } catch (e: any) {
        setData([]);
        setDebug({ step: "error", error: String(e) });
      }
    })();
  }, [orgId, sb, buildingType]);

  return { data, debug };
}

// ----------------- Hook: Energy Mix (last 12 full months) -----------------
function useEnergyMix(
  orgId: string | null,
  buildingType: "k12" | "other" | "all"
) {
  const sb = useSupabaseClient();
  const [data, setData] = React.useState<{ name: string; value: number; color: string }[]>([]);
  const [debug, setDebug] = React.useState<any>({ step: "init" });

  React.useEffect(() => {
    if (!orgId) return;

    (async () => {
      try {
               // 1) Buildings for this org (respect buildingType)
        let bldgQuery = sb
          .from("buildings")
          .select("id")
          .eq("org_id", orgId);

        if (buildingType === "k12") {
          bldgQuery = bldgQuery.eq("activity_code", "K-12 School");
        } else if (buildingType === "other") {
          bldgQuery = bldgQuery.neq("activity_code", "K-12 School");
        }

        const { data: blds, error: bErr } = await bldgQuery;

        if (bErr) throw bErr;

        const ids = (blds ?? []).map(b => b.id);
        if (!ids.length) {
          setData([]);
          setDebug({ step: "no-buildings" });
          return;
        }

        // 2) 12 full months window [start, end)
        const now = new Date();
        const end = new Date(now.getFullYear(), now.getMonth(), 1);     // start of current month (excluded)
        const start = new Date(end.getFullYear(), end.getMonth() - 12, 1);

        // 3) Join usage_readings to bills in window, org-filtered
        const { data: rows, error: uErr } = await sb
          .from("usage_readings")
          .select(`
            usage_kwh,
            usage_mmbtu,
            therms,
            usage_mcf,
            bills!inner(
              period_start,
              period_end,
              building_id,
              meter_id
            )
          `)
          .gte("bills.period_end", start.toISOString().slice(0,10))
          .in("bills.building_id", ids);

        if (uErr) throw uErr;

        // 4) Sum to kBtu (gas uses max-per-meter-per-month and normalized units)
        const windowStartIso = start.toISOString().slice(0, 10);
        const windowEndIso = end.toISOString().slice(0, 10);
        const rowsInWindow = (rows ?? []).filter((r: any) => {
          const bill = Array.isArray(r?.bills) ? r.bills[0] : r?.bills;
          const monthIso = billMonthFromPeriod(bill?.period_start ?? null, bill?.period_end ?? null);
          return !!monthIso && monthIso >= windowStartIso && monthIso < windowEndIso;
        });
        const sums = sumUsageRowsKBtu(rowsInWindow);
        const kBtuElec = sums.kBtuElec;
        const kBtuGas = sums.kBtuGas;

        const total = kBtuElec + kBtuGas;
        if (total <= 0) {
          setData([]);
          setDebug({ step: "no-usage" });
          return;
        }

        const pct = (x: number) => Math.round((x / total) * 100);
        const elecPct = pct(kBtuElec);
        const gasPct  = pct(kBtuGas);
        const otherPct = Math.max(0, 100 - elecPct - gasPct); // guard rounding

        setData([
          { name: "Electricity", value: elecPct, color: "#3b82f6" },
          { name: "Natural Gas", value: gasPct,  color: "#f59e0b" },
          { name: "Other",       value: otherPct, color: "#6b7280" },
        ]);

        setDebug({
          step: "ok",
          months: 12,
          kBtuElec,
          kBtuGas,
          total,
          elecPct,
          gasPct,
          otherPct
        });
      } catch (e: any) {
        setData([]);
        setDebug({ step: "error", error: String(e) });
      }
    })();
 }, [orgId, sb, buildingType]);


  return { data, debug };
}

// ----------------- Hook: Blended Electric Rate from Bills -----------------
function useBlendedElectricRate(
  orgId: string | null,
  buildingType: "k12" | "other" | "all"
) {
  const sb = useSupabaseClient();
  const [rate, setRate] = React.useState<number | null>(null);
  const [debug, setDebug] = React.useState<any>({ step: "init" });

  React.useEffect(() => {
    if (!orgId) return;

    (async () => {
      try {
        // 1️⃣ Buildings for this org (respect buildingType)
        let bldgQuery = sb
          .from("buildings")
          .select("id")
          .eq("org_id", orgId);

        if (buildingType === "k12") {
          bldgQuery = bldgQuery.eq("activity_code", "K-12 School");
        } else if (buildingType === "other") {
          bldgQuery = bldgQuery.neq("activity_code", "K-12 School");
        }

        const { data: bldgs, error: bErr } = await bldgQuery;
        if (bErr) throw bErr;

        const buildingIds = (bldgs ?? []).map((b: any) => b.id);
        if (!buildingIds.length) {
          setRate(null);
          setDebug({ step: "no-buildings" });
          return;
        }

        // 2️⃣ Last 12 full months (same pattern as other 12-month hooks)
        const today = new Date();
        const end = new Date(today.getFullYear(), today.getMonth(), 1); // first of current month
        const start = new Date(end.getFullYear(), end.getMonth() - 12, 1);

        const startIso = start.toISOString().slice(0, 10);
        const endIso = end.toISOString().slice(0, 10);

        // 3️⃣ Pull electric usage (kWh) + matching bill cost
        const { data: rows, error: rErr } = await sb
          .from("usage_readings")
          .select(`
            usage_kwh,
            bills!inner(
              building_id,
              period_start,
              period_end,
              total_cost
            )
          `)
          .in("bills.building_id", buildingIds)
          .gte("bills.period_end", startIso);

        if (rErr) throw rErr;

        let totalKwh = 0;
        let totalCost = 0;

        for (const r of rows ?? []) {
          const kwh = Number((r as any).usage_kwh ?? 0);
          const bill = (r as any).bills;
          const monthIso = billMonthFromPeriod(bill?.period_start ?? null, bill?.period_end ?? null);
          if (!monthIso || monthIso < startIso || monthIso >= endIso) continue;
          const cost = bill ? Number(bill.total_cost ?? 0) : 0;

          // We only count rows where both usage and cost are > 0
          if (kwh > 0 && cost > 0) {
            totalKwh += kwh;
            totalCost += cost;
          }
        }

        if (totalKwh > 0) {
          const blended = totalCost / totalKwh; // $/kWh
          setRate(blended);
          setDebug({
            step: "ok",
            totalKwh,
            totalCost,
            window: { start: startIso, end: endIso },
          });
        } else {
          setRate(null);
          setDebug({ step: "no-data", window: { start: startIso, end: endIso } });
        }
      } catch (e: any) {
        setRate(null);
        setDebug({ step: "error", error: String(e) });
      }
    })();
  }, [orgId, sb, buildingType]);

  return { rate, debug };
}


const EnergyDashboard = () => {
  // 1) Auth first
  const session = useSession();
  const sb = useSupabaseClient();

  // 2) Keep orgId in state so it can update once session is ready
  const [orgId, setOrgId] = useState<string | null>(null);

  // DEV: hardcode a fallback for testing if user_metadata.org_id is missing
  const DEV_ORG = "464a351a-0e8b-4e88-a90f-7ad25f668e7c";

  // 3) Local UI state
  const [buildingType, setBuildingType] = useState<"k12" | "other" | "all">("k12");
  const [buildingCount, setBuildingCount] = useState<number | null>(null);
  const [dateRange, setDateRange] = useState("12months");
  const [savingsTarget, setSavingsTarget] = useState(10);
  const [syncing, setSyncing] = useState(false);
  const [syncStats, setSyncStats] = useState<{
    total: number;
    synced: number;
    skipped: number;
  } | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [creatingPmProps, setCreatingPmProps] = useState(false);
  const [pmPropsMessage, setPmPropsMessage] = useState<string | null>(null);
  const [syncingMeters, setSyncingMeters] = useState(false);
  const [meterSyncMessage, setMeterSyncMessage] = useState<string | null>(null);
  const [uploadingUsage, setUploadingUsage] = useState(false);
  const [uploadUsageMessage, setUploadUsageMessage] = useState<string | null>(null);


  // (this effect should already exist somewhere above or below;
  // just make sure it's in the component)
  useEffect(() => {
    // prefer org from session; if not present, use DEV_ORG while testing
    const id =
      (session?.user?.user_metadata as any)?.org_id ??
      DEV_ORG; // remove this fallback when prod-ready
    setOrgId(id ?? null);
  }, [session]);

  // Count buildings for the current filter (K-12 / Other / All)
  useEffect(() => {
    if (!orgId) return;

    (async () => {
      try {
        let q = sb
          .from("buildings")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId);

        if (buildingType === "k12") {
          q = q.eq("activity_code", "K-12 School");
        } else if (buildingType === "other") {
          q = q.neq("activity_code", "K-12 School");
        }

        const { count, error } = await q;
        if (error) {
          console.error("Error counting buildings", error);
          setBuildingCount(null);
        } else {
          setBuildingCount(count ?? 0);
        }
      } catch (e) {
        console.error("Exception counting buildings", e);
        setBuildingCount(null);
      }
    })();
  }, [orgId, sb, buildingType]);

  // 4) Hooks that depend on orgId — call once each
  const totalEnergy = useTotalEnergyKBtuRolling(orgId, buildingType);
  const annualCostMoM = useAnnualCostMoMTrendFromLatest(orgId, buildingType);
  const avgScore = useDistrictAvgEnergyStarScore(orgId, buildingType);
  const {
  value: districtAvgEUI,
  avg: districtAvgEuiNumber,
  debug: euiDebug,
} = useDistrictAverageEUI(orgId, buildingType);
  const monthlySpend = useMonthlyTotalSpend(orgId, buildingType);
  const monthlySpendLatestCompleteMonth =
    latestCompleteMonthFromMonthlySpendDebug(monthlySpend?.debug) ??
    monthlySpend?.debug?.latestCompleteMonth ??
    monthKeyFromMonthlySpendRow(monthlySpend?.data?.[monthlySpend?.data?.length - 1]);
const annualCost = useAnnualTotalCostRolling(orgId, buildingType, monthlySpendLatestCompleteMonth ?? null);
  const scoreMoM = useDistrictPmMetricMoM(orgId, buildingType, "score", "sync");
  const euiMoM = useDistrictPmMetricMoM(orgId, buildingType, "site_eui_wn_kbtu_ft2", "sync");
  const districtAvgEuiDisplayNumber =
    euiMoM.current != null && Number.isFinite(euiMoM.current)
      ? euiMoM.current
      : districtAvgEuiNumber;
  const districtAvgEuiDisplayValue =
    districtAvgEuiDisplayNumber != null && Number.isFinite(districtAvgEuiDisplayNumber)
      ? `${districtAvgEuiDisplayNumber.toFixed(1)} kBtu/ft²`
      : districtAvgEUI;

  const buildingSpendYoY = useBuildingMonthlySpendYoYSinceSep2025(
    orgId,
    buildingType,
    annualCost?.debug?.bounds?.curEndStr ?? null
  );
  const monthlyAverageEui = useMonthlyAverageEui(orgId, buildingType);
  const monthlyEnergy = useMonthlyEnergyTrendCompleteMonthsOnly(orgId, buildingType);
  const annualCostPerSF = useAnnualCostPerSqFt(orgId, buildingType);
  const annualCostPerSFXMax = React.useMemo(() => {
    const rows = annualCostPerSF.data ?? [];
    if (!rows.length) return 2;
    const maxVal = rows.reduce((mx: number, r: any) => {
      const cur = Number(r?.costPerSF ?? 0);
      const base = Number(r?.baselineCostPerSF ?? 0);
      return Math.max(mx, Number.isFinite(cur) ? cur : 0, Number.isFinite(base) ? base : 0);
    }, 0);
    return Math.max(2, Number((maxVal * 1.1).toFixed(2)));
  }, [annualCostPerSF.data]);
  const energyStarBySchool = useEnergyStarScoreBySchool(orgId, buildingType);
  const energyMixHook = useEnergyMix(orgId, buildingType);
  const { rate: blendedElectricRate } = useBlendedElectricRate(orgId, buildingType);


  // --- Derived: Performance Grid rows (merge ENERGY STAR + Cost/SF) ---
  const perfRows = React.useMemo(() => {
    const scores = energyStarBySchool.data ?? [];
    const costs = annualCostPerSF.data ?? [];
    if (!scores.length && !costs.length) return [];

    // quick lookup by building name
    const costByName: Record<string, { id?: string; costPerSF: number }> = {};
    for (const r of costs) {
      if (r?.name) costByName[r.name] = { id: r.id, costPerSF: r.costPerSF };
    }

    // use score list as the spine; enrich with cost if present
    const merged = scores.map((s: any) => ({
      id: s.id ?? costByName[s.name]?.id ?? null,
      name: s.name,
      score: Number(s.score),
      eui: s.eui ?? null,
      costPerSF: costByName[s.name]?.costPerSF ?? null,
    }));

    // include buildings that have cost but no score (optional)
    for (const c of costs) {
      if (!merged.find((m) => m.name === c.name)) {
        merged.push({
          id: c.id ?? null,
          name: c.name,
          score: null as any,
          eui: null as any,
          costPerSF: c.costPerSF,
        });
      }
    }

    // sort: highest score first when score exists, else by lowest $/sf
    return merged.sort((a, b) => {
      const sa = Number.isFinite(a.score) ? a.score : -1;
      const sb = Number.isFinite(b.score) ? b.score : -1;
      if (sa !== -1 || sb !== -1) return sb - sa;
      return (a.costPerSF ?? Infinity) - (b.costPerSF ?? Infinity);
    });
  }, [energyStarBySchool.data, annualCostPerSF.data]);

  // 🔹 Dynamic subtitle text
  const subtitleText = React.useMemo(() => {
    if (buildingCount == null) return "Overview of selected buildings";

    const countLabel = buildingCount === 1 ? "building" : "buildings";

    if (buildingType === "k12") {
      return `Overview of ${buildingCount} K-12 school ${countLabel}`;
    }
    if (buildingType === "other") {
      return `Overview of ${buildingCount} other ${countLabel}`;
    }
    // "all"
    return `Overview of ${buildingCount} total ${countLabel}`;
  }, [buildingCount, buildingType]);


  // 5) Effects/handlers (can reference orgId safely now)
  useEffect(() => {
    const ts = localStorage.getItem("pm:lastSyncAt");
    if (ts) setLastSyncAt(ts);
  }, []);

  async function handleSyncEnergyStar() {

    if (!orgId) return;
    setSyncing(true);
    setSyncStats(null);
    try {
      const res = await fetch(`/api/pm/sync-property-metrics?orgId=${orgId}`);
      const data = await res.json();

      const total = data?.count ?? (data?.results?.length ?? 0);
      let synced = 0, skipped = 0;
      for (const r of data?.results ?? []) {
        if (r?.skipped) skipped++;
        else if (r?.ok) synced++;
      }
      setSyncStats({ total, synced, skipped });

      const nowIso = new Date().toISOString();
      localStorage.setItem("pm:lastSyncAt", nowIso);
      setLastSyncAt(nowIso);
    } catch {
      setSyncStats(null);
    } finally {
      setSyncing(false);
    }
  }

 async function handleCreatePmPropertiesForOrg() {
  try {
    if (!orgId) {
      setPmPropsMessage("Cannot create PM properties: orgId is not set.");
      return;
    }

    setCreatingPmProps(true);
    setPmPropsMessage(null);

    const res = await fetch(`/api/pm/create-properties-for-org?orgId=${orgId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const text = await res.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // not JSON, ignore
    }

    if (!res.ok) {
      const apiError = body?.error || text || `HTTP ${res.status} ${res.statusText}`;
      throw new Error(apiError);
    }

    setPmPropsMessage(
      body?.message ??
        `Finished creating/syncing properties for ${body?.processedCount ?? "all"} buildings.`
    );
  } catch (err: any) {
    console.error(err);
    setPmPropsMessage(err?.message || "Error creating Portfolio Manager properties.");
  } finally {
    setCreatingPmProps(false);
  }
}

  async function handleSyncPmMeters() {
    try {
      if (!orgId) {
        setMeterSyncMessage("Cannot sync meters: orgId is not set.");
        return;
      }

      setSyncingMeters(true);
      setMeterSyncMessage(null);

      // ⬇️ If your route name is slightly different, just change this URL
      const res = await fetch(`/api/pm/meter-sync?orgId=${orgId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const text = await res.text();
      let body: any = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        // non-JSON body is fine; we'll just show the raw text
      }

      if (!res.ok) {
        const apiError =
          body?.error || text || `HTTP ${res.status} ${res.statusText}`;
        throw new Error(apiError);
      }

            const syncedTotal = body?.total ?? null;
      const linked = body?.linked ?? null;
      const created = body?.created ?? null;

      setMeterSyncMessage(
        body?.message ??
          `Finished syncing meters: ${syncedTotal ?? 0} total considered, ` +
          `${linked ?? 0} linked to existing PM meters, ` +
          `${created ?? 0} new PM meters created.`
      );

    } catch (err: any) {
      console.error(err);
      setMeterSyncMessage(
        err?.message || "Error syncing Portfolio Manager meters."
      );
    } finally {
      setSyncingMeters(false);
    }
  }

  async function handleUploadPmUsage() {
    try {
      if (!orgId) {
        setUploadUsageMessage("Cannot upload usage: orgId is not set.");
        return;
      }

      setUploadingUsage(true);
      setUploadUsageMessage(null);

      const res = await fetch(`/api/pm/upload-usage?orgId=${orgId}`, {
        method: "POST",
      });

      const text = await res.text();
      let body: any = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        // non-JSON body; we’ll just show the raw text on error
      }

      if (!res.ok || !body?.ok) {
        const apiError =
          body?.error || text || `HTTP ${res.status} ${res.statusText}`;
        throw new Error(apiError);
      }

      const meters = body?.meters ?? body?.results?.length ?? 0;
      const totalRecords = body?.totalRecords ?? 0;

      setUploadUsageMessage(
        `Uploaded ${totalRecords} usage records to ${meters} PM meters.`
      );
    } catch (err: any) {
      console.error(err);
      setUploadUsageMessage(
        err?.message || "Error uploading usage to Portfolio Manager."
      );
    } finally {
      setUploadingUsage(false);
    }
  }


  if (!session) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="max-w-md w-full bg-white shadow p-6 rounded">
          <h1 className="text-xl font-bold mb-2">Please sign in</h1>
          <p className="text-sm text-gray-600">You need to be logged in to view the dashboard.</p>
        </div>
      </div>
    );
  }

// Sample data
 const kpiData = {
   avgScore: { value: 72, trend: 5.2, isUp: true },
    avgEUI: { value: 54.3, trend: -3.1, isUp: false },
    totalConsumption: { value: '12.4M', unit: 'kWh', cost: '$1.86M' },
    costSavings: { value: '$124K', trend: 8.5, isUp: true },
    meetingTarget: { current: 8, total: 12 }
  };

  const schoolScores = [
    { name: 'Lincoln HS', score: 89, eui: 45.2, costPerSF: 2.15 },
    { name: 'Washington MS', score: 78, eui: 51.3, costPerSF: 2.38 },
    { name: 'Roosevelt ES', score: 76, eui: 48.7, costPerSF: 2.29 },
    { name: 'Jefferson ES', score: 74, eui: 52.1, costPerSF: 2.42 },
    { name: 'Madison MS', score: 71, eui: 55.8, costPerSF: 2.56 },
    { name: 'Monroe ES', score: 69, eui: 57.2, costPerSF: 2.63 },
    { name: 'Adams ES', score: 68, eui: 58.9, costPerSF: 2.71 },
    { name: 'Jackson HS', score: 65, eui: 61.3, costPerSF: 2.82 },
    { name: 'Kennedy MS', score: 62, eui: 63.7, costPerSF: 2.93 },
    { name: 'Wilson ES', score: 58, eui: 66.2, costPerSF: 3.05 },
    { name: 'Polk ES', score: 55, eui: 68.5, costPerSF: 3.15 },
    { name: 'Harrison ES', score: 52, eui: 72.1, costPerSF: 3.32 }
  ];

  const trendData = [
    { month: 'Nov', electricity: 980, gas: 1250 },
    { month: 'Dec', electricity: 1150, gas: 1480 },
    { month: 'Jan', electricity: 1220, gas: 1580 },
    { month: 'Feb', electricity: 1180, gas: 1520 },
    { month: 'Mar', electricity: 1050, gas: 1320 },
    { month: 'Apr', electricity: 920, gas: 1080 },
    { month: 'May', electricity: 850, gas: 920 },
    { month: 'Jun', electricity: 780, gas: 850 },
    { month: 'Jul', electricity: 820, gas: 880 },
    { month: 'Aug', electricity: 890, gas: 950 },
    { month: 'Sep', electricity: 940, gas: 1050 },
    { month: 'Oct', electricity: 1020, gas: 1180 }
  ];

  const costData = [
    { month: 'Nov', cost: 147 },
    { month: 'Dec', cost: 172 },
    { month: 'Jan', cost: 186 },
    { month: 'Feb', cost: 178 },
    { month: 'Mar', cost: 158 },
    { month: 'Apr', cost: 138 },
    { month: 'May', cost: 128 },
    { month: 'Jun', cost: 118 },
    { month: 'Jul', cost: 122 },
    { month: 'Aug', cost: 133 },
    { month: 'Sep', cost: 141 },
    { month: 'Oct', cost: 153 }
  ];

  const energyMixFallback = [
  { name: 'Electricity', value: 68, color: '#3b82f6' },
  { name: 'Natural Gas', value: 28, color: '#f59e0b' },
  { name: 'Other', value: 4, color: '#6b7280' }
];


  const getScoreColor = (score) => {
    if (score >= 75) return '#10b981';
    if (score >= 50) return '#f59e0b';
    return '#ef4444';
  };
// National median EUI for K-12 schools from ENERGY STAR
const nationalMedianEUI =
  buildingType === "k12" && euiDebug?.nationalEui?.median_eui_kbtu_ft2
    ? euiDebug.nationalEui.median_eui_kbtu_ft2
    : null;

// Fallback to CBECS 2018 K-12 median if benchmark hasn't loaded yet
const safeNationalMedianEUI =
  typeof nationalMedianEUI === "number" && Number.isFinite(nationalMedianEUI)
    ? nationalMedianEUI
    : 110.2; // kBtu/sf/yr


let districtEuiSubtitle: string;

if (districtAvgEuiDisplayNumber == null || !Number.isFinite(districtAvgEuiDisplayNumber)) {
  districtEuiSubtitle =
    buildingType === "k12"
      ? "Average site EUI for your K-12 schools"
      : "Average site EUI for selected buildings";
} else if (!nationalMedianEUI) {
  districtEuiSubtitle = "National benchmark unavailable";
} else {
  const diffPct =
    ((districtAvgEuiDisplayNumber - safeNationalMedianEUI) / safeNationalMedianEUI) * 100;
  const dir = diffPct >= 0 ? "above" : "below";
  districtEuiSubtitle = `${Math.abs(diffPct).toFixed(1)}% ${dir} national median for K-12`;
}

// ----- ENERGY STAR Score benchmark (national median score is 50) -----
const nationalMedianScore = 50;

let districtScoreSubtitle: string;
const districtAvgScoreNumber =
  typeof avgScore?.debug?.avg === "number" && Number.isFinite(avgScore.debug.avg)
    ? avgScore.debug.avg
    : null;

if (!districtAvgScoreNumber) {
  districtScoreSubtitle =
    buildingType === "k12"
      ? "Average ENERGY STAR Score for your K-12 schools"
      : "Average ENERGY STAR Score for selected buildings";
} else {
  const diff = districtAvgScoreNumber - nationalMedianScore;
  const dir = diff >= 0 ? "above" : "below";
  districtScoreSubtitle = `${Math.abs(diff).toFixed(1)} points ${dir} national median (50) for K-12`;
}


// Month helpers
function monthStart(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function isoDate(d: Date) { return d.toISOString().slice(0, 10); }
const fmtUSD = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtPct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;

const fmtMoneyCompact = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000
    ? `$${(n / 1_000).toFixed(1)}K`
    : `$${n.toFixed(0)}`;

const formatMonthShort = (ymd: string | null) => {
  if (!ymd) return "—";
  const d = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
};

const formatMonthShortSafe = (ymd: string | null) => {
  if (!ymd) return "â€”";
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(ymd);
  if (!m) return "â€”";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthIndex = Number(m[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return "â€”";
  return `${months[monthIndex]} ${m[1]}`;
};

const scoreChangeCard = {
  value:
    scoreMoM.current != null && Number.isFinite(scoreMoM.current)
      ? scoreMoM.current.toFixed(1)
      : "—",
  previousValue:
    scoreMoM.previous != null && Number.isFinite(scoreMoM.previous)
      ? scoreMoM.previous.toFixed(1)
      : "—",
  currentValue:
    scoreMoM.current != null && Number.isFinite(scoreMoM.current)
      ? scoreMoM.current.toFixed(1)
      : "—",
  changeText:
    scoreMoM.delta != null && Number.isFinite(scoreMoM.delta)
      ? `${scoreMoM.delta > 0 ? "+" : ""}${scoreMoM.delta.toFixed(1)} pts vs prior month`
      : "No prior month to compare",
  isIncrease:
    scoreMoM.delta != null && scoreMoM.delta !== 0 ? scoreMoM.delta > 0 : null,
  subtitle: `${formatMonthShort(scoreMoM.previousAsOf)} vs ${formatMonthShort(scoreMoM.latestAsOf)}`,
};

const euiChangeCard = {
  value:
    euiMoM.current != null && Number.isFinite(euiMoM.current)
      ? `${euiMoM.current.toFixed(1)} kBtu/ft²`
      : "—",
  previousValue:
    euiMoM.previous != null && Number.isFinite(euiMoM.previous)
      ? euiMoM.previous.toFixed(1)
      : "—",
  currentValue:
    euiMoM.current != null && Number.isFinite(euiMoM.current)
      ? euiMoM.current.toFixed(1)
      : "—",
  changeText:
    euiMoM.delta != null && Number.isFinite(euiMoM.delta)
      ? `${euiMoM.delta > 0 ? "+" : ""}${euiMoM.delta.toFixed(1)} kBtu/ft² vs prior month`
      : "No prior month to compare",
  isIncrease: euiMoM.delta != null && euiMoM.delta !== 0 ? euiMoM.delta > 0 : null,
  subtitle: `${formatMonthShort(euiMoM.previousAsOf)} vs ${formatMonthShort(euiMoM.latestAsOf)}`,
};

const totalEnergyMoMCard = (() => {
  const rows = monthlyEnergy.data ?? [];
  if (rows.length < 2) {
    return {
      value: "—",
      changeText: "No prior month to compare",
      isIncrease: null as boolean | null,
      subtitle: "Monthly totals",
    };
  }
  const curr = Number(rows[rows.length - 1].electricity ?? 0) + Number(rows[rows.length - 1].gas ?? 0);
  const prev = Number(rows[rows.length - 2].electricity ?? 0) + Number(rows[rows.length - 2].gas ?? 0);
  const delta = curr - prev;
  const pct = prev > 0 ? (delta / prev) * 100 : null;
  const pctTxt = pct != null && Number.isFinite(pct) ? ` (${pct > 0 ? "+" : ""}${pct.toFixed(1)}%)` : "";
  return {
    value: `${curr.toLocaleString()}k kBtu`,
    changeText: `${delta > 0 ? "+" : ""}${delta.toLocaleString()}k kBtu${pctTxt} vs prior month`,
    isIncrease: delta !== 0 ? delta > 0 : null,
      subtitle: `${rows[rows.length - 1].label} vs ${rows[rows.length - 2].label}`,
  };
})();

const realDollarsCard = (() => {
  const savings = annualCost.savingsSinceSep2025Vs2024;
  const electricSavings = annualCost.electricSavingsSinceSep2025Vs2024;
  const gasSavings = annualCost.gasSavingsSinceSep2025Vs2024;

  const fuelLine = (n: number | null) => {
    if (n == null || !Number.isFinite(n)) {
      return { text: "—", className: "text-gray-500" };
    }
    if (n > 0) {
      return { text: `-${fmtMoneyCompact(n)}`, className: "text-green-600" };
    }
    if (n < 0) {
      return { text: `+${fmtMoneyCompact(Math.abs(n))}`, className: "text-red-600" };
    }
    return { text: fmtMoneyCompact(0), className: "text-gray-900" };
  };

  const electricLine = fuelLine(electricSavings);
  const gasLine = fuelLine(gasSavings);

  if (savings == null || !Number.isFinite(savings)) {
    return {
      value: "—",
      valueClassName: "text-gray-500",
      changeText: "",
      isIncrease: null as boolean | null,
      electricLine,
      gasLine,
    };
  }
  const isSavings = savings >= 0;
  return {
    value:
      savings > 0
        ? `-${fmtMoneyCompact(savings)}`
        : savings < 0
          ? `+${fmtMoneyCompact(Math.abs(savings))}`
          : fmtMoneyCompact(0),
    valueClassName: isSavings ? "text-green-600" : "text-red-600",
    changeText: "",
    isIncrease: null as boolean | null,
    electricLine,
    gasLine,
  };
})();

const realDollarsRangeText = (() => {
  const anchorMonth = monthlySpendLatestCompleteMonth;
  if (anchorMonth) {
    const curStart = "2025-09-01";
    const curEnd = anchorMonth;
    const baseStart = "2024-09-01";
    const baseEnd = shiftMonthKeyByYears(anchorMonth, -1);
    if (!baseEnd) return "Range: -";
    return `${formatMonthShortSafe(baseStart)} - ${formatMonthShortSafe(baseEnd)} vs ${formatMonthShortSafe(curStart)} - ${formatMonthShortSafe(curEnd)}`;
    return `${formatMonthShort(baseStart)}â€“${formatMonthShort(baseEnd)} vs ${formatMonthShort(curStart)}â€“${formatMonthShort(curEnd)}`;
  }

  const range = annualCost?.debug?.savingsRange;
  const curStart = String(range?.current?.start ?? "");
  const curEndExcl = String(range?.current?.endExclusive ?? "");
  const baseStart = String(range?.baseline?.start ?? "");
  const baseEndExcl = String(range?.baseline?.endExclusive ?? "");
  if (!curStart || !curEndExcl || !baseStart || !baseEndExcl) return "Range: —";

  const curEnd = yyyyMm01(addMonths(new Date(`${curEndExcl}T00:00:00Z`), -1));
  const baseEnd = yyyyMm01(addMonths(new Date(`${baseEndExcl}T00:00:00Z`), -1));

  return `${formatMonthShort(baseStart)}–${formatMonthShort(baseEnd)} vs ${formatMonthShort(curStart)}–${formatMonthShort(curEnd)}`;
})();

const spendCellToneClass = (cy: number, py: number) =>
  cy > py ? "text-red-600" : cy < py ? "text-green-600" : "text-gray-900";

const spendDeltaText = (delta: number) =>
  `${delta >= 0 ? "+" : "-"}${fmtMoneyCompact(Math.abs(delta))}`;
  

// Calculate potential savings
  // Use real PM data when available; fall back to sample schools
const benchmarkSchools = energyStarBySchool.data.length
  ? energyStarBySchool.data
  : schoolScores;

// Target EUI relative to national median
const targetEUI = safeNationalMedianEUI * (1 - savingsTarget / 100);

// Sum current and target kBtu/year using EUI × ft²
const currentTotalKBtu = benchmarkSchools.reduce((sum: number, s: any) => {
  const eui = Number(s.eui ?? 0); // kBtu/ft²/year
  const sf = s.square_feet ?? 100_000; // assume 100k ft² if we don't have it
  return sum + eui * sf; // → kBtu/year
}, 0);

const targetTotalKBtu = benchmarkSchools.reduce((sum: number, s: any) => {
  const eui = Number(s.eui ?? 0);
  const sf = s.square_feet ?? 100_000;
  const cappedEui = eui > targetEUI ? targetEUI : eui;
  return sum + cappedEui * sf;
}, 0);

// Savings and cost impact
const kBtuSavings = Math.max(0, currentTotalKBtu - targetTotalKBtu);

// Use real 12-month blended rate from bills when available; fall back to $0.15/kWh
const blendedRate = blendedElectricRate ?? 0.15; // $/kWh

const costSavings = (kBtuSavings / 3.412) * blendedRate; // kBtu → kWh → $

const schoolsNeedingImprovement = benchmarkSchools.filter(
  (s: any) => Number(s.eui ?? 0) > targetEUI
).length;

 // Leaderboard rows: only real data (no placeholders)
const leaderboardRows = perfRows
  .filter((r) => Number.isFinite(r.score))
  .slice(0, 5);


  const KPICard = ({ title, value, unit, trend, isUp, icon: Icon, subtitle }) => (
    <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600 mb-1">{title}</p>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold text-gray-900">{value}</p>
            {unit && <span className="text-sm text-gray-500">{unit}</span>}
          </div>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
      {typeof trend === "number" && Number.isFinite(trend) && (
  <div className={`flex items-center gap-1 mt-2 text-sm ${isUp ? 'text-green-600' : 'text-red-600'}`}>
    {isUp ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
    <span className="font-medium">{Math.abs(trend)}%</span>
    <span className="text-gray-500 text-xs">vs last period</span>
  </div>
)}

        </div>
        {Icon && (
          <div className="bg-blue-50 p-3 rounded-lg">
            <Icon className="text-blue-600" size={24} />
          </div>
        )}
      </div>
    </div>
  );

  const DeltaKPICard = ({
    title,
    value,
    changeText,
    isIncrease,
    subtitle,
    icon: Icon,
    increaseIsGood = false,
    primaryContent,
  }) => (
    <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600 mb-1">{title}</p>
          {primaryContent ? (
            primaryContent
          ) : (
            <p className="text-3xl font-bold text-gray-900">{value}</p>
          )}
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
          {!!changeText && (() => {
            const positive = isIncrease === true;
            const negative = isIncrease === false;
            const colorClass =
              isIncrease == null
                ? "text-gray-500"
                : increaseIsGood
                ? (positive ? "text-green-600" : "text-red-600")
                : (positive ? "text-red-600" : "text-green-600");
            return (
          <div
                className={`flex items-center gap-1 mt-2 text-sm ${colorClass}`}
          >
            {isIncrease == null ? null : isIncrease ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            <span className="font-medium">{changeText}</span>
          </div>
            );
          })()}
        </div>
        {Icon && (
          <div className="bg-blue-50 p-3 rounded-lg">
            <Icon className="text-blue-600" size={24} />
          </div>
        )}
      </div>
    </div>
  );


  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
<section className="mb-6">
  <div className="flex items-center justify-between mb-2">
  <h1 className="text-3xl font-bold text-gray-900">District Energy Dashboard</h1>

  <div className="flex items-center gap-2">
    <Link
      href="/buildings"
      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
    >
      Buildings
    </Link>
    <Link
      href="/green-button"
      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
    >
      System Metrics
    </Link>
    <Link
      href="/admin"
      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
    >
      Admin
    </Link>
  </div>
</div>

<div className="flex items-center justify-between">

    <p className="text-gray-600">{subtitleText}</p>


   <div className="flex items-start gap-3">
  {/* Upload Bills */}
  <Link
    href="/ocr-test"
    className="inline-flex items-center px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-normal shadow hover:bg-emerald-700 hover:shadow-md transition"
  >
    1- Upload Bills
  </Link>

  {/* NEW: Upload Usage to PM */}
  <div className="flex flex-col items-center">
    <button
      type="button"
      onClick={handleUploadPmUsage}
      disabled={uploadingUsage || !orgId}
      className="inline-flex items-center px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-normal shadow hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {uploadingUsage ? "Uploading usage…" : "2- Upload to PM"}
    </button>

    {uploadUsageMessage && (
      <p className="mt-1 text-xs text-gray-600 text-center max-w-xs">
        {uploadUsageMessage}
      </p>
    )}
  </div>

  {/* Sync ENERGY STAR (PM properties + meters) */}
  <div className="flex flex-col items-center">
    <button
      type="button"
      onClick={handleSyncEnergyStar}
      disabled={syncing}
      className={`px-3 py-1.5 flex items-center gap-2 rounded-lg text-xs font-normal text-white ${
        syncing ? "bg-emerald-600 cursor-wait" : "bg-emerald-600 hover:bg-emerald-700"
      }`}
    >
      {syncing ? (
        <>
          <svg
            className="animate-spin h-4 w-4 text-white"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            ></path>
          </svg>
          Syncing…
        </>
      ) : (
        "3- Sync ENERGY STAR"
      )}
    </button>

    <p className="text-xs text-gray-500 mt-1">
      Last sync: {lastSyncAt ? new Date(lastSyncAt).toLocaleDateString() : "—"}
    </p>

    {syncStats && (
      <span className="px-2 py-1 mt-1 text-xs rounded-full bg-blue-50 text-blue-700 border border-blue-200">
        {syncStats.synced} synced · {syncStats.skipped} skipped
      </span>
    )}
  </div>
</div>
</div>

<div className="mt-2 flex justify-end">
  <select
    value={buildingType}
    onChange={(e) => setBuildingType(e.target.value as "k12" | "other" | "all")}
    className="px-4 py-2 border border-gray-300 rounded-lg text-sm bg-white"
  >
    <option value="k12">K-12 Schools</option>
    <option value="other">Other Buildings</option>
    <option value="all">All Buildings</option>
  </select>
</div>


</section>

{/* KPI Cards */}
<section className="mb-6">
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
   <KPICard 
  title="District Avg ENERGY STAR Score"
  value={avgScore.value}
  trend={avgScore.trend}
  isUp={avgScore.isUp}
  icon={Target}
  subtitle={districtScoreSubtitle}
/>

    <KPICard
  title="District Average EUI"
  value={districtAvgEuiDisplayValue}
  icon={Zap}
  subtitle={
    <>
      {districtEuiSubtitle}
      {euiDebug?.nationalEui && (
        <div className="text-xs text-gray-500">
          Nat. Median: {euiDebug.nationalEui.median_eui_kbtu_ft2} •
          Mean: {euiDebug.nationalEui.mean_eui_kbtu_ft2}
        </div>
      )}
    </>
  }
/>



    <KPICard
  title="Total Energy"
  value={totalEnergy.value}
  trend={totalEnergy.trend}
  isUp={totalEnergy.isUp}
  icon={Zap}
/>

  
 {/* Total Annual Cost (rolling 12 months) */}
<KPICard
  title="Total Annual Cost"
  value={annualCost.value}
  trend={annualCost.trend}
  isUp={annualCost.isUp}
  icon={DollarSign}
/>

  </div>
</section>

<section className="mb-6">
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
    <DeltaKPICard
      title="District Avg ENERGY STAR Score Change"
      value={scoreChangeCard.value}
      primaryContent={
        <div className="flex items-center gap-2">
          <span className="text-3xl font-bold text-gray-900">{scoreChangeCard.previousValue}</span>
          <span
            className={
              scoreChangeCard.isIncrease == null
                ? "text-gray-500"
                : scoreChangeCard.isIncrease
                ? "text-green-600"
                : "text-red-600"
            }
          >
            {scoreChangeCard.isIncrease == null ? "→" : scoreChangeCard.isIncrease ? "↑" : "↓"}
          </span>
          <span className="text-3xl font-bold text-gray-900">{scoreChangeCard.currentValue}</span>
        </div>
      }
      changeText={scoreChangeCard.changeText}
      isIncrease={scoreChangeCard.isIncrease}
      increaseIsGood={true}
      subtitle={scoreChangeCard.subtitle}
      icon={Target}
    />
    <DeltaKPICard
      title="District Average EUI Change"
      value={euiChangeCard.value}
      primaryContent={
        <div className="flex items-center gap-2">
          <span className="text-3xl font-bold text-gray-900">{euiChangeCard.previousValue}</span>
          <span
            className={
              euiChangeCard.isIncrease == null
                ? "text-gray-500"
                : euiChangeCard.isIncrease
                ? "text-red-600"
                : "text-green-600"
            }
          >
            {euiChangeCard.isIncrease == null ? "→" : euiChangeCard.isIncrease ? "↑" : "↓"}
          </span>
          <span className="text-3xl font-bold text-gray-900">{euiChangeCard.currentValue}</span>
        </div>
      }
      changeText={euiChangeCard.changeText}
      isIncrease={euiChangeCard.isIncrease}
      increaseIsGood={false}
      subtitle={euiChangeCard.subtitle}
      icon={Zap}
    />
    <DeltaKPICard
      title="Total Energy (MoM)"
      value={totalEnergyMoMCard.value}
      changeText={totalEnergyMoMCard.changeText}
      isIncrease={totalEnergyMoMCard.isIncrease}
      subtitle={totalEnergyMoMCard.subtitle}
      icon={Zap}
    />
    <DeltaKPICard
      title="Real Dollars"
      value={realDollarsCard.value}
      primaryContent={
        <div>
          <p className="text-xs text-gray-500">{realDollarsRangeText}</p>
          <p className={`text-3xl font-bold ${realDollarsCard.valueClassName}`}>{realDollarsCard.value}</p>
          <p className="text-xs mt-1">
            <span className="text-gray-500">Electric:</span>{" "}
            <span className={realDollarsCard.electricLine.className}>{realDollarsCard.electricLine.text}</span>
          </p>
          <p className="text-xs">
            <span className="text-gray-500">Gas:</span>{" "}
            <span className={realDollarsCard.gasLine.className}>{realDollarsCard.gasLine.text}</span>
          </p>
        </div>
      }
      changeText={realDollarsCard.changeText}
      isIncrease={realDollarsCard.isIncrease}
      icon={DollarSign}
    />
  </div>
</section>



          {/* Monthly Cost Chart */}
<div className="bg-white rounded-lg shadow p-6 border border-gray-200 mb-6">
  <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
    <DollarSign className="h-5 w-5 text-blue-600" />
    <span>Monthly Total Spend</span>
  </h2>
  <ResponsiveContainer width="100%" height={300}>
    <BarChart
      data={
        monthlySpend.data.length
          ? monthlySpend.data
          : costData.map((d, i) => {
              // Fallback: fabricate labels and split total into electric + gas
              const base = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
              const d2 = new Date(
                base.getFullYear(),
                base.getMonth() - (costData.length - i),
                1
              );
              const mShort = d2.toLocaleString("en-US", { month: "short" });
              const yy = String(d2.getFullYear()).slice(-2);
              const total = Number(d.cost) || 0;
              return {
                label: `${mShort} ’${yy}`,
                electricCost: Math.round(total * 0.6),
                gasCost: Math.round(total * 0.4),
              };
            })
      }
    >
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="label" />
      <YAxis
        label={{ value: "Cost ($K)", angle: -90, position: "insideLeft" }}
      />
      <Tooltip
        labelFormatter={(l) => l}
        formatter={(value: any, name: any) => {
          const label =
            name === "electricCost"
              ? "Electric"
              : name === "gasCost"
              ? "Gas"
              : "Last Year Total";
          return [`$${value}K`, label];
        }}
      />

      {/* Bottom stack: Electric (green) */}
      <Bar dataKey="electricCost" stackId="a" fill="#22c55e" />

      {/* Top stack: Gas (yellow) with rounded top */}
      <Bar dataKey="gasCost" stackId="a" fill="#eab308" radius={[8, 8, 0, 0]} />

      {/* Overlay: same month last year total cost */}
      {monthlySpend.data.length > 0 && (
        <Line
          type="monotone"
          dataKey="lastYearTotalCost"
          stroke="#0f172a"
          strokeWidth={2}
          dot={{ r: 3 }}
          name="Last Year Total"
        />
      )}
    </BarChart>
  </ResponsiveContainer>
</div>


<div className="bg-white rounded-lg shadow p-6 border border-gray-200 mb-6">
  <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
    <Zap className="h-5 w-5 text-blue-600" />
    <span>Monthly Total Energy</span>
  </h2>
  <ResponsiveContainer width="100%" height={300}>
    <BarChart
      data={
        monthlyEnergy.data.length
          ? monthlyEnergy.data
          : trendData.map((d) => ({
              label: d.month,
              totalEnergy: Number(d.electricity ?? 0) + Number(d.gas ?? 0),
              lastYearTotalEnergy: 0,
            }))
      }
    >
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="label" />
      <YAxis
        label={{ value: "Energy (k kBtu)", angle: -90, position: "insideLeft" }}
      />
      <Tooltip
        labelFormatter={(l) => l}
        formatter={(value: any, name: any) => {
          const label = name === "totalEnergy" ? "Total Energy" : "Last Year Same Month";
          return [`${value}k kBtu`, label];
        }}
      />
      <Bar dataKey="totalEnergy" fill="#22c55e" radius={[8, 8, 0, 0]} />
      <Line
        type="monotone"
        dataKey="lastYearTotalEnergy"
        stroke="#111111"
        strokeWidth={2}
        dot={{ r: 3 }}
        name="Last Year Same Month"
      />
    </BarChart>
  </ResponsiveContainer>
</div>

<div className="bg-white rounded-lg shadow p-6 border border-gray-200 mb-6">
  <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
    <Zap className="h-5 w-5 text-blue-600" />
    <span>Monthly Average EUI (weather normalized)</span>
  </h2>
  <ResponsiveContainer width="100%" height={300}>
    <BarChart
      data={monthlyAverageEui.data}
    >
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



                 {/* Cost per SF Chart */}
      <div className="bg-white rounded-lg shadow p-6 border border-gray-200 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Annual Cost per Square Foot by School
        </h2>
        <ResponsiveContainer width="100%" height={350}>
          {annualCostPerSF.data.length > 0 && (
  <BarChart
    data={annualCostPerSF.data}
    layout="vertical"
    margin={{ left: 140 }}
  >

            <CartesianGrid strokeDasharray="3 3" />

            {/* X axis is the numeric cost */}
            <XAxis
  type="number"
  domain={[0, annualCostPerSFXMax]}
  tickFormatter={(v) => `$${v}`}
/>

            {/* Y axis shows the school names – apply NoWrapTick here */}
            <YAxis
  dataKey="name"
  type="category"
  width={140}
  interval={0}
  tick={
    <NoWrapTick
      format={(v) =>
        String(v)
          .replace(/\b(elementary|school)\b/gi, "")
          .replace(/\s+/g, " ")
          .trim()
      }
    />
  }
/>


            <Tooltip
  content={({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;
    const row = payload[0]?.payload as any;
    const current = Number(row?.costPerSF);
    const baseline = row?.baselineCostPerSF;
    return (
      <div className="bg-white p-3 border border-gray-300 rounded shadow-lg">
        <p className="font-semibold">{row?.name ?? "Building"}</p>
        <p className="text-sm">Current Annual $/SF: {Number.isFinite(current) ? `$${current}/sf` : "—"}</p>
        <p className="text-sm">Black Dot Baseline (Sep 2024-Aug 2025): {baseline == null ? "—" : `$${baseline}/sf`}</p>
      </div>
    );
  }}
/>
            <Bar dataKey="costPerSF" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            {annualCostPerSF.data.map((row: any, idx: number) =>
              row?.baselineCostPerSF == null ? null : (
                <ReferenceDot
                  key={`baseline-costsf-${idx}`}
                  x={row.baselineCostPerSF}
                  y={row.name}
                  r={4}
                  fill="#111111"
                  stroke="#111111"
                  ifOverflow="visible"
                />
              )
            )}
          </BarChart>
)}

        </ResponsiveContainer>
      </div>



      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* School Comparison */}
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">ENERGY STAR Score by School</h2>
          <ResponsiveContainer width="100%" height={350}>
            {energyStarBySchool.data.length > 0 && (
  <BarChart
    data={energyStarBySchool.data}
    layout="vertical"
    margin={{ left: 100, right: 20 }}
  >


              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} />
              <YAxis
  dataKey="name"
  type="category"
  width={140}
  interval={0}
  tick={
    <NoWrapTick
      format={(v) =>
        String(v)
          .replace(/\b(elementary|school)\b/gi, "")
          .replace(/\s+/g, " ")
          .trim()
      }
    />
  }
/>

              <Tooltip content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-white p-3 border border-gray-300 rounded shadow-lg">
                      <p className="font-semibold">{payload[0].payload.name}</p>
                      <p className="text-sm">Score: {payload[0].value}</p>
                      <p className="text-sm">EUI: {payload[0].payload.eui} kBtu/sf/yr</p>
                    </div>
                  );
                }
                return null;
              }} />
              <ReferenceLine x={50} stroke="#6b7280" strokeWidth={2} strokeDasharray="5 5" label={{ value: 'National Median', position: 'top', fill: '#6b7280', fontSize: 12 }} />
              <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                {(energyStarBySchool.data.length ? energyStarBySchool.data : schoolScores).map((entry, index) => (

                  <Cell key={`cell-${index}`} fill={getScoreColor(entry.score)} />
                ))}
              </Bar>
            </BarChart>
)}

          </ResponsiveContainer>
        </div>

        {/* Trend Line */}
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Monthly Energy Consumption Trend</h2>
          <ResponsiveContainer width="100%" height={350}>
  <LineChart
    data={
      monthlyEnergy.data.length
        ? monthlyEnergy.data
        : trendData // fallback to your sample if no data yet
    }
  >
    <CartesianGrid strokeDasharray="3 3" />
   <XAxis
  dataKey={monthlyEnergy.data.length ? "label" : "month"}
  interval={0}
  tickMargin={8}
  minTickGap={0}
  allowDataOverflow={true}
  height={36}                          // gives the label a little vertical room
  tickFormatter={(v: any) => String(v)} // ensure full label is rendered as-is
/>


    <YAxis label={{ value: 'kBtu (thousands)', angle: -90, position: 'insideLeft' }} />
    <Tooltip
      formatter={(v: any, k: any) => [`${v}k kBtu`, k]}
      labelFormatter={(l: any) => l}
    />
    <Legend />
    <Line type="monotone" dataKey="electricity" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} name="Electricity" />
    <Line type="monotone" dataKey="gas"         stroke="#f59e0b" strokeWidth={3} dot={{ r: 4 }} name="Natural Gas" />
  </LineChart>
</ResponsiveContainer>

        </div>
      </div>

      {/* Secondary Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Energy Mix */}
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Energy Mix</h2>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
             <Pie
  data={energyMixHook.data.length ? energyMixHook.data : energyMixFallback}
  cx="50%"
  cy="50%"
  innerRadius={60}
  outerRadius={90}
  paddingAngle={2}
  dataKey="value"
>
  {(energyMixHook.data.length ? energyMixHook.data : energyMixFallback).map((entry, index) => (
    <Cell key={`cell-${index}`} fill={entry.color} />
  ))}
</Pie>
<Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-4 space-y-2">
  {(energyMixHook.data.length ? energyMixHook.data : energyMixFallback).map((item) => (
    <div key={item.name} className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
        <span className="text-gray-700">{item.name}</span>
      </div>
      <span className="font-medium text-gray-900">{item.value}%</span>
    </div>
  ))}
</div>
        </div>

        {/* Performance Grid */}
<div className="bg-white rounded-lg shadow p-6 border border-gray-200 lg:col-span-2">
  <h2 className="text-lg font-semibold text-gray-900 mb-4">Performance Overview Grid</h2>
  <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
    {perfRows.length > 0 &&
  perfRows.map((school) => {

      const hasScore = Number.isFinite(school.score);
      const color = hasScore ? getScoreColor(school.score) : "#6b7280"; // gray if no score yet
      const card = (
        <div
          className="p-4 rounded-lg border-2 transition-all hover:shadow-md cursor-pointer"
          style={{
            backgroundColor: `${color}15`,
            borderColor: color
          }}
          title={`${school.name}
${hasScore ? `Score: ${school.score}\n` : ""}${school.eui ? `EUI: ${school.eui} kBtu/sf/yr\n` : ""}${school.costPerSF != null ? `Cost: $${school.costPerSF}/sf` : ""}`}
        >
          <div className="text-xs font-medium text-gray-700 mb-1 truncate">
            {school.name}
          </div>

          <div className="flex items-baseline gap-2">
            <div className="text-2xl font-bold" style={{ color }}>
              {hasScore ? school.score : "—"}
            </div>
            <span className="text-[10px] uppercase tracking-wide text-gray-500">Score</span>
          </div>

          {school.eui != null && (
            <div className="text-xs text-gray-600 mt-1">
              EUI: {school.eui} kBtu/sf/yr
            </div>
          )}

          {school.costPerSF != null && (
            <div className="text-xs text-gray-600">
              Cost: ${school.costPerSF}/sf
            </div>
          )}
        </div>
      );

      if (school.id) {
        return (
          <Link key={`${school.id}-${school.name}`} href={`/buildings/${school.id}`}>
            {card}
          </Link>
        );
      }

      return (
        <div key={school.name}>
          {card}
        </div>
      );
    })}
  </div>
</div>

      </div>

           {/* Leaderboard */}
      <div className="bg-white rounded-lg shadow p-6 border border-gray-200 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Performers</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
  {leaderboardRows.length > 0 &&
    leaderboardRows.map((school, idx) => (
      <div
        key={school.name}
        className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
      >

              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">
                {idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">
                  {school.name}
                </div>
                <div className="text-xs text-gray-600">
                  Score: {Number.isFinite(school.score) ? school.score : "—"}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

<div className="bg-white rounded-lg shadow p-6 border border-gray-200 mb-6">
  <h2 className="text-lg font-semibold text-gray-900 mb-1">Building Cost YoY by Month (Compact)</h2>
  <p className="text-xs text-gray-500 mb-4">Current month values are red when higher than last year and green when lower.</p>
  <div className="overflow-x-auto">
    <table className="min-w-[1160px] w-full text-sm border-collapse">
      <thead>
        <tr className="border-b border-gray-200">
          <th className="text-left py-2 pr-4 sticky left-0 bg-white z-10">Building</th>
          {buildingSpendYoY.months.map((m: any) => (
            <th key={m.key} className="text-left py-2 px-3 min-w-[220px]">{m.label}</th>
          ))}
          <th className="text-left py-2 px-3 min-w-[210px] sticky right-0 bg-white z-10">Total</th>
        </tr>
      </thead>
      <tbody>
        {buildingSpendYoY.rows.map((r: any) => {
          const rowElecCY = r.byMonth.reduce((s: number, m: any) => s + Number(m.electric.cy ?? 0), 0);
          const rowElecPY = r.byMonth.reduce((s: number, m: any) => s + Number(m.electric.py ?? 0), 0);
          const rowGasCY = r.byMonth.reduce((s: number, m: any) => s + Number(m.gas.cy ?? 0), 0);
          const rowGasPY = r.byMonth.reduce((s: number, m: any) => s + Number(m.gas.py ?? 0), 0);
          const rowTotalCY = rowElecCY + rowGasCY;
          const rowTotalPY = rowElecPY + rowGasPY;
          const rowTotalDelta = rowTotalCY - rowTotalPY;
          const rowTotalSavings = rowTotalPY - rowTotalCY;
          return (
          <tr key={r.buildingId} className="border-b border-gray-100 align-top">
            <td className="py-2 pr-4 font-medium text-gray-900 sticky left-0 bg-white z-10">{r.name}</td>
            {r.byMonth.map((m: any) => (
              <td key={m.key} className="py-2 px-3">
                <div className="text-xs">
                  <span className="text-gray-500">E </span>
                  <span className={spendCellToneClass(m.electric.cy, m.electric.py)}>{fmtMoneyCompact(m.electric.cy)}</span>
                  <span className="text-gray-400"> vs {fmtMoneyCompact(m.electric.py)} </span>
                  <span className={spendCellToneClass(m.electric.cy, m.electric.py)}>({spendDeltaText(m.electric.delta)})</span>
                </div>
                <div className="text-xs mt-1">
                  <span className="text-gray-500">G </span>
                  <span className={spendCellToneClass(m.gas.cy, m.gas.py)}>{fmtMoneyCompact(m.gas.cy)}</span>
                  <span className="text-gray-400"> vs {fmtMoneyCompact(m.gas.py)} </span>
                  <span className={spendCellToneClass(m.gas.cy, m.gas.py)}>({spendDeltaText(m.gas.delta)})</span>
                </div>
              </td>
            ))}
            <td className="py-2 px-3 sticky right-0 bg-white z-10 border-l border-gray-200">
              <div className="text-xs font-semibold">
                <span className={spendCellToneClass(rowTotalCY, rowTotalPY)}>{fmtMoneyCompact(rowTotalCY)}</span>
                <span className="text-gray-400"> vs {fmtMoneyCompact(rowTotalPY)} </span>
                <span className={spendCellToneClass(rowTotalCY, rowTotalPY)}>({spendDeltaText(rowTotalDelta)})</span>
              </div>
              <div className="text-xs mt-1">
                <span className="text-gray-500">Savings: </span>
                <span className={rowTotalSavings >= 0 ? "text-green-600" : "text-red-600"}>
                  {rowTotalSavings >= 0 ? "" : "-"}{fmtMoneyCompact(Math.abs(rowTotalSavings))}
                </span>
              </div>
            </td>
          </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr className="border-t-2 border-gray-300 bg-gray-50 align-top">
          <td className="py-2 pr-4 font-semibold text-gray-900 sticky left-0 bg-gray-50 z-10">Grand Total</td>
          {buildingSpendYoY.months.map((m: any) => {
            const monthElecCY = buildingSpendYoY.rows.reduce((s: number, r: any) => {
              const cell = (r.byMonth ?? []).find((x: any) => x.key === m.key);
              return s + Number(cell?.electric?.cy ?? 0);
            }, 0);
            const monthElecPY = buildingSpendYoY.rows.reduce((s: number, r: any) => {
              const cell = (r.byMonth ?? []).find((x: any) => x.key === m.key);
              return s + Number(cell?.electric?.py ?? 0);
            }, 0);
            const monthGasCY = buildingSpendYoY.rows.reduce((s: number, r: any) => {
              const cell = (r.byMonth ?? []).find((x: any) => x.key === m.key);
              return s + Number(cell?.gas?.cy ?? 0);
            }, 0);
            const monthGasPY = buildingSpendYoY.rows.reduce((s: number, r: any) => {
              const cell = (r.byMonth ?? []).find((x: any) => x.key === m.key);
              return s + Number(cell?.gas?.py ?? 0);
            }, 0);
            const monthCY = monthElecCY + monthGasCY;
            const monthPY = monthElecPY + monthGasPY;
            const monthDelta = monthCY - monthPY;
            return (
              <td key={m.key} className="py-2 px-3">
                <div className="text-xs font-semibold">
                  <span className={spendCellToneClass(monthCY, monthPY)}>{fmtMoneyCompact(monthCY)}</span>
                  <span className="text-gray-400"> vs {fmtMoneyCompact(monthPY)} </span>
                  <span className={spendCellToneClass(monthCY, monthPY)}>({spendDeltaText(monthDelta)})</span>
                </div>
              </td>
            );
          })}
          <td className="py-2 px-3 sticky right-0 bg-gray-50 z-10 border-l border-gray-200">
            {(() => {
              const totalCY = buildingSpendYoY.rows.reduce(
                (sum: number, r: any) =>
                  sum +
                  r.byMonth.reduce(
                    (inner: number, cell: any) =>
                      inner + Number(cell.electric.cy ?? 0) + Number(cell.gas.cy ?? 0),
                    0
                  ),
                0
              );
              const totalPY = buildingSpendYoY.rows.reduce(
                (sum: number, r: any) =>
                  sum +
                  r.byMonth.reduce(
                    (inner: number, cell: any) =>
                      inner + Number(cell.electric.py ?? 0) + Number(cell.gas.py ?? 0),
                    0
                  ),
                0
              );
              const totalDelta = totalCY - totalPY;
              const totalSavings = totalPY - totalCY;
              return (
                <>
                  <div className="text-xs font-semibold">
                    <span className={spendCellToneClass(totalCY, totalPY)}>{fmtMoneyCompact(totalCY)}</span>
                    <span className="text-gray-400"> vs {fmtMoneyCompact(totalPY)} </span>
                    <span className={spendCellToneClass(totalCY, totalPY)}>({spendDeltaText(totalDelta)})</span>
                  </div>
                  <div className="text-xs mt-1 font-semibold">
                    <span className="text-gray-600">Total Savings: </span>
                    <span className={totalSavings >= 0 ? "text-green-600" : "text-red-600"}>
                      {totalSavings >= 0 ? "" : "-"}{fmtMoneyCompact(Math.abs(totalSavings))}
                    </span>
                  </div>
                </>
              );
            })()}
          </td>
        </tr>
      </tfoot>
    </table>
  </div>
</div>


          {/* Savings Calculator */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg shadow-lg p-6 border-2 border-blue-200">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Potential Savings Calculator</h2>
            <p className="text-sm text-gray-600">
              Calculate savings if all schools performed below the national median EUI
            </p>
          </div>
          <div className="bg-white rounded-lg px-4 py-2 border border-blue-300">
            <div className="text-xs text-gray-600">National Median EUI</div>
            <div className="text-lg font-bold text-blue-600">
              {safeNationalMedianEUI.toFixed(1)} kBtu/sf/yr
            </div>
            <div className="text-xs text-gray-500 mt-1">ENERGY STAR K-12</div>
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <label className="text-sm font-semibold text-gray-700">
              Target: {savingsTarget}% below national median
            </label>
            <div className="text-right">
              <div className="text-xs text-gray-600">Target EUI</div>
              <div className="text-xl font-bold text-blue-600">
                {targetEUI.toFixed(1)} kBtu/sf/yr
              </div>
            </div>
          </div>

          <input
            type="range"
            min="5"
            max="30"
            step="1"
            value={savingsTarget}
            onChange={(e) => setSavingsTarget(Number(e.target.value))}
            className="w-full h-3 bg-blue-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />

          <div className="flex justify-between text-xs text-gray-500 mt-2">
            <span>5%</span>
            <span>15%</span>
            <span>30%</span>
          </div>
        </div>

        <div className="bg-white rounded-lg p-5 border-2 border-green-200">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="text-green-600" size={20} />
            <h3 className="text-sm font-semibold text-gray-700">Annual Cost Savings</h3>
          </div>

          <div className="text-3xl font-bold text-green-600">
            ${(costSavings / 1000).toFixed(0)}K
          </div>

          <div className="text-xs text-gray-600 mt-1">
            {kBtuSavings.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} kBtu/year
          </div>

          {/* Tiny blended rate line */}
          <div className="text-xs text-gray-500 mt-1">
            Based on blended electricity rate:{" "}
            {blendedElectricRate
              ? `$${blendedElectricRate.toFixed(3)}/kWh`
              : "$0.15/kWh (default)"}
          </div>

          <div className="bg-white rounded-lg p-5 border-2 border-amber-200 mt-4">
            <div className="flex items-center gap-2 mb-2">
              <Target className="text-amber-600" size={20} />
              <h3 className="text-sm font-semibold text-gray-700">
                Schools Needing Improvement
              </h3>
            </div>
            <div className="text-3xl font-bold text-amber-600">
              {schoolsNeedingImprovement} of 12
            </div>
            <div className="text-xs text-gray-600 mt-1">
              Currently above target EUI
            </div>
          </div>
        </div>

        <div className="mt-6 bg-blue-100 rounded-lg p-4 border border-blue-300">
          <div className="flex items-start gap-3">
            <div className="bg-blue-600 rounded-full p-2 mt-0.5">
              <svg
                className="w-4 h-4 text-white"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-blue-900 mb-1">
                Benchmark Context:
              </h4>
              <p className="text-sm text-blue-800">
                The national median EUI of {safeNationalMedianEUI.toFixed(1)} kBtu/sf/yr
                is based on ENERGY STAR&apos;s database of K-12 schools across the
                country, adjusted for climate and building characteristics. Focus
                efficiency efforts on the {schoolsNeedingImprovement} schools above{" "}
                {targetEUI.toFixed(1)} kBtu/sf/yr through HVAC optimization, lighting
                upgrades, and building envelope improvements.
              </p>
            </div>
          </div>
        </div>
      </div>

            {/* Portfolio Manager: Create Properties + Sync Meters */}
      <section className="mt-10">
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Portfolio Manager Setup
          </h2>

          {/* Step 1: Properties */}
          <p className="text-sm text-gray-600 mb-4">
            Step 1: Create or refresh Portfolio Manager properties for all buildings
            in this organization. Run this after resetting your PM test account.
          </p>

          <button
            type="button"
            onClick={handleCreatePmPropertiesForOrg}
            disabled={creatingPmProps}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium
                       hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creatingPmProps
              ? "Creating properties…"
              : "Create PM Properties for All Buildings"}
          </button>

          {pmPropsMessage && (
            <p className="mt-3 text-sm text-gray-700">{pmPropsMessage}</p>
          )}

          {/* Step 2: Meters */}
          <div className="mt-6 border-t border-gray-200 pt-4">
            <p className="text-sm text-gray-600 mb-3">
              Step 2: Create or sync meters in Portfolio Manager for each building.
              Run this after Step 1 so every building has a PM property before you
              attach meters.
            </p>

            <button
              type="button"
              onClick={handleSyncPmMeters}
              disabled={syncingMeters}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium
                         hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-wait"
            >
              {syncingMeters
                ? "Syncing meters…"
                : "Sync PM Meters for All Buildings"}
            </button>

            {meterSyncMessage && (
              <p className="mt-3 text-sm text-gray-700">{meterSyncMessage}</p>
            )}
          </div>
        </div>
      </section>

    </div>
  );
};

export default EnergyDashboard;
