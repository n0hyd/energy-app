// src/pages/api/pm/meter-sync.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { XMLParser } from "fast-xml-parser";



/**
 * IMPORTANT: This route runs on the server only.
 * Make sure you have these env vars set (server-side):
 * - NEXT_PUBLIC_SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY   (server-only; never expose to browser)
 */
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// Map our local meter.type → PM's expected fuel label
function mapToPmFuel(localType?: string): string | null {
  if (!localType) return null;
  const t = String(localType).toLowerCase();

  // extend this as you add more fuels later
  if (t === "electric") return "Electric – Grid Purchased";
  if (t === "gas")      return "Natural Gas";

  return null; // unknown for now
}
// --- PM client (Basic Auth over XML) ---
const PM_BASE_URL = process.env.PM_BASE_URL as string;        // e.g., https://portfoliomanager.energystar.gov/wstest
const PM_USERNAME = process.env.PM_USERNAME as string;         // your API user
const PM_PASSWORD = process.env.PM_PASSWORD as string;         // its password

function basicAuthHeader(user?: string, pass?: string) {
  if (!user || !pass) return undefined;
  const token = Buffer.from(`${user}:${pass}`).toString("base64");
  return `Basic ${token}`;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  // be forgiving: PM responses vary slightly across endpoints
});

async function pmGetXml(path: string) {
  if (!PM_BASE_URL || !PM_USERNAME || !PM_PASSWORD) {
    throw new Error("PM env vars missing: PM_BASE_URL, PM_USERNAME, PM_PASSWORD");
  }
  const url = `${PM_BASE_URL.replace(/\/+$/,"")}/${path.replace(/^\/+/,"")}`;
  const resp = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/xml",
      Authorization: basicAuthHeader(PM_USERNAME, PM_PASSWORD)!,
    },
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`PM GET ${path} failed (${resp.status}): ${txt.slice(0,300)}`);
  }
  const xml = await resp.text();
  return xmlParser.parse(xml);
}

/**
 * List meters for a PM property id (e.g., "P12345").
 * Returns: { pm_meter_id, pm_fuel, raw }[]
 */
async function listPmMetersForProperty(pmPropertyId: string) {
  // PM path example (WS Test/Prod are the same shape):
  // GET /property/{propertyId}/meters
  const data = await pmGetXml(`/property/${pmPropertyId}/meters`);
  // Try to be tolerant with XML shapes:
  // Expect something like:
  // { meterList: { meter: [ { id:"M123", type:"Natural Gas", ... }, ... ] } }
  const list = data?.meterList?.meter
    ? (Array.isArray(data.meterList.meter) ? data.meterList.meter : [data.meterList.meter])
    : [];

  return list.map((m: any) => ({
    pm_meter_id: m?.id ?? m?.meterId ?? null,
    pm_fuel: m?.type ?? m?.fuelType ?? m?.fuelName ?? null,
    raw: m,
  }));
}


