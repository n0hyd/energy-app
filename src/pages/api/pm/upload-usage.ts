// /src/pages/api/pm/upload-usage.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { Buffer } from "buffer";

function getSupabase() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

// --- tiny logger helpers (avoid noisy megabytes) ---
function log(...args: any[]) {
  // eslint-disable-next-line no-console
  console.log("[upload-usage]", ...args);
}




function usageForPm(
  meter: any,
  row: any
): number {
  const kwh = Number(row?.usage_kwh ?? 0);
  const mmbtu = Number(row?.usage_mmbtu ?? 0);
  const therms = Number(row?.therms ?? 0);
  const mcf = Number(row?.usage_mcf ?? 0);

  // Decide meter fuel/type. Use whatever your meter object actually has.
  const fuel = String(meter?.type ?? "").toLowerCase();

  const isGas =
    fuel.includes("gas") ||
    fuel.includes("natural") ||
    fuel.includes("ng");

  if (!isGas) {
    // ELECTRIC (and everything else): keep kWh
    return kwh;
  }

  // GAS: return a "best available" value from the row.
  // Final unit conversion happens later based on PM unitOfMeasure.
  if (mmbtu > 0) return mmbtu;
  if (mcf > 0) return mcf;
  if (therms > 0) return therms;
  return 0;
}




async function getPmMeterUnit(pmMeterId: string): Promise<string> {
  const { res, text } = await pmRequest(
    `/meter/${encodeURIComponent(pmMeterId)}`,
    { method: "GET" }
  );

  if (!res.ok) {
    throw new Error(
      `Failed to GET meter ${pmMeterId} to read unitOfMeasure: ${res.status} ${res.statusText} ${text}`
    );
  }

  // Match <unitOfMeasure>kWh</unitOfMeasure>
  // Also supports namespaced tags like <ns2:unitOfMeasure>
  const match = text.match(
    /<(?:[\w-]+:)?unitOfMeasure>([\s\S]*?)<\/(?:[\w-]+:)?unitOfMeasure>/i
  );

  if (!match) {
    throw new Error(
      `PM meter ${pmMeterId} XML missing <unitOfMeasure>. First 300 chars: ${text.slice(0, 300)}`
    );
  }

  return match[1].trim();
}


// ---------- Portfolio Manager client ----------

const PM_BASE_URL =
  process.env.PM_BASE_URL ||
  "https://portfoliomanager.energystar.gov/wstest";

const PM_USERNAME = process.env.PM_USERNAME;
const PM_PASSWORD = process.env.PM_PASSWORD;

function getPmAuthHeader() {
  if (!PM_USERNAME || !PM_PASSWORD) {
    throw new Error("Missing PM_USERNAME or PM_PASSWORD env vars.");
  }
  const token = Buffer.from(`${PM_USERNAME}:${PM_PASSWORD}`).toString("base64");
  return `Basic ${token}`;
}

async function pmRequest(
  path: string,
  init: RequestInit & { expectXml?: boolean } = {}
) {
  const url = `${PM_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    Authorization: getPmAuthHeader(),
    "Content-Type": "application/xml",
    Accept: "application/xml",
    ...(init.headers as any),
  };

  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  return { res, text };
}

// Ensure the PM meter <firstBillDate> is <= the earliest bill start date
async function ensureMeterInServiceDate(pmMeterId: string, firstStartDateYmd: string) {
  const desired = String(firstStartDateYmd).slice(0, 10); // "YYYY-MM-DD"
  const path = `/meter/${encodeURIComponent(pmMeterId)}`;

  // GET existing meter XML
  const { res, text } = await pmRequest(path, { method: "GET" });

  if (!res.ok) {
    throw new Error(
      `Failed to GET meter ${pmMeterId} before setting firstBillDate: ${res.status} ${res.statusText} ${text}`
    );
  }

  const existingXml = text;

  const meterCore = {
    id: mustTag(existingXml, "id"),
    type: mustTag(existingXml, "type"),
    name: mustTag(existingXml, "name"),
    metered: mustTag(existingXml, "metered"),
    unitOfMeasure: mustTag(existingXml, "unitOfMeasure"),
    inUse: mustTag(existingXml, "inUse"),
    inactiveDate: optTag(existingXml, "inactiveDate"),
    otherDescription: optTag(existingXml, "otherDescription"),
  };

  // If current firstBillDate is already <= desired, skip
  const match = existingXml.match(/<firstBillDate>(.*?)<\/firstBillDate>/);
  if (match) {
    const current = String(match[1] ?? "").slice(0, 10);
    if (current && current <= desired) {
      log("firstBillDate already OK (<= desired), skipping PUT", {
        pmMeterId,
        current,
        desired,
      });
      return;
    }
  }

  // PUT updated meter XML (minimal but "complete enough" for PM)
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<meter>
  <id>${meterCore.id}</id>
  <type>${meterCore.type}</type>
  <name>${escapeXml(meterCore.name)}</name>
  <metered>${meterCore.metered}</metered>
  <unitOfMeasure>${meterCore.unitOfMeasure}</unitOfMeasure>
  <inUse>${meterCore.inUse}</inUse>
  ${meterCore.inactiveDate ? `<inactiveDate>${meterCore.inactiveDate}</inactiveDate>` : ""}
  ${meterCore.otherDescription ? `<otherDescription>${escapeXml(meterCore.otherDescription)}</otherDescription>` : ""}
  <firstBillDate>${desired}</firstBillDate>
</meter>`;

  const put = await pmRequest(path, { method: "PUT", body });

  if (!put.res.ok) {
    throw new Error(
      `Failed to set firstBillDate for meter ${pmMeterId} to ${desired}: ${put.res.status} ${put.res.statusText} ${put.text}`
    );
  }

  log("Updated firstBillDate", { pmMeterId, firstBillDate: desired });
}

