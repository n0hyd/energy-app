import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { XMLParser } from "fast-xml-parser";

const DEFAULT_BUILDING_IDS = [
  "28610421-e819-474d-85e2-28eed3e44a12",
  "46d04b79-b4d6-44a7-84a5-716766a5da80",
];

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
    if (!(key in process.env)) process.env[key] = value;
  }
}

function expandEnvRefs(value) {
  return String(value).replace(/\$\{([^}]+)\}/g, (_, key) => process.env[key] ?? "");
}

function ensureEnv() {
  loadEnvFile(path.resolve(".env.local"));
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = expandEnvRefs(process.env.NEXT_PUBLIC_SUPABASE_URL);
  }
  if (process.env.SUPABASE_URL) {
    process.env.SUPABASE_URL = expandEnvRefs(process.env.SUPABASE_URL);
  }
  if (!process.env.SUPABASE_URL || !/^https?:\/\//i.test(process.env.SUPABASE_URL)) {
    process.env.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  }

  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "PM_USERNAME", "PM_PASSWORD"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

function parseArgs(argv) {
  const out = {
    buildingIds: [...DEFAULT_BUILDING_IDS],
    dry: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
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
    if (arg === "--dry") {
      out.dry = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log("Usage: npm run pm:sync-targeted -- [--dry] [--building UUID | --buildings id1,id2]");
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

function pmAuthHeader() {
  const token = Buffer.from(`${process.env.PM_USERNAME}:${process.env.PM_PASSWORD}`).toString(
    "base64"
  );
  return `Basic ${token}`;
}

function makePmHeaders() {
  return {
    Accept: "application/xml",
    Authorization: pmAuthHeader(),
    "PM-Metrics":
      "score,siteTotal,sourceTotal,siteIntensity,sourceIntensityWN,sourceIntensityWN,medianSiteIntensity,percentBetterThanSiteIntensityMedian",
  };
}

function num(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

function ymToDate(year, month) {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function buildCandidateMonths(billRows) {
  const uniq = new Map();
  for (const row of billRows ?? []) {
    const d = new Date(row.period_end);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    uniq.set(`${y}-${String(m).padStart(2, "0")}`, { year: y, month: m });
  }
  return Array.from(uniq.values());
}

async function fetchPmMetrics(propertyId, year, month) {
  const url =
    `https://portfoliomanager.energystar.gov/wstest/property/${propertyId}` +
    `/metrics?year=${year}&month=${month}&measurementSystem=EPA`;
  const res = await fetch(url, { method: "GET", headers: makePmHeaders() });
  const text = await res.text();
  return { url, res, text };
}

function hasWriteWorthyMetrics(text) {
  return (
    /<metric name="score"[^>]*>\s*<value>\s*[^<]+<\/value>/.test(text) ||
    /<metric name="siteIntensity"[^>]*>\s*<value>\s*[^<]+<\/value>/.test(text) ||
    /<metric name="siteIntensityWN"[^>]*>\s*<value>\s*[^<]+<\/value>/.test(text)
  );
}

function parser() {
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    parseTagValue: false,
    trimValues: true,
  });
}

function metricMap(parsed) {
  const metrics = parsed?.propertyMetrics?.metric;
  const list = Array.isArray(metrics) ? metrics : metrics ? [metrics] : [];
  const map = {};
  for (const item of list) {
    if (item?.name) {
      map[item.name] = item;
    }
  }
  return map;
}

async function syncOneBuilding(sb, buildingId, dry) {
  const { data: building, error: buildingErr } = await sb
    .from("buildings")
    .select("id,name,org_id,pm_property_id")
    .eq("id", buildingId)
    .maybeSingle();
  if (buildingErr) throw buildingErr;
  if (!building?.pm_property_id) {
    return { buildingId, skipped: "no-pm_property_id" };
  }

  const { data: billRows, error: billsErr } = await sb
    .from("bills")
    .select("period_end")
    .eq("building_id", buildingId)
    .order("period_end", { ascending: false })
    .limit(36);
  if (billsErr) throw billsErr;

  const candidates = buildCandidateMonths(billRows);
  let picked = null;
  let pickedText = null;
  let pickedUrl = null;

  for (const cand of candidates) {
    const hit = await fetchPmMetrics(building.pm_property_id, cand.year, cand.month);
    if (!hit.res.ok) continue;
    if (hasWriteWorthyMetrics(hit.text)) {
      picked = cand;
      pickedText = hit.text;
      pickedUrl = hit.url;
      break;
    }
  }

  if (!picked || !pickedText) {
    return {
      buildingId,
      building: building.name,
      propertyId: building.pm_property_id,
      synced: false,
      note: "No write-worthy PM metrics found",
    };
  }

  const parsed = parser().parse(pickedText);
  const year = num(parsed?.propertyMetrics?.year) ?? picked.year;
  const month = num(parsed?.propertyMetrics?.month) ?? picked.month;
  const metrics = metricMap(parsed);
  const row = {
    pm_property_id: building.pm_property_id,
    as_of_date: ymToDate(year, month),
    score: num(metrics.score?.value),
    site_eui_kbtu_ft2: num(metrics.siteIntensity?.value),
    source_eui_kbtu_ft2: num(metrics.sourceIntensity?.value),
    site_eui_wn_kbtu_ft2: num(metrics.siteIntensityWN?.value),
    source_eui_wn_kbtu_ft2: num(metrics.sourceIntensityWN?.value),
    median_site_eui_kbtu_ft2: num(metrics.medianSiteIntensity?.value),
    percent_better_than_median_site_eui: num(metrics.percentBetterThanSiteIntensityMedian?.value),
    notes: {
      requested: { year: picked.year, month: picked.month },
      effective: { year, month },
      targeted_sync: true,
    },
  };

  if (dry) {
    return {
      buildingId,
      building: building.name,
      propertyId: building.pm_property_id,
      synced: false,
      dryRun: true,
      picked,
      row,
      url: pickedUrl,
    };
  }

  const { error: upErr } = await sb
    .from("pm_property_scores")
    .upsert(row, { onConflict: "pm_property_id,as_of_date" });
  if (upErr) throw upErr;

  const snapshotRow = {
    org_id: building.org_id,
    building_id: building.id,
    pm_property_id: building.pm_property_id,
    metric_as_of_date: row.as_of_date,
    score: row.score,
    site_eui_kbtu_ft2: row.site_eui_kbtu_ft2,
    source_eui_kbtu_ft2: row.source_eui_kbtu_ft2,
    site_eui_wn_kbtu_ft2: row.site_eui_wn_kbtu_ft2,
    source_eui_wn_kbtu_ft2: row.source_eui_wn_kbtu_ft2,
    notes: row.notes,
  };
  const { error: snapErr } = await sb
    .from("pm_property_metric_snapshots")
    .upsert(snapshotRow, { onConflict: "building_id,metric_as_of_date,snapshot_date" });
  if (snapErr) throw snapErr;

  return {
    buildingId,
    building: building.name,
    propertyId: building.pm_property_id,
    synced: true,
    picked,
    row,
    url: pickedUrl,
  };
}

async function main() {
  ensureEnv();
  const args = parseArgs(process.argv.slice(2));
  const sb = getSupabase();
  const results = [];
  for (const buildingId of args.buildingIds) {
    results.push(await syncOneBuilding(sb, buildingId, args.dry));
  }
  for (const item of results) {
    console.log(JSON.stringify(item));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
