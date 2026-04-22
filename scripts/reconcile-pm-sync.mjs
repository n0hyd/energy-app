import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_BUILDING_IDS = [
  "28610421-e819-474d-85e2-28eed3e44a12",
  "46d04b79-b4d6-44a7-84a5-716766a5da80",
];

const DEFAULT_SINCE = "2025-11-01";
const PM_BASE_URL =
  process.env.PM_BASE_URL || "https://portfoliomanager.energystar.gov/wstest";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function expandEnvRefs(value) {
  return String(value).replace(/\$\{([^}]+)\}/g, (_, key) => process.env[key] ?? "");
}

function ensureEnv() {
  loadEnvFile(path.resolve(".env.local"));
  if (process.env.SUPABASE_URL) {
    process.env.SUPABASE_URL = expandEnvRefs(process.env.SUPABASE_URL);
  }
  const required = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "PM_USERNAME",
    "PM_PASSWORD",
  ];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

function parseArgs(argv) {
  const out = {
    buildingIds: [...DEFAULT_BUILDING_IDS],
    since: DEFAULT_SINCE,
    apply: false,
    includeUnsynced: false,
    uploadMissing: false,
    billingMonths: [],
    periodStartFrom: null,
    periodStartTo: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") {
      out.apply = true;
      continue;
    }
    if (arg === "--include-unsynced") {
      out.includeUnsynced = true;
      continue;
    }
    if (arg === "--upload-missing") {
      out.uploadMissing = true;
      continue;
    }
    if (arg === "--billing-months") {
      out.billingMonths = argv[++i]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      continue;
    }
    if (arg === "--period-start-from") {
      out.periodStartFrom = argv[++i];
      continue;
    }
    if (arg === "--period-start-to") {
      out.periodStartTo = argv[++i];
      continue;
    }
    if (arg === "--since") {
      out.since = argv[++i];
      continue;
    }
    if (arg === "--building") {
      out.buildingIds = [argv[++i]];
      continue;
    }
    if (arg === "--buildings") {
      out.buildingIds = argv[++i]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return out;
}

function printHelp() {
  console.log(`Usage:
  npm run pm:reconcile-sync -- [--apply] [--since YYYY-MM-DD] [--building UUID | --buildings id1,id2]

Defaults:
  buildings: ${DEFAULT_BUILDING_IDS.join(", ")}
  since: ${DEFAULT_SINCE}

Behavior:
  dry-run by default; reports grouped meter-month records that are marked pm_synced locally but missing in PM.
  with --apply, resets those bills to pm_synced = false for re-upload.
  with --upload-missing, posts only the missing grouped periods to PM and marks those bills pm_synced = true.
  with --billing-months, filters grouped periods by billing month keys like 2025-11,2025-12,2026-01.
  with --period-start-from/--period-start-to, filters raw bills by exact period_start date bounds before grouping.`);
}

function getSupabase() {
  // Server-only script configuration. Never reuse browser/public vars here.
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

function getPmAuthHeader() {
  const token = Buffer.from(`${process.env.PM_USERNAME}:${process.env.PM_PASSWORD}`).toString(
    "base64"
  );
  return `Basic ${token}`;
}

async function pmRequest(pathname) {
  const url = `${PM_BASE_URL}${pathname}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: getPmAuthHeader(),
      Accept: "application/xml",
    },
  });
  const text = await res.text();
  return { res, text };
}

function optTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].trim() : null;
}

function mustTag(xml, tag) {
  const v = optTag(xml, tag);
  if (!v) throw new Error(`PM meter XML missing required <${tag}>`);
  return v;
}

function escapeXml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function ensureMeterInServiceDate(pmMeterId, firstStartDateYmd) {
  const desired = String(firstStartDateYmd).slice(0, 10);
  const path = `/meter/${encodeURIComponent(pmMeterId)}`;
  const { res, text } = await pmRequest(path);
  if (!res.ok) {
    throw new Error(`Failed to GET meter ${pmMeterId}: ${res.status} ${text.slice(0, 300)}`);
  }

  const current = optTag(text, "firstBillDate");
  if (current && current.slice(0, 10) <= desired) return;

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<meter>
  <id>${mustTag(text, "id")}</id>
  <type>${mustTag(text, "type")}</type>
  <name>${escapeXml(mustTag(text, "name"))}</name>
  <metered>${mustTag(text, "metered")}</metered>
  <unitOfMeasure>${mustTag(text, "unitOfMeasure")}</unitOfMeasure>
  <inUse>${mustTag(text, "inUse")}</inUse>
  ${optTag(text, "inactiveDate") ? `<inactiveDate>${optTag(text, "inactiveDate")}</inactiveDate>` : ""}
  ${optTag(text, "otherDescription") ? `<otherDescription>${escapeXml(optTag(text, "otherDescription"))}</otherDescription>` : ""}
  <firstBillDate>${desired}</firstBillDate>
</meter>`;

  const update = await fetch(`${PM_BASE_URL}${path}`, {
    method: "PUT",
    headers: {
      Authorization: getPmAuthHeader(),
      Accept: "application/xml",
      "Content-Type": "application/xml",
    },
    body,
  });
  const updateText = await update.text();
  if (!update.ok) {
    throw new Error(
      `Failed to set firstBillDate for ${pmMeterId}: ${update.status} ${updateText.slice(0, 300)}`
    );
  }
}

async function getPmMeterUnitOfMeasure(pmMeterId) {
  const { res, text } = await pmRequest(`/meter/${encodeURIComponent(pmMeterId)}`);
  if (!res.ok) {
    throw new Error(`Failed to GET meter ${pmMeterId}: ${res.status} ${text.slice(0, 300)}`);
  }
  const m = text.match(/<(?:[\w-]+:)?unitOfMeasure>([\s\S]*?)<\/(?:[\w-]+:)?unitOfMeasure>/i);
  if (!m?.[1]) throw new Error(`unitOfMeasure missing for PM meter ${pmMeterId}`);
  return m[1].trim();
}

function usageForPmUnit(pmUnitOfMeasure, sourceUsage) {
  const unit = String(pmUnitOfMeasure || "").toLowerCase();
  const kwh = Number(sourceUsage?.usage_kwh ?? 0);
  const mmbtu = Number(sourceUsage?.usage_mmbtu ?? 0);
  const therms = Number(sourceUsage?.therms ?? 0);
  const mcf = Number(sourceUsage?.usage_mcf ?? 0);

  if (unit.includes("kwh")) return Math.round(kwh);
  if (unit.includes("kbtu")) {
    if (mmbtu > 0) return Math.round(mmbtu * 1000);
    if (therms > 0) return Math.round(therms * 100);
    if (mcf > 0) return Math.round(mcf * 1037);
    return 0;
  }
  if (unit.includes("therm")) return Math.round(therms);
  if (unit.includes("mcf")) return Math.round(mcf);
  throw new Error(`Unsupported PM unitOfMeasure "${pmUnitOfMeasure}"`);
}

function ymdToDate(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function addDaysYmd(ymd, days) {
  const dt = ymdToDate(ymd);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function isFirstOfMonth(ymd) {
  return ymd.endsWith("-01");
}

function endDatesEquivalent(existingEnd, attemptedEnd) {
  if (existingEnd === attemptedEnd) return true;
  if (addDaysYmd(existingEnd, 1) === attemptedEnd && isFirstOfMonth(attemptedEnd)) return true;
  if (addDaysYmd(attemptedEnd, 1) === existingEnd && isFirstOfMonth(existingEnd)) return true;
  return false;
}

async function getExistingConsumptionPeriods(pmMeterId) {
  const { res, text } = await pmRequest(`/meter/${encodeURIComponent(pmMeterId)}/consumptionData`);
  if (res.status === 404) return [];
  if (!res.ok) {
    throw new Error(`PM GET failed for meter ${pmMeterId}: ${res.status} ${text.slice(0, 300)}`);
  }

  const periods = [];
  const regex =
    /<meterConsumptionData[\s\S]*?<startDate>(.*?)<\/startDate>[\s\S]*?<endDate>(.*?)<\/endDate>/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const start = String(match[1] ?? "").trim().slice(0, 10);
    const end = String(match[2] ?? "").trim().slice(0, 10);
    if (start && end) periods.push({ startDate: start, endDate: end });
  }
  return periods;
}

function buildGroupedRecords(
  bills,
  meterById,
  includeUnsynced,
  billingMonths,
  periodStartFrom,
  periodStartTo
) {
  const groups = new Map();
  const KANSAS_GAS_NAME = "Kansas Gas Service";
  const allowedMonths = new Set(billingMonths ?? []);

  for (const bill of bills) {
    const meter = meterById.get(bill.meter_id);
    if (!meter?.pm_meter_id) continue;
    if (!includeUnsynced && bill.pm_synced !== true) continue;
    const periodStart = String(bill.period_start).slice(0, 10);
    if (periodStartFrom && periodStart < periodStartFrom) continue;
    if (periodStartTo && periodStart > periodStartTo) continue;

    const billingMonth = periodStart.slice(0, 7);
    if (allowedMonths.size && !allowedMonths.has(billingMonth)) continue;
    const key = `${bill.meter_id}|${billingMonth}`;
    const usage = Array.isArray(bill.usage_readings)
      ? bill.usage_readings[0] ?? {}
      : bill.usage_readings ?? {};
    const row = {
      usage_kwh: usage.usage_kwh,
      therms: usage.therms,
      usage_mcf: usage.usage_mcf,
      usage_mmbtu: usage.usage_mmbtu,
      bills: bill,
    };

    const existing = groups.get(key);
    if (existing) {
      existing.push(row);
    } else {
      groups.set(key, [row]);
    }
  }

  const recordsByPmMeter = new Map();

  for (const rows of groups.values()) {
    if (!rows.length) continue;

    const sampleBill = rows[0].bills;
    const meter = meterById.get(sampleBill.meter_id);
    if (!meter?.pm_meter_id) continue;
    const pmMeterId = String(meter.pm_meter_id);
    const fuel = String(meter.type ?? "").toLowerCase();
    const isGas = fuel.includes("gas") || fuel.includes("natural") || fuel.includes("ng");
    const hasSynced = rows.some((r) => r.bills.pm_synced === true);
    const hasUnsynced = rows.some((r) => r.bills.pm_synced !== true);

    const kansasRows = rows.filter(
      (r) =>
        String(r.bills.utility_provider ?? "").toLowerCase() === KANSAS_GAS_NAME.toLowerCase()
    );

    let canonicalRow;
    if (kansasRows.length > 0) {
      canonicalRow = kansasRows.reduce((latest, r) =>
        r.bills.period_end > latest.bills.period_end ? r : latest
      );
    } else if (rows.length === 1) {
      canonicalRow = rows[0];
    } else {
      canonicalRow = rows.reduce((best, r) => {
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

    const nonKgsEnds = rows
      .filter(
        (r) =>
          String(r.bills.utility_provider ?? "").toLowerCase() !== KANSAS_GAS_NAME.toLowerCase()
      )
      .map((r) => String(r.bills.period_end).slice(0, 10))
      .sort();

    const canonicalEnd = nonKgsEnds.length
      ? nonKgsEnds.at(-1)
      : rows
          .map((r) => String(r.bills.period_end).slice(0, 10))
          .sort()
          .at(-1);

    const usage = isGas
      ? Math.max(...rows.map((r) => Number(r.usage_mmbtu ?? 0)), 0)
      : Math.max(...rows.map((r) => Number(r.usage_kwh ?? 0)), 0);
    const totalCost = rows.reduce((sum, r) => {
      const cost = Number(r.bills.total_cost ?? 0);
      return sum + (Number.isFinite(cost) ? cost : 0);
    }, 0);

    const record = {
      building_id: sampleBill.building_id,
      pmMeterId,
      meterId: sampleBill.meter_id,
      meterLabel: meter.label,
      meterType: meter.type,
      billingMonth: String(sampleBill.period_start).slice(0, 7),
      startDate: String(canonicalRow.bills.period_start).slice(0, 10),
      endDate: canonicalEnd,
      usage,
      totalCost,
      hasSynced,
      hasUnsynced,
      billIds: rows.map((r) => String(r.bills.id)),
      sourceUsage: {
        usage_kwh: canonicalRow.usage_kwh,
        therms: canonicalRow.therms,
        usage_mcf: canonicalRow.usage_mcf,
        usage_mmbtu: canonicalRow.usage_mmbtu,
      },
      bills: rows.map((r) => ({
        id: String(r.bills.id),
        provider: r.bills.utility_provider,
        start: String(r.bills.period_start).slice(0, 10),
        end: String(r.bills.period_end).slice(0, 10),
        pm_synced: r.bills.pm_synced === true,
      })),
    };

    if (!recordsByPmMeter.has(pmMeterId)) {
      recordsByPmMeter.set(pmMeterId, []);
    }
    recordsByPmMeter.get(pmMeterId).push(record);
  }

  return recordsByPmMeter;
}

function periodExistsInPm(existingPeriods, record) {
  return existingPeriods.some((p) => {
    const sameStart = p.startDate === record.startDate;
    return sameStart && endDatesEquivalent(p.endDate, record.endDate);
  });
}

async function reconcileBuilding(
  sb,
  buildingId,
  since,
  apply,
  includeUnsynced,
  billingMonths,
  periodStartFrom,
  periodStartTo
) {
  const { data: building, error: buildingErr } = await sb
    .from("buildings")
    .select("id,name,pm_property_id")
    .eq("id", buildingId)
    .maybeSingle();
  if (buildingErr) throw buildingErr;
  if (!building) throw new Error(`Building not found: ${buildingId}`);

  const { data: meters, error: meterErr } = await sb
    .from("meters")
    .select("id,label,type,pm_meter_id")
    .eq("building_id", buildingId)
    .not("pm_meter_id", "is", null);
  if (meterErr) throw meterErr;

  const { data: bills, error: billErr } = await sb
    .from("bills")
    .select(
      `id,building_id,meter_id,period_start,period_end,total_cost,utility_provider,pm_synced,
       usage_readings:usage_readings!usage_readings_bill_id_fkey(usage_kwh,therms,usage_mcf,usage_mmbtu)`
    )
    .eq("building_id", buildingId)
    .gte("period_start", since)
    .order("period_start", { ascending: true });
  if (billErr) throw billErr;

  const meterById = new Map((meters ?? []).map((meter) => [meter.id, meter]));
  const grouped = buildGroupedRecords(
    bills ?? [],
    meterById,
    includeUnsynced,
    billingMonths,
    periodStartFrom,
    periodStartTo
  );

  const missing = [];
  for (const [pmMeterId, records] of grouped.entries()) {
    const existingPeriods = await getExistingConsumptionPeriods(pmMeterId);
    for (const record of records) {
      if (!periodExistsInPm(existingPeriods, record)) {
        missing.push(record);
      }
    }
  }

  let resetCount = 0;
  if (apply && missing.length) {
    const billIds = [...new Set(missing.flatMap((record) => record.billIds))];
    const { error: updErr } = await sb.from("bills").update({ pm_synced: false }).in("id", billIds);
    if (updErr) throw updErr;
    resetCount = billIds.length;
  }

  return {
    building,
    billCount: bills?.length ?? 0,
    meterCount: meters?.length ?? 0,
    missing,
    resetCount,
  };
}

async function uploadMissingRecords(sb, missing) {
  const byMeter = new Map();
  for (const record of missing) {
    if (!byMeter.has(record.pmMeterId)) byMeter.set(record.pmMeterId, []);
    byMeter.get(record.pmMeterId).push(record);
  }

  let uploadedBills = 0;
  for (const [pmMeterId, records] of byMeter.entries()) {
    records.sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0));
    await ensureMeterInServiceDate(pmMeterId, records[0].startDate);
    const pmUnit = await getPmMeterUnitOfMeasure(pmMeterId);
    const existingPeriods = await getExistingConsumptionPeriods(pmMeterId);

    const existingByStart = new Map();
    for (const p of existingPeriods) {
      const s = p.startDate.slice(0, 10);
      const e = p.endDate.slice(0, 10);
      if (!existingByStart.has(s)) existingByStart.set(s, new Set());
      existingByStart.get(s).add(e);
    }

    const uploadable = [];
    for (const r of records) {
      const ends = existingByStart.get(r.startDate) ?? new Set();
      let equivalent = false;
      for (const end of ends) {
        if (endDatesEquivalent(end, r.endDate)) {
          equivalent = true;
          break;
        }
      }
      if (equivalent) continue;
      if (ends.size) {
        throw new Error(
          `PM conflict for meter ${pmMeterId} start ${r.startDate}: existing [${[...ends].join(", ")}], attempted ${r.endDate}`
        );
      }
      uploadable.push(r);
    }

    if (!uploadable.length) continue;

    const xmlParts = ['<?xml version="1.0" encoding="UTF-8"?>', "<meterData>"];
    for (const r of uploadable) {
      const usage = usageForPmUnit(pmUnit, r.sourceUsage);
      xmlParts.push("<meterConsumption>");
      xmlParts.push(`<usage>${Math.round(usage)}</usage>`);
      xmlParts.push(`<startDate>${r.startDate}</startDate>`);
      xmlParts.push(`<endDate>${r.endDate}</endDate>`);
      if (r.totalCost > 0) {
        xmlParts.push(`<cost>${r.totalCost.toFixed(2)}</cost>`);
      }
      xmlParts.push("</meterConsumption>");
    }
    xmlParts.push("</meterData>");

    const res = await fetch(`${PM_BASE_URL}/meter/${encodeURIComponent(pmMeterId)}/consumptionData`, {
      method: "POST",
      headers: {
        Authorization: getPmAuthHeader(),
        Accept: "application/xml",
        "Content-Type": "application/xml",
      },
      body: xmlParts.join(""),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`PM upload failed for meter ${pmMeterId}: ${res.status} ${text.slice(0, 500)}`);
    }

    const billIds = [...new Set(uploadable.flatMap((r) => r.billIds))];
    const { error: updErr } = await sb.from("bills").update({ pm_synced: true }).in("id", billIds);
    if (updErr) throw updErr;
    uploadedBills += billIds.length;
  }

  return uploadedBills;
}

async function main() {
  ensureEnv();
  const args = parseArgs(process.argv.slice(2));
  const sb = getSupabase();

  const results = [];
  for (const buildingId of args.buildingIds) {
    const result = await reconcileBuilding(
      sb,
      buildingId,
      args.since,
      args.apply,
      args.includeUnsynced,
      args.billingMonths,
      args.periodStartFrom,
      args.periodStartTo
    );
    if (args.uploadMissing && result.missing.length) {
      result.uploadedBillCount = await uploadMissingRecords(sb, result.missing);
    } else {
      result.uploadedBillCount = 0;
    }
    results.push(result);
  }

  for (const result of results) {
    console.log(`\nBuilding: ${result.building.name} (${result.building.id})`);
    console.log(`PM property: ${result.building.pm_property_id}`);
    console.log(`Local meters: ${result.meterCount}, local bills since ${args.since}: ${result.billCount}`);
    console.log(`Missing grouped PM periods: ${result.missing.length}`);
    for (const item of result.missing) {
      console.log(
        JSON.stringify({
          pmMeterId: item.pmMeterId,
          meterLabel: item.meterLabel,
          meterType: item.meterType,
          billingMonth: item.billingMonth,
          startDate: item.startDate,
          endDate: item.endDate,
          usage: item.usage,
          hasSynced: item.hasSynced,
          hasUnsynced: item.hasUnsynced,
          billIds: item.billIds,
          bills: item.bills,
        })
      );
    }
    if (args.apply) {
      console.log(`Reset bills to pm_synced = false: ${result.resetCount}`);
    }
    if (args.uploadMissing) {
      console.log(`Uploaded missing bills to PM: ${result.uploadedBillCount}`);
    }
  }

  const totalMissing = results.reduce((sum, item) => sum + item.missing.length, 0);
  const totalReset = results.reduce((sum, item) => sum + item.resetCount, 0);
  const totalUploaded = results.reduce((sum, item) => sum + (item.uploadedBillCount ?? 0), 0);
  console.log(
    `\nSummary: ${results.length} building(s), ${totalMissing} missing grouped PM period(s), ${totalReset} bill(s) reset, ${totalUploaded} bill(s) uploaded.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