// Convert a canonical usage row into whatever unit the PM meter is configured for
function usageForPmUnit(pmUnitOfMeasure: string, row: any): number {
  const unit = String(pmUnitOfMeasure || "").toLowerCase();

  const kwh = Number(row?.usage_kwh ?? 0);
  const mmbtu = Number(row?.usage_mmbtu ?? 0);
  const therms = Number(row?.therms ?? 0);
  const mcf = Number(row?.usage_mcf ?? 0);

  if (unit.includes("kwh")) return Math.round(kwh);

  if (unit.includes("kbtu")) {
    if (mmbtu > 0) return Math.round(mmbtu * 1000); // MMBtu → kBtu
    if (therms > 0) return Math.round(therms * 100); // therms → kBtu
    if (mcf > 0) return Math.round(mcf * 1037); // mcf → kBtu approx
    return 0;
  }

  if (unit.includes("therm")) return Math.round(therms);
  if (unit.includes("mcf")) return Math.round(mcf);

  throw new Error(`Unsupported PM unitOfMeasure "${pmUnitOfMeasure}" for upload`);
}


// Read the PM meter's unitOfMeasure so we upload consumption in the correct unit
async function getPmMeterUnitOfMeasure(pmMeterId: string): Promise<string> {
  const path = `/meter/${encodeURIComponent(pmMeterId)}`;
  const { res, text } = await pmRequest(path, { method: "GET" });

  if (!res.ok) {
    throw new Error(
      `Failed to GET meter ${pmMeterId} to read unitOfMeasure: ${res.status} ${res.statusText} ${text}`
    );
  }

  // Support optional XML namespace prefixes like <ns2:unitOfMeasure>...</ns2:unitOfMeasure>
  const m = text.match(/<(?:[\w-]+:)?unitOfMeasure>([\s\S]*?)<\/(?:[\w-]+:)?unitOfMeasure>/i);
  if (m && m[1]) return m[1].trim();

  // Helpful debug if PM returns an unexpected payload
  const snippet = String(text || "").slice(0, 500);
  throw new Error(
    `PM meter ${pmMeterId} response did not include <unitOfMeasure>. First 500 chars: ${snippet}`
  );
}

// Fetch existing PM consumption periods so we can skip duplicates on the PM side as a backup
async function getExistingConsumptionPeriods(pmMeterId: string) {
  const path = `/meter/${encodeURIComponent(pmMeterId)}/consumptionData`;
  try {
    const { res, text } = await pmRequest(path, { method: "GET" });

    if (!res.ok) {
      if (res.status === 404) {
        // No consumption data yet for this meter
        log("no existing consumption data in PM", { pmMeterId });
        return [];
      }
      console.error(
        `Failed to GET existing consumption for meter ${pmMeterId}: ${res.status} ${res.statusText} ${text}`
      );
      return [];
    }

    const periods: { startDate: string; endDate: string }[] = [];
    const regex =
      /<meterConsumptionData[\s\S]*?<startDate>(.*?)<\/startDate>[\s\S]*?<endDate>(.*?)<\/endDate>/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const start = match[1]?.trim().slice(0, 10);
      const end = match[2]?.trim().slice(0, 10);
      if (start && end) {
        periods.push({ startDate: start, endDate: end });
      }
    }

    return periods;
  } catch (err: any) {
    console.error("Error while fetching existing consumption data", {
      pmMeterId,
      error: String(err),
    });
    return [];
  }
}

// ---------- Helpers ----------