// Utility: parse boolean query values like ?dry=1
function toBool(v: string | string[] | undefined): boolean {
  if (v === undefined) return false;
  const s = Array.isArray(v) ? v[0] : v;
  return s === "1" || s.toLowerCase() === "true";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    // --- Inputs ---
    const orgId = (req.query.orgId || req.body?.orgId) as string | undefined;
    const dry = toBool(req.query.dry as any);

    if (!orgId) {
      return res.status(400).json({ ok: false, error: "Missing orgId" });
    }

    // --- Find meters that need a PM meter link ---
    // Criteria:
    // - building belongs to orgId
    // - building has pm_property_id
    // - meter has NO pm_meter_id yet
    const { data: candidates, error: qErr } = await supabaseAdmin
      .from("meters")
      .select(`
        id,
        building_id,
        type,
        label,
        pm_meter_id,
        pm_fuel,
        buildings!inner (
          id,
          org_id,
          name,
          pm_property_id
        )
      `)
      .eq("buildings.org_id", orgId)
      .not("buildings.pm_property_id", "is", null)
      .is("pm_meter_id", null)
      .limit(2000); // safety cap for preview

    if (qErr) {
      return res.status(500).json({ ok: false, error: `Query failed: ${qErr.message}` });
    }

    // Prepare a tiny sample to show in UI (no PM calls yet)
    const sample = (candidates || []).slice(0, 5).map((m) => {
  const suggested = mapToPmFuel(m.type);
  return {
    meter_id: m.id,
    building_id: m.buildings?.id,
    building_name: m.buildings?.name,
    pm_property_id: m.buildings?.pm_property_id,
    type: m.type,
    meter_number: m.label || null, // using meters.label
    pm_fuel: m.pm_fuel || null,
    suggested_pm_fuel: suggested,
    fuel_confidence: suggested ? "high" : "unknown",
  };
});


    // Response: just tells you what we’d try to link/create
const suggestedCount = (candidates || []).reduce((n, m) => n + (mapToPmFuel(m.type) ? 1 : 0), 0);

// Optionally include PM meters to suggest matches: ?includePm=1
const includePm = toBool(req.query.includePm as any);

let pmPreview: Array<{
  pm_property_id: string;
  pm_meters: Array<{ pm_meter_id: string | null; pm_fuel: string | null }>;
}> = [];

let suggestions: Array<{
  meter_id: string;
  building_id: string | null | undefined;
  pm_property_id: string | null | undefined;
  suggested_pm_fuel: string | null;
  suggested_pm_meter_id: string | null; // we’ll fill if there’s exactly one PM meter of that fuel
  note: string;
}> = [];

if (includePm) {
  // 1) unique PM property ids from candidates
  const props = Array.from(
    new Set((candidates || []).map((m) => m.buildings?.pm_property_id).filter(Boolean))
  ) as string[];

  // Cap to protect you from rate limits during preview
  const capped = props.slice(0, 10);

  // 2) fetch PM meters for each property
  for (const pmPropId of capped) {
    try {
      const pmMeters = await listPmMetersForProperty(pmPropId);
      pmPreview.push({
        pm_property_id: pmPropId,
        pm_meters: pmMeters.map((x) => ({ pm_meter_id: x.pm_meter_id, pm_fuel: x.pm_fuel })),
      });
    } catch (e: any) {
      pmPreview.push({
        pm_property_id: pmPropId,
        pm_meters: [],
      });
    }
  }

  // Build a quick lookup by (pm_property_id -> array of meters by fuel)
  const pmByProp: Record<string, { pm_meter_id: string | null; pm_fuel: string | null }[]> = {};
  for (const row of pmPreview) {
    pmByProp[row.pm_property_id] = row.pm_meters;
  }

  // 3) For each local meter candidate, suggest a PM meter if exactly one fuel match exists
  for (const m of candidates || []) {
    const pmPropId = m.buildings?.pm_property_id as string | undefined;
    const suggestedFuel = mapToPmFuel(m.type);
    let suggestionId: string | null = null;
    let note = "";

    if (!pmPropId || !suggestedFuel) {
      note = !pmPropId ? "No pm_property_id on building" : "Unknown local fuel type";
    } else {
      const list = (pmByProp[pmPropId] || []).filter(
        (x) => (x.pm_fuel || "").toLowerCase() === suggestedFuel.toLowerCase()
      );
      if (list.length === 1) {
        suggestionId = list[0].pm_meter_id || null;
        note = "Single PM meter of this fuel found";
      } else if (list.length === 0) {
        note = "No PM meters with this fuel found";
      } else {
        note = `Multiple PM meters (${list.length}) with this fuel`;
      }
    }

    suggestions.push({
      meter_id: m.id,
      building_id: m.buildings?.id,
      pm_property_id: pmPropId || null,
      suggested_pm_fuel: suggestedFuel || null,
      suggested_pm_meter_id: suggestionId,
      note,
    });
  }
}


return res.status(200).json({
  ok: true,
  mode: dry ? "dry-run" : "live-soon",
  counts: {
    candidates: candidates?.length || 0,
    with_suggested_fuel: (candidates || []).reduce((n, m) => n + (mapToPmFuel(m.type) ? 1 : 0), 0),
    sample: sample.length,
    properties_previewed: includePm ? pmPreview.length : 0,
  },
  sample,
  pm_preview: includePm ? pmPreview : undefined,
  suggestions: includePm ? suggestions.slice(0, 25) : undefined, // short list for preview
  note: includePm
    ? "Preview only. No changes made. If a candidate has exactly ONE PM meter with the same fuel, we surface that pm_meter_id."
    : "No calls to Portfolio Manager yet. Pass ?includePm=1 to preview PM meters.",
});

  
  } catch (err: any) {
    console.error("meter-sync handler crashed:", err);
    return res.status(500).json({ ok: false, error: err?.message || "Server error" });
  }
}
