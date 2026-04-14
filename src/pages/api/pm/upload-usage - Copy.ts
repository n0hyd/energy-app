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




// Ensure the PM meter "Date Meter became Active" matches the earliest bill date
async function ensureMeterInServiceDate(
  pmMeterId: string,
  firstStartDateYmd: string
) {
  // PM is fine with ISO 8601, keep it simple
  const inServiceDate = firstStartDateYmd.slice(0, 10); // "2024-09-01"

  const path = `/meter/${encodeURIComponent(pmMeterId)}`;

  // 1) Get the existing meter XML from PM
  const { res, text } = await pmRequest(path, { method: "GET" });

  if (!res.ok) {
    console.error(
      `Failed to GET meter ${pmMeterId} before setting inServiceDate: ${res.status} ${res.statusText} ${text}`
    );
    return;
  }

  const existingXml = text;

  // 2) If there's already an inServiceDate and it's earlier/equal, don't touch it
  const existingMatch = existingXml.match(
    /<inServiceDate>([^<]+)<\/inServiceDate>/
  );
  if (existingMatch) {
    const existing = existingMatch[1].trim();

    // dates are in YYYY-MM-DD so string compare works
    if (existing <= inServiceDate) {
      // already as early or earlier than our first bill
      return;
    }

    // meter has a later inServiceDate -> move it earlier
    const updatedXml = existingXml.replace(
      /<inServiceDate>[^<]*<\/inServiceDate>/,
      `<inServiceDate>${inServiceDate}</inServiceDate>`
    );

    await putUpdatedMeterXml(path, pmMeterId, inServiceDate, updatedXml);
    return;
  }

  // 3) No inServiceDate element yet → inject it before </meter>
  const closeIdx = existingXml.lastIndexOf("</meter>");
  if (closeIdx === -1) {
    console.error(
      `Could not find </meter> closing tag for meter ${pmMeterId} when setting inServiceDate`
    );
    return;
  }

  const updatedXml =
    existingXml.slice(0, closeIdx) +
    `  <inServiceDate>${inServiceDate}</inServiceDate>\n` +
    existingXml.slice(closeIdx);

  await putUpdatedMeterXml(path, pmMeterId, inServiceDate, updatedXml);
}

async function putUpdatedMeterXml(
  path: string,
  pmMeterId: string,
  inServiceDate: string,
  xml: string
) {
  const { res, text } = await pmRequest(path, {
    method: "PUT",
    body: xml,
  });

  if (!res.ok) {
    console.error(
      `Failed to set inServiceDate for meter ${pmMeterId} to ${inServiceDate}: ${res.status} ${res.statusText} ${text}`
    );
  }
}


// ---------- Helpers ----------

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