function ymdToDate(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function addDaysYmd(ymd: string, days: number) {
  const dt = ymdToDate(ymd);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function isFirstOfMonth(ymd: string) {
  return ymd.endsWith("-01");
}

// Treat ends as equivalent if they are equal OR differ by exactly 1 day and one is the first of a month.
// This covers 2025-09-30 vs 2025-10-01.
function endDatesEquivalent(existingEnd: string, attemptedEnd: string) {
  if (existingEnd === attemptedEnd) return true;

  // If attempted is +1 day from existing and attempted is first of month → equivalent
  if (addDaysYmd(existingEnd, 1) === attemptedEnd && isFirstOfMonth(attemptedEnd)) return true;

  // Or if existing is +1 day from attempted and existing is first of month → equivalent
  if (addDaysYmd(attemptedEnd, 1) === existingEnd && isFirstOfMonth(existingEnd)) return true;

  return false;
}


// parse optional startDate / endDate (YYYY-MM-DD); if omitted → "all time"
function parseDateParam(v: unknown): string | null {
  const s = (v ?? "").toString().trim();
  if (!s || s.toLowerCase() === "null" || s.toLowerCase() === "undefined") {
    return null;
  }
  return s;
}

function isUuidLike(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    s
  );
}

function optTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].trim() : null;
}

function mustTag(xml: string, tag: string): string {
  const v = optTag(xml, tag);
  if (!v) throw new Error(`PM meter XML missing required <${tag}> tag`);
  return v;
}

function escapeXml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}


// ---------- API Handler ----------

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const { orgId, startDate: startDateParam, endDate: endDateParam } =
      req.query;

    if (!orgId || typeof orgId !== "string") {
      return res
        .status(400)
        .json({ ok: false, error: "orgId (UUID) query param is required" });
    }

    if (!isUuidLike(orgId)) {
      return res
        .status(400)
        .json({ ok: false, error: "orgId must be a UUID string" });
    }

    const startParam = parseDateParam(startDateParam);
    const endParam = parseDateParam(endDateParam);

        const now = new Date();
    const defaultEnd = now.toISOString().slice(0, 10); // today
    const defaultStart = "1900-01-01"; // all time (upload everything unless a startDate is provided)


    const startDate = startParam ?? defaultStart;
    const endDate = endParam ?? defaultEnd;

    log("starting upload", { orgId, startDate, endDate });

log("RUNNING FILE VERSION", { marker: "upload-usage.ts 2025-12-17 A" });

    const sb = getSupabase();

    // 1️⃣ Buildings for this org
    const { data: bldgs, error: bErr } = await sb
      .from("buildings")
      .select("id")
      .eq("org_id", orgId);

    if (bErr) {
      log("buildings error", bErr);
      throw bErr;
    }

    const buildingIds = (bldgs ?? []).map((b: any) => b.id);
    if (!buildingIds.length) {
      log("no buildings for org; nothing to upload");
      return res.status(200).json({
        ok: true,
        message: "No buildings for org; nothing to upload.",
        meters: 0,
        totalRecords: 0,
        results: [],
      });
    }

    // 2️⃣ Meters that are linked to PM (have pm_meter_id) and belong to those buildings
    const { data: pmMeters, error: mErr } = await sb
      .from("meters")
       .select("id, building_id, pm_meter_id, type")

      .in("building_id", buildingIds)
      .not("pm_meter_id", "is", null);

    if (mErr) {
      log("meters error", mErr);
      throw mErr;
    }

    if (!pmMeters?.length) {
      log("no PM-linked meters for org; nothing to upload");
      return res.status(200).json({
        ok: true,
        message: "No PM-linked meters for this org.",
        meters: 0,
        totalRecords: 0,
        results: [],
      });
    }

    const meterById = new Map<string, any>();
    for (const m of pmMeters) {
      meterById.set(m.id, m);
    }

    const meterIds = pmMeters.map((m) => m.id);

// 3️⃣ Usage + bills for those meters - PAGINATED
let allBills: any[] = [];
let page = 0;
const pageSize = 1000;
let hasMore = true;

while (hasMore) {
  const { data: pageBills, error: billsErr } = await sb
    .from("bills")
    .select(`
      id,
      meter_id,
      period_start,
      period_end,
      total_cost,
      utility_provider,
      pm_synced,
      usage_readings:usage_readings!usage_readings_bill_id_fkey (
        usage_kwh,
        therms,
        usage_mcf,
        usage_mmbtu
      )
    `)
    .in("meter_id", meterIds)
    .gte("period_end", startDate)
    .lte("period_start", endDate)
    .order("period_start", { ascending: true })
    .range(page * pageSize, (page + 1) * pageSize - 1);

  if (billsErr) throw billsErr;

  allBills = allBills.concat(pageBills ?? []);
  hasMore = (pageBills?.length ?? 0) === pageSize;
  page++;
  
  log(`Fetched page ${page}, total bills so far: ${allBills.length}`);
}

const bills = allBills;

