// src/pages/api/pm/sync-property-metrics.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { parseStringPromise } from "xml2js";

// --- Supabase (service role for inserts/updates) ---
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

// --- Portfolio Manager base URL ---
const PM_BASE =
  process.env.PM_BASE ?? "https://portfoliomanager.energystar.gov/wstest";

// --- Basic auth header for PM ---
function pmAuthHeader(user?: string, pass?: string) {
  const u = (user ?? process.env.PM_USERNAME ?? "").trim();
  const p = (pass ?? process.env.PM_PASSWORD ?? "").trim();
  const token = Buffer.from(`${u}:${p}`).toString("base64");
  return { Authorization: `Basic ${token}` };
}

// --- PM headers (exactly what your PowerShell used) ---
function makePmHeaders(user?: string, pass?: string) {
  return {
    Accept: "application/xml",
    ...pmAuthHeader(user, pass),
    "PM-Metrics":
      "score,siteTotal,sourceTotal,siteIntensity,sourceIntensity,siteIntensityWN,medianSiteIntensity,percentBetterThanSiteIntensityMedian",
  } as Record<string, string>;
}

// --- Helper: coerce to number or null ---
function num(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

// --- Helper: y-m (1..12) to YYYY-MM-01 string ---
function ymToDate(year: number, month: number) {
  const mm = String(month).padStart(2, "0");
  return `${year}-${mm}-01`;
}

// --- Main handler ---
const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const { orgId, pmUser, pmPass, dry } = req.query as Record<string, string | undefined>;
    if (!orgId) {
      return res.status(400).json({ ok: false, error: "Missing orgId" });
    }

    // 1) Fetch buildings for this org
    const { data: buildings, error: bErr } = await supabase
      .from("buildings")
      .select("id, pm_property_id, org_id")
      .eq("org_id", orgId);

    if (bErr) throw new Error(`buildings query failed: ${bErr.message}`);

    // 2) For each building, establish month/year to query:
    //    use the month of the latest bill PERIOD END (last full month with data)
    const results: any[] = [];

    for (const b of buildings ?? []) {
      const propertyId = b.pm_property_id as string | null;
      if (!propertyId) {
        results.push({ buildingId: b.id, skipped: "no-pm_property_id" });
        continue;
      }

      // Latest bill for this building
      // --- 2a) Load several recent bills (we'll walk backward through months that actually have bills)
const { data: billRows, error: billsErr } = await supabase
  .from("bills")
  .select("period_end")
  .eq("building_id", b.id)
  .order("period_end", { ascending: false })
  .limit(36); // grab up to 3 years; adjust as you like

if (billsErr) {
  results.push({ propertyId, ok: false, error: `bills query error: ${billsErr.message}` });
  continue;
}

// If there are no bills for this building, fall back to previous calendar month
let monthsDesc: Array<{ year: number; month: number }>;
if (!billRows?.length) {
  const now = new Date();
  now.setUTCDate(1);
  now.setUTCMonth(now.getUTCMonth() - 1); // previous calendar month
  monthsDesc = [{ year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 }];
} else {
  // Build a unique, newest→oldest list of (year, month) from the bill period_end dates
  const uniq = new Map<string, { year: number; month: number }>();
  for (const r of billRows) {
    const d = new Date(r.period_end as unknown as string);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1; // 1..12
    uniq.set(`${y}-${String(m).padStart(2, "0")}`, { year: y, month: m });
  }
  monthsDesc = Array.from(uniq.values());
}

// For debug: show the newest bill we saw (if any)
results.push({
  propertyId,
  debug: {
    latestBill: billRows?.[0]
      ? { end: billRows[0].period_end }
      : null,
    candidateMonths: monthsDesc.slice(0, 6) // first few months we'll try
  }
});

// --- 2b) Try PM starting from newest bill month; fall back until we find any non-null metric
let picked: { year: number; month: number } | null = null;
let textForParse: string | null = null;
let lastStatus = 0;
let lastText: string | null = null;
let pickedUrl: string | null = null;

for (const cand of monthsDesc) {
  const { year, month } = cand;
  const url = `${PM_BASE}/property/${propertyId}/metrics?year=${year}&month=${month}&measurementSystem=EPA`;

  // 3) Request PM metrics (exact inventory we know works for this endpoint)
  let resp: Response;
  try {
    const hdrs = makePmHeaders(pmUser, pmPass);
    const hasAuthHeader = !!hdrs.Authorization && hdrs.Authorization.startsWith("Basic ");
    results.push({ propertyId, debug: { hasAuthHeader, qYear: year, qMonth: month, urlHit: url } });

    resp = await fetch(url, { method: "GET", headers: hdrs });
  } catch (e: any) {
    results.push({ propertyId, ok: false, status: 0, error: `fetch failed: ${String(e)}`, url });
    // Try the next older month
    continue;
  }

  const text = await resp.text();
  lastStatus = resp.status;
  lastText = text;

  if (!resp.ok) {
    // Keep moving to an older month
    results.push({
      propertyId,
      ok: false,
      status: resp.status,
      error: text || "PM request failed",
      url,
      debug: { triedYear: year, triedMonth: month }
    });
    continue;
  }

  // Minimal “has data” check: any of these metrics present & non-null
  const hasAnyMetric =
    /<metric name="score"[^>]*>\s*<value>[^<]+<\/value>/.test(text) ||
    /<metric name="siteTotal"[^>]*>\s*<value>[^<]+<\/value>/.test(text) ||
    /<metric name="sourceTotal"[^>]*>\s*<value>[^<]+<\/value>/.test(text) ||
    /<metric name="siteIntensity"[^>]*>\s*<value>[^<]+<\/value>/.test(text) ||
    /<metric name="siteIntensityWN"[^>]*>\s*<value>[^<]+<\/value>/.test(text) ||
    /<metric name="medianSiteIntensity"[^>]*>\s*<value>[^<]+<\/value>/.test(text) ||
    /<metric name="percentBetterThanSiteIntensityMedian"[^>]*>\s*<value>[^<]+<\/value>/.test(text);

  if (hasAnyMetric) {
  picked = { year, month };
  textForParse = text;
  pickedUrl = url; // ✅ <-- this is the new line (block 2)
  results.push({ propertyId, debug: { pickedYear: year, pickedMonth: month, firstWithData: true } });
  break; // stop walking back
} else {
  results.push({
    propertyId,
    debug: { triedYear: year, triedMonth: month, firstWithData: false, note: "All metrics null for this month" }
  });
}
}

// If nothing produced data, surface the last error/status we saw and skip this building
if (!picked || !textForParse) {
  results.push({
    propertyId,
    ok: false,
    status: lastStatus,
    error: lastText || "No month with usable metrics was found in PM for this property",
    url: null
  });
  continue;
}

// Success: set qYear/qMonth to the picked month and keep the XML for your parse stage
const qYear = picked.year;
const qMonth = picked.month;
const pickedURL = `${PM_BASE}/property/${propertyId}/metrics?year=${qYear}&month=${qMonth}&measurementSystem=EPA`;
const text = textForParse; // <- this replaces your old `const text = await resp.text();`

// (Your downstream parsing + row-building can remain exactly as-is, using `text`, `qYear`, `qMonth`.)


      // 4) Parse XML
const parsed = await parseStringPromise(text, { explicitArray: false, mergeAttrs: true }).catch(() => null);
if (!parsed?.propertyMetrics) {
  results.push({ propertyId, ok: false, status: 200, error: "no propertyMetrics node", url: pickedUrl, raw: text });
  continue;
}

      const pm = parsed.propertyMetrics;
      const year = num(pm.year) ?? qYear;
      const month = num(pm.month) ?? qMonth;
      const as_of_date = ymToDate(year as number, month as number);

      // Metrics array normalization
      const metrics = Array.isArray(pm.metric) ? pm.metric : pm.metric ? [pm.metric] : [];
      const m: Record<string, any> = {};
      for (const entry of metrics) {
        if (!entry?.name) continue;
        m[entry.name] = entry;
      }

      // 5) Build row for upsert
      const row = {
        pm_property_id: propertyId,
        as_of_date,
        score: num(m.score?.value),
        site_eui_kbtu_ft2: num(m.siteIntensity?.value),
        source_eui_kbtu_ft2: num(m.sourceIntensity?.value),
        site_eui_wn_kbtu_ft2: num(m.siteIntensityWN?.value),
        median_site_eui_kbtu_ft2: num(m.medianSiteIntensity?.value),
        percent_better_than_median_site_eui: num(m.percentBetterThanSiteIntensityMedian?.value),
        // Keep a small JSON note for debugging
        notes: {
          requested: { year: qYear, month: qMonth },
          effective: { year, month },
        } as any,
      };

      const allNull =
        row.score == null &&
        row.site_eui_kbtu_ft2 == null &&
        row.source_eui_kbtu_ft2 == null &&
        row.site_eui_wn_kbtu_ft2 == null &&
        row.median_site_eui_kbtu_ft2 == null &&
        row.percent_better_than_median_site_eui == null;

      results.push({
  propertyId,
  ok: true,
  skipped: "all-null",
  url: pickedUrl,
  debug_metric_names: Object.keys(m),
});

        continue;
      }

      if (dry === "1" || dry === "true") {
        results.push({ propertyId, ok: true, dryRun: true, url: pickedUrl, row, debug_metric_names: Object.keys(m) });
        continue;
      }

      // 6) Upsert
      const { data: up, error: upErr } = await supabase
        .from("pm_property_scores")
        .upsert(row, { onConflict: "pm_property_id,as_of_date" })
        .select()
        .maybeSingle();

      if (upErr) {
        results.push({ propertyId, ok: false, status: 500, error: `upsert failed: ${upErr.message}`, url: pickedUrl, row });

      } else {
        results.push({ propertyId, ok: true, url: pickedUrl, row: up, debug_metric_names: Object.keys(m) });

      }
    }

   return res
  .status(200)
  .setHeader("Content-Type", "application/json")
  .send(JSON.stringify({ ok: true, count: results.length, results }, null, 2));

  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
};

export default handler;