// ---------- API Handler ----------

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const orgId = (req.query.orgId ?? "").toString().trim();
    if (!orgId) {
      return res.status(400).json({ ok: false, error: "Missing orgId" });
    }

    if (!isUuidLike(orgId)) {
      log("WARN: orgId does not look like UUID", orgId);
    }

    const startDateParam = parseDateParam(req.query.startDate);
    const endDateParam = parseDateParam(req.query.endDate);

    const now = new Date();
    const defaultEnd = now.toISOString().slice(0, 10); // today
    const defaultStart = "1900-01-01"; // effectively "all-time"

    const startDate = startDateParam ?? defaultStart;
    const endDate = endDateParam ?? defaultEnd;

    log("starting upload", { orgId, startDate, endDate });

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

    // 2️⃣ Meters that are linked to PM (have pm_meter_id)
    const { data: meters, error: mErr } = await sb
      .from("meters")
      .select("id, building_id, pm_meter_id, pm_fuel, type, label")
      .in("building_id", buildingIds)
      .not("pm_meter_id", "is", null);

    if (mErr) {
      log("meters error", mErr);
      throw mErr;
    }

    const pmMeters = (meters ?? []).filter(
      (m: any) => m.pm_meter_id && String(m.pm_meter_id).trim() !== ""
    );

    if (!pmMeters.length) {
      log("no PM-linked meters; nothing to upload");
      return res.status(200).json({
        ok: true,
        message: "No meters have pm_meter_id; nothing to upload.",
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

   // 3️⃣ Usage + bills for those meters in the requested range
const { data: usageRows, error: uErr } = await sb
  .from("usage_readings")
  .select(
    `
    id,
    usage_kwh,
    therms,
    usage_mcf,
    usage_mmbtu,
    bills!inner(
      id,
      meter_id,
      period_start,
      period_end,
      total_cost,
      utility_provider
    )
  `
  )
  .in("bills.meter_id", meterIds)
      .gte("bills.period_start", startDate)
      .lte("bills.period_end", endDate)

    if (uErr) {
      log("usage error", uErr);
      throw uErr;
    }

    if (!usageRows?.length) {
      log("no usage rows in date range; nothing to upload");
      return res.status(200).json({
        ok: true,
        message: "No usage records found in date range; nothing to upload.",
        meters: 0,
        totalRecords: 0,
        results: [],
      });
    }

      // 4️⃣ Group by PM meter id, merging multi-provider bills by month
    type ConsumptionRecord = {
      usage: number;
      startDate: string;
      endDate: string;
      cost?: number;
      billId: string;
    };

    const byPmMeter: Record<string, ConsumptionRecord[]> = {};

    const KANSAS_GAS_NAME = "Kansas Gas Service";

    // First group raw rows by meter + billing month (YYYY-MM)
    const groups = new Map<string, any[]>();

    for (const row of usageRows as any[]) {
      const bill = row.bills;
      const meterId: string = bill.meter_id;
      const meter = meterById.get(meterId);

      if (!meter || !meter.pm_meter_id) {
        continue; // not a PM-linked meter
      }

      const billingMonth = String(bill.period_start).slice(0, 7); // "YYYY-MM"
      const key = `${meterId}│${billingMonth}`;
      const existing = groups.get(key);
      if (existing) {
        existing.push(row);
      } else {
        groups.set(key, [row]);
      }
    }

    // Now collapse each group to a single ConsumptionRecord based on provider rules
    groups.forEach((rows) => {
      if (!rows.length) return;

      const sampleBill = (rows[0] as any).bills;
      const meterId: string = sampleBill.meter_id;
      const meter = meterById.get(meterId);

      if (!meter || !meter.pm_meter_id) {
        return;
      }

      const pmMeterId = String(meter.pm_meter_id);

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

      // choose a usage scalar; PM knows actual fuel/unit from meter config
      let usage = 0;

      const kwh = Number(canonicalRow.usage_kwh ?? 0);
      const mmbtu = Number(canonicalRow.usage_mmbtu ?? 0);
      const therms = Number(canonicalRow.therms ?? 0);
      const mcf = Number(canonicalRow.usage_mcf ?? 0);

      if (kwh > 0) {
        usage = kwh;
      } else if (mmbtu > 0) {
        usage = Math.round(mmbtu * 1000); // ~kBtu
      } else if (therms > 0) {
        usage = Math.round(therms * 100); // 1 therm ≈ 100 kBtu
      } else if (mcf > 0) {
        usage = Math.round(mcf * 1037); // crude kBtu-ish
      }

      
      const record: ConsumptionRecord = {
        usage,
        startDate: bill.period_start,
        endDate: bill.period_end,
        // merged cost across all providers for the month
        cost: totalCost > 0 ? totalCost : undefined,
        billId: bill.id,
      };

      if (!byPmMeter[pmMeterId]) {
        byPmMeter[pmMeterId] = [];
      }
      byPmMeter[pmMeterId].push(record);
    });

    const pmMeterIds = Object.keys(byPmMeter);
    if (!pmMeterIds.length) {
      log("after filtering, no consumption records to upload");
      return res.status(200).json({
        ok: true,
        message: "No non-zero usage records to upload.",
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
      const records = byPmMeter[pmMeterId] || [];
      if (!records.length) continue;

      // Sort oldest → newest so batches go in chronological order
      records.sort((a, b) =>
        a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0
      );

      // Set "Date Meter became Active" to the first day of the oldest bill
      const earliestStart = records[0].startDate;
      await ensureMeterInServiceDate(pmMeterId, earliestStart);

      let totalForMeter = 0;
      let allOk = true;
      let lastStatus = 0;
      let lastStatusText = "";
      let firstErrorBody: string | undefined;

      // Chunk into batches of up to 120 records
      for (let i = 0; i < records.length; i += MAX_RECORDS_PER_REQUEST) {
        const batch = records.slice(i, i + MAX_RECORDS_PER_REQUEST);

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