// 🔍 TRACK SPECIFIC BILL
const TRACK_BILL_ID = "bb18c5c4-3e3c-48a4-8eed-037f0c759fe6";
const trackedBill = bills?.find((b: any) => b.id === TRACK_BILL_ID);

log("🔍 TRACK: Bill in initial query?", {
  billId: TRACK_BILL_ID,
  found: !!trackedBill,
  billDetails: trackedBill ? {
    meterId: trackedBill.meter_id,
    periodStart: trackedBill.period_start,
    periodEnd: trackedBill.period_end,
    pmSynced: trackedBill.pm_synced,
    provider: trackedBill.utility_provider,
  } : null,
});

// ADD THIS DEBUG BLOCK:
log("DEBUG all bills fetched from DB", {
  totalBills: bills?.length ?? 0,
  bills: bills?.map((b: any) => ({
    id: b.id,
    meterId: b.meter_id,
    periodStart: b.period_start,
    periodEnd: b.period_end,
    pmSynced: b.pm_synced,
    provider: b.utility_provider,
  })),
});
    
    if (!bills?.length) {
      log("no bills in date range; nothing to upload");

      return res.status(200).json({
        ok: true,
        message:
          "No usage records found in date range for bills that are not yet synced to PM.",
        meters: 0,
        totalRecords: 0,
        results: [],
      });
    }

// 🔍 DEBUG — check whether September 2025 bills are in usageRows
const DEBUG_PM_METER = "25325560";
const DEBUG_BILL_IDS = new Set([
  "912a12d6-cadf-4019-a340-d35d7f4837c3", // Sep WoodRiver
  "a18e529b-895a-4b40-a48a-54bb48168704", // Sep KGS
]);

const hits = (bills as any[]).filter((b) =>
  DEBUG_BILL_IDS.has(String(b?.id))
);

log("DEBUG bills contains Sep bills?", {
  count: hits.length,
  hits: hits.map((b) => ({
    billId: String(b.id),
    start: String(b.period_start).slice(0, 10),
    end: String(b.period_end).slice(0, 10),
    provider: b.utility_provider,
  })),
});

type ConsumptionRecord = {
  usage: number;
  startDate: string;
  endDate: string;
  cost?: number;
  billIds: string[]; // ✅ all bill IDs rolled up into this month

  // ✅ keep the canonical row so we can compute usage in PM's unitOfMeasure later
  sourceRow: any;
};

    const byPmMeter: Record<string, ConsumptionRecord[]> = {};

    const KANSAS_GAS_NAME = "Kansas Gas Service";

    // First group raw rows by meter + billing month (YYYY-MM)
    const groups = new Map<string, any[]>();





  for (const bill of (bills ?? []) as any[]) {
  const meterId: string = bill.meter_id;
  const meter = meterById.get(meterId);

  // 🔍 TRACK
  if (bill.id === TRACK_BILL_ID) {
    log("🔍 TRACK: Processing bill in loop", {
      billId: bill.id,
      meterId,
      hasMeter: !!meter,
      hasPmMeterId: !!meter?.pm_meter_id,
      pmMeterId: meter?.pm_meter_id,
    });
  }

  if (!meter || !meter.pm_meter_id) {
    if (bill.id === TRACK_BILL_ID) {
      log("🔍 TRACK: FILTERED OUT - no PM meter", { billId: bill.id });
    }
    continue;
  }

  // Recreate the SAME `row` shape your grouping code expects
  const r = Array.isArray(bill.usage_readings)
  ? (bill.usage_readings[0] ?? {})
  : (bill.usage_readings ?? {});

const row = {
  usage_kwh: r.usage_kwh,
  therms: r.therms,
  usage_mcf: r.usage_mcf,
  usage_mmbtu: r.usage_mmbtu,
  bills: bill,
};


  const billingMonth = String(bill.period_start).slice(0, 7);
  const key = `${meterId}│${billingMonth}`;

if (DEBUG_BILL_IDS.has(String(bill.id))) {
  log("DEBUG grouping bill", {
    billId: String(bill.id),
    pmMeterId: String(meter.pm_meter_id),
    meterId,
    billingMonth,
    start: String(bill.period_start),
    end: String(bill.period_end),
    provider: bill.utility_provider,
    usage_kwh: r?.usage_kwh ?? null,
  });
}


  // 🔍 DEBUG — confirm September bills are grouped
  if (
    bill.id === "912a12d6-cadf-4019-a340-d35d7f4837c3" ||
    bill.id === "a18e529b-895a-4b40-a48a-54bb48168704"
  ) {
    log("DEBUG building groups: saw Sep bill", {
      billId: String(bill.id),
      meterId,
      pmMeterId: String(meter.pm_meter_id),
      billingMonth,
      start: String(bill.period_start).slice(0, 10),
      end: String(bill.period_end).slice(0, 10),
      key,
      // optional: prove usage came through
      mcf: row.usage_mcf,
      mmbtu: row.usage_mmbtu,
    });
  }

  const existing = groups.get(key);
  if (existing) {
    existing.push(row);
  } else {
    groups.set(key, [row]);
  }

// 🔴 DEBUG — confirm bill made it into a group
if (DEBUG_BILL_IDS.has(String(bill.id))) {
  log("DEBUG grouped bill", {
    billId: String(bill.id),
    key,
    meterId,
    pmMeterId: meter.pm_meter_id,
    billingMonth,
    rowsInGroup: groups.get(key)?.length ?? 0,
    usage_kwh: row?.usage_kwh ?? null,
    provider: bill.utility_provider,
    pm_synced: bill.pm_synced,
  });
}
  }


// ADD THIS DEBUG BLOCK:
log("DEBUG groups created", {
  totalGroups: groups.size,
  groupKeys: Array.from(groups.keys()),
  groupDetails: Array.from(groups.entries()).map(([key, rows]) => ({
    key,
    rowCount: rows.length,
    hasUnsynced: rows.some((r: any) => r?.bills?.pm_synced !== true),
  })),
});


    // Now collapse each group to a single ConsumptionRecord based on provider rules
    groups.forEach((rows) => {
  if (!rows.length) return;

  // 🔍 TRACK
  const hasTrackedBill = rows.some((r: any) => r.bills.id === TRACK_BILL_ID);
  if (hasTrackedBill) {
    log("🔍 TRACK: Bill in group", {
      billId: TRACK_BILL_ID,
      rowCount: rows.length,
      allBillIds: rows.map((r: any) => r.bills.id),
    });
  }

  
    


      const sampleBill = (rows[0] as any).bills;
      const billingMonth = String(sampleBill.period_start).slice(0, 7);

      const meterId: string = sampleBill.meter_id;
      const meter = meterById.get(meterId);

      if (!meter || !meter.pm_meter_id) {
        return;
      }

      const pmMeterId = String(meter.pm_meter_id);

// Only upload this meter+month if at least one bill in the group is not synced.
const hasUnsynced = rows.some((r: any) => r?.bills?.pm_synced !== true);

if (!hasUnsynced) {
  log("skip group; all bills already pm_synced", {
    pmMeterId,
    billingMonth,
    billIds: rows.map((r: any) => r.bills.id),
  });
  return;
}

if (pmMeterId === DEBUG_PM_METER) {
  const groupMonth = String(sampleBill.period_start).slice(0, 7);
  const groupKey = `${meterId}│${groupMonth}`;

  if (groupMonth >= "2025-08" && groupMonth <= "2025-10") {
    log("DEBUG grouping key (meterId|billingMonth)", {
      pmMeterId,
      meterId,
      groupMonth,
      groupKey,
      periodStart: String(sampleBill.period_start).slice(0, 10),
      periodEnd: String(sampleBill.period_end).slice(0, 10),
      rows: rows.length,
    });

    const spans = rows.map((r: any) => {
      const s = String(r.bills.period_start).slice(0, 10);
      const e = String(r.bills.period_end).slice(0, 10);
      return {
        billId: String(r.bills.id),
        provider: r.bills.utility_provider,
        start: s,
        end: e,
        startMonth: s.slice(0, 7),
        endMonth: e.slice(0, 7),
        pm_synced: r.bills.pm_synced,
        kwh: r.usage_kwh,
        mmbtu: r.usage_mmbtu,
        therms: r.therms,
        mcf: r.usage_mcf,
      };
    });

    log("DEBUG group rows (raw bills) for pmMeterId", { pmMeterId, spans });
  } // ✅ closes inner if (groupMonth...)
} // ✅ closes outer if (pmMeterId...)

      // Sum cost across all providers for this meter/month
      const totalCost = rows.reduce((sum, r: any) => {
        const c = r.bills.total_cost;
        return sum + (c != null ? Number(c) : 0);
      }, 0);

      // Choose canonical row for usage + dates

      // 1) Prefer Kansas Gas Service if present
      const kansasRows = rows.filter(
        (r: any) =>
          String(r.bills.utility_provider ?? "").toLowerCase() ===
          KANSAS_GAS_NAME.toLowerCase()
      );

      let canonicalRow: any;

      if (kansasRows.length > 0) {
        // Prefer Kansas Gas Service; if multiple, pick the one with latest period_end
        canonicalRow = kansasRows.reduce((latest: any, r: any) =>
          r.bills.period_end > latest.bills.period_end ? r : latest
        );
      } else if (rows.length === 1) {
        // 2) No KGS, single other provider → use that one for usage + cost
        canonicalRow = rows[0];
      } else {
        // 3) No KGS and multiple providers → pick the one with the largest usage-ish value
        canonicalRow = rows.reduce((best: any, r: any) => {
          const bestUsage =
            Number(best.usage_mmbtu ?? 0) ||
            Number(best.usage_mcf ?? 0) ||
            Number(best.therms ?? 0) ||
            Number(best.usage_kwh ?? 0) ||
            0;
          const thisUsage =
            Number(r.usage_mmbtu ?? 0) ||
            Number(r.usage_mcf ?? 0) ||
            Number(r.therms ?? 0) ||
            Number(r.usage_kwh ?? 0) ||
            0;
          return thisUsage > bestUsage ? r : best;
        });
      }

      const bill = (canonicalRow as any).bills;

     // ✅ Usage: avoid double-counting when carrier+supply both include usage.
// Take the max usage value across the grouped bills.
const fuel = String(meter?.type ?? "").toLowerCase();
const isGas = fuel.includes("gas") || fuel.includes("natural") || fuel.includes("ng");

const usage = isGas
  ? Math.max(...rows.map((r: any) => Number(r.usage_mmbtu ?? 0)), 0)
  : Math.max(...rows.map((r: any) => Number(r.usage_kwh ?? 0)), 0);





  
const nonKgsEnds = rows
  .filter((r: any) =>
    String(r.bills.utility_provider ?? "").toLowerCase() !== KANSAS_GAS_NAME.toLowerCase()
  )
  .map((r: any) => String(r.bills.period_end).slice(0, 10))
  .sort();

const canonicalEnd =
  nonKgsEnds.length
    ? nonKgsEnds.at(-1)!   // ✅ prefer supplier’s end (e.g., 2025-09-30)
    : rows
        .map((r: any) => String(r.bills.period_end).slice(0, 10))
        .sort()
        .at(-1)!;          // fallback

const start = String(bill.period_start).slice(0, 10);
const end = canonicalEnd;


if (start > end) {
  const debugRows = rows.map((r: any) => ({
    provider: r.bills.utility_provider,
    start: String(r.bills.period_start).slice(0, 10),
    end: String(r.bills.period_end).slice(0, 10),
  }));

  log("DEBUG bad period: start after end", {
    pmMeterId,
    start,
    end,
    rows: debugRows,
  });

  return; // ✅ IMPORTANT: skip this group
}



const record: ConsumptionRecord = {
  usage,
  startDate: String(bill.period_start).slice(0, 10),
  endDate: canonicalEnd,
  cost: totalCost > 0 ? totalCost : undefined,
  billIds: rows.map((r: any) => String(r.bills.id)),

  // ✅ used later to compute usage in the PM meter's unitOfMeasure
  sourceRow: canonicalRow,
};
// ✅ ADD THIS RIGHT HERE
if (!byPmMeter[pmMeterId]) byPmMeter[pmMeterId] = [];
byPmMeter[pmMeterId].push(record);

// Optional but recommended for first run:
log("DEBUG added record to byPmMeter", {
  pmMeterId,
  startDate: record.startDate,
  endDate: record.endDate,
  usage: record.usage,
  billIds: record.billIds,
});

//log("RECORD DEBUG (pre-PM-unit)", {
 // pmMeterId,
 // meterType: meter?.type,
 // month: record.startDate.slice(0, 7),
 // usageChosen: record.usage,
//  totalCost,
//  providers: rows.map((r: any) => r.bills.utility_provider),
//  usageValues_mmbtu: rows.map((r: any) => r.usage_mmbtu),
//  usageValues_kwh: rows.map((r: any) => r.usage_kwh),
});




    const pmMeterIds = Object.keys(byPmMeter);
    if (!pmMeterIds.length) {
      log("after grouping, no consumption records to upload");
      return res.status(200).json({
        ok: true,
        message: "No grouped usage records to upload.",
        meters: 0,
        totalRecords: 0,
        results: [],
      });
    }

    // 5️⃣ For each PM meter, POST /meter/{pmMeterId}/consumptionData (batched)
    type MeterResult = {
      pmMeterId: string;
      count: number; // total records sent for this meter
      ok: boolean; // all batches succeeded?
      status: number; // status of the last batch
      statusText: string;
      error?: string; // first error body, if any
    };

    const results: MeterResult[] = [];
    const MAX_RECORDS_PER_REQUEST = 120;

    for (const pmMeterId of pmMeterIds) {
      let records: ConsumptionRecord[] = byPmMeter[pmMeterId] || [];
      if (!records.length) continue;

      // Track which bills we successfully upload for this meter
      const uploadedBillIds = new Set<string>();

     // Sort oldest → newest so batches go in chronological order
records.sort((a, b) =>
  a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0
);

// ✅ DEBUG records BEFORE PM dedupe (for one meter)
if (pmMeterId === "25325560") {
  log("DEBUG records BEFORE PM dedupe", {
    pmMeterId,
    periods: records.map((r) => ({ s: r.startDate, e: r.endDate, billIds: r.billIds })),
  });
}

// Set "Date Meter became Active" to the first day of the oldest bill (YYYY-MM-DD)
if (!records.length) {
  log("No records to upload for meter; skipping meterInServiceDate update", { pmMeterId });
  continue;
}


const earliestStart = String(records[0].startDate).slice(0, 10);
await ensureMeterInServiceDate(pmMeterId, earliestStart);

// ✅ Compute usage in the PM meter's configured unitOfMeasure (kWh vs Therms vs kBtu etc.)
const pmUnit = await getPmMeterUnitOfMeasure(pmMeterId);

records = records.map((r) => ({
  ...r,
  usage: usageForPmUnit(pmUnit, r.sourceRow),
}));

// 🔍 DEBUG: confirm exactly what we are sending to PM
// records.forEach((r) => {
//   log("PM USAGE DEBUG", {
//    pmMeterId,
//    pmUnitOfMeasure: pmUnit,
//    startDate: r.startDate,
//    endDate: r.endDate,
//    usageSent: r.usage,
//  });
// });

// DEBUG: detect gaps in records BEFORE PM dedupe/upload
//for (let i = 0; i < records.length - 1; i++) {
//  const a = records[i];
 // const b = records[i + 1];

 // const aEnd = String(a.endDate).slice(0, 10);
 // const bStart = String(b.startDate).slice(0, 10);

  // expected contiguous start is next day after end
 // const expected = new Date(`${aEnd}T00:00:00Z`);
 // expected.setUTCDate(expected.getUTCDate() + 1);
 // const expectedStart = expected.toISOString().slice(0, 10);

 // if (bStart !== expectedStart) {
 //   log("DEBUG gap in local records BEFORE PM dedupe", {
 //     pmMeterId,
 //     prev: { start: a.startDate, end: a.endDate },
 //     next: { start: b.startDate, end: b.endDate },
 //     expectedStart,
 //   });
 // }
// } might need this one




           // Fetch existing PM consumption periods and drop any duplicates (backup safety)
      const existingPeriods = await getExistingConsumptionPeriods(pmMeterId);
      if (existingPeriods.length) {
        // Build: startDate -> set(endDate)
        const existingByStart = new Map<string, Set<string>>();
        for (const p of existingPeriods) {
          const s = String(p.startDate).slice(0, 10);
          const e = String(p.endDate).slice(0, 10);
          if (!existingByStart.has(s)) existingByStart.set(s, new Set());
          existingByStart.get(s)!.add(e);
        }

        // If PM already has an entry with the same startDate but a different endDate,
        // uploading will create overlaps. Stop and tell the operator to delete PM data first.
        const conflicts = records.filter((r) => {
  const s = String(r.startDate).slice(0, 10);
  const e = String(r.endDate).slice(0, 10);
  const ends = existingByStart.get(s);
  if (!ends) return false;

  // If any existing end date is equivalent (09/30 vs 10/01), treat it as already present (no conflict).
  for (const existingEnd of ends) {
    if (endDatesEquivalent(existingEnd, e)) return false;
  }

  // Otherwise it's a real conflict (same start, materially different end)
  return true;
});


        if (conflicts.length) {
          const first = conflicts[0];
          const s = String(first.startDate).slice(0, 10);
          const existingEnds = Array.from(existingByStart.get(s) ?? []);
          log("PM conflict: same startDate exists with different endDate; delete PM consumption first", {
            pmMeterId,
            startDate: s,
            existingEnds,
            attemptingEndDates: conflicts.map((c) => String(c.endDate).slice(0, 10)),
          });

          results.push({
            pmMeterId,
            count: 0,
            ok: false,
            status: 409,
            statusText: "PM consumption date conflict",
            error:
              `PM already has consumption rows starting ${s} with end date(s) ` +
              `[${existingEnds.join(", ")}]. ` +
              `Your upload is trying different end date(s). ` +
              `Delete consumptionData for this meter in PM, then re-run upload.`,
          });
          continue;
        }

        // Exact-match de-dupe (safe)
        const existingKeys = new Set(
          existingPeriods.map(
            (p) => `${String(p.startDate).slice(0, 10)}|${String(p.endDate).slice(0, 10)}`
          )
        );

        const beforeCount = records.length;

records = records.filter((r) => {
  const s = String(r.startDate).slice(0, 10);
  const e = String(r.endDate).slice(0, 10);

  if (existingKeys.has(`${s}|${e}`)) {
    log("DEBUG dedupe drop: exact match", { pmMeterId, s, e });
    return false;
  }

  const ends = existingByStart.get(s);
  if (ends) {
    for (const existingEnd of ends) {
      if (endDatesEquivalent(existingEnd, e)) {
        log("DEBUG dedupe drop: equivalent endDate", {
          pmMeterId,
          s,
          e,
          existingEnd,
        });
        return false;
      }
    }
  }

  return true;
});




if (!records.length) {
  log("skip PM meter; all billing periods already exist in PM", {
    pmMeterId,
    originalCount: beforeCount,
  });
  continue;
}

if (pmMeterId === "25325560") {
  log("DEBUG records AFTER PM dedupe", {
    pmMeterId,
    periods: records.map((r) => ({ s: r.startDate, e: r.endDate, billIds: r.billIds })),
  });
}

} // ✅ CLOSE: if (existingPeriods.length)

uploadedBillIds.clear();

      let totalForMeter = 0;
      let allOk = true;
      let lastStatus = 0;
      let lastStatusText = "";
      let firstErrorBody: string | undefined;

      // Chunk into batches of up to 120 records
      for (let i = 0; i < records.length; i += MAX_RECORDS_PER_REQUEST) {
        const batch = records.slice(i, i + MAX_RECORDS_PER_REQUEST);

        // bill IDs corresponding to this batch
        const batchBillIds = batch.flatMap((r) => r.billIds);

if (pmMeterId === "25325560") {
  log("DEBUG posting batch periods", {
    pmMeterId,
    periods: batch.map((r) => ({ s: r.startDate, e: r.endDate, usage: r.usage, cost: r.cost })),
  });
}

        const xmlParts: string[] = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          "<meterData>",
        ];

        for (const r of batch) {
          xmlParts.push("<meterConsumption>");
          xmlParts.push(`<usage>${Math.round(r.usage)}</usage>`);
          xmlParts.push(`<startDate>${r.startDate}</startDate>`);
          xmlParts.push(`<endDate>${r.endDate}</endDate>`);
          if (typeof r.cost === "number") {
            xmlParts.push(`<cost>${r.cost.toFixed(2)}</cost>`);
          }
          xmlParts.push("</meterConsumption>");
        }

        xmlParts.push("</meterData>");
        const xmlBody = xmlParts.join("");

log("PM batch payload", {
  pmMeterId,
  count: batch.length,
  items: batch.map((r) => ({
    billIds: r.billIds,
    start: r.startDate,
    end: r.endDate,
    usage: Math.round(r.usage),
    cost: r.cost,
  })),
});


        try {
          const { res: pmRes, text } = await pmRequest(
            `/meter/${encodeURIComponent(pmMeterId)}/consumptionData`,
            {
              method: "POST",
              body: xmlBody,
            }
          );

          const ok = pmRes.status >= 200 && pmRes.status < 300;
          lastStatus = pmRes.status;
          lastStatusText = pmRes.statusText;

          if (!ok) {
            allOk = false;
            if (!firstErrorBody) {
              firstErrorBody = text?.slice(0, 500);
            }
            log("PM upload failed", {
              pmMeterId,
              status: pmRes.status,
              statusText: pmRes.statusText,
              body: text?.slice(0, 500),
            });
          } else {
            // PM accepted this batch — mark these bills as candidates for pm_synced = true
            batchBillIds.forEach((id) => uploadedBillIds.add(id));

            log("PM upload ok", {
              pmMeterId,
              batchSize: batch.length,
              status: pmRes.status,
            });
          }

          totalForMeter += batch.length;
        } catch (err: any) {
          allOk = false;
          lastStatus = 0;
          lastStatusText = "Exception";
          if (!firstErrorBody) {
            firstErrorBody = String(err);
          }
          log("PM upload exception", { pmMeterId, error: String(err) });
          break; // stop on first exception for this meter
        }
      }

      // After finishing all batches for this meter, mark successfully uploaded bills as pm_synced
      if (uploadedBillIds.size > 0) {
        const ids = Array.from(uploadedBillIds);
        const { error: updErr } = await sb
          .from("bills")
          .update({ pm_synced: true })
          .in("id", ids);

        if (updErr) {
          log("failed to mark bills as pm_synced", {
            pmMeterId,
            error: updErr,
          });
        } else {
          log("marked bills as pm_synced", {
            pmMeterId,
            count: ids.length,
          });
        }
      }

      results.push({
        pmMeterId,
        count: totalForMeter,
        ok: allOk,
        status: lastStatus,
        statusText: lastStatusText,
        error: firstErrorBody,
      });
   
   
    }

    const totalRecords = results.reduce((sum, r) => sum + r.count, 0);
    const okCount = results.filter((r) => r.ok).length;

    log("done", {
      groups: results.length,
      success: okCount,
      failures: results.length - okCount,
      totalRecords,
    });

    return res.status(200).json({
      ok: true,
      meters: results.length,
      totalRecords,
      results,
    });
  } catch (e: any) {
    log("fatal error", e);
    return res
      .status(500)
      .json({ ok: false, error: (e as any)?.message ?? String(e) });
  }
}
