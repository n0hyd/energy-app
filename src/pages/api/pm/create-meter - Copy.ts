// src/pages/api/pm/create-meter.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { esAuthHeader } from "@/lib/energystar/config";

const PM_UNIT_BY_FUEL: Record<string, string> = {
  Electric: "kWh (thousand Watt-hours)",
  "Natural Gas": "therms",
  Steam: "kBtu (thousand Btu)",
  "District Hot Water": "kBtu (thousand Btu)",
  "District Chilled Water": "kBtu (thousand Btu)",
};

function mapFuel(localUtility?: string | null, pmFuel?: string | null): string {
  const lu = (localUtility || "").toLowerCase();
  if (pmFuel) return pmFuel;
  if (lu.includes("electric")) return "Electric";
  if (lu.includes("gas")) return "Natural Gas";
  if (lu.includes("steam")) return "Steam";
  if (lu.includes("hot")) return "District Hot Water";
  if (lu.includes("chilled")) return "District Chilled Water";
  return "Electric";
}

function escapeXml(s: string) {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Map our simple units to PM's required unit strings
function toPmUnit(u: string): string {
  const s = (u || "").toLowerCase().trim();
  if (s === "kwh") return "kWh (thousand Watt-hours)";        // PM's exact string
  if (s === "kbtu") return "kBtu (thousand Btu)";
  if (s === "therms") return "therms";
  if (s === "ccf") return "ccf";
  if (s === "gallons") return "gallons";
  // fall back to what caller sent; PM will 400 if it's not a valid enum
  return u;
}


export default async function handler(req: NextApiRequest, res: NextApiResponse) {
// DEBUG: quick env visibility check — remove after test
if (req.query.debugEnv === '1') {
  res.status(200).json({
  ENERGYSTAR_USERNAME: !!process.env.ENERGYSTAR_USERNAME,
  ENERGYSTAR_PASSWORD: !!process.env.ENERGYSTAR_PASSWORD,
  PM_USERNAME: !!process.env.PM_USERNAME,
  PM_PASSWORD: !!process.env.PM_PASSWORD,
  len_PM_PASSWORD: process.env.PM_PASSWORD?.length ?? null,
  has_PM_in_env_keys: Object.keys(process.env).some(k => k === 'PM_PASSWORD'),
  visible_PM_keys: Object.keys(process.env).filter(k => k.startsWith('PM_') || k.startsWith('ENERGYSTAR_')),
  NODE_ENV: process.env.NODE_ENV,
});
return;
}
  

try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    // Accept orgId via query or header (org guard)
    const orgId =
      (req.query.orgId as string) ||
      (req.headers["x-org-id"] as string) ||
      "";

// --- Hoisted from later: determine PM property info early ---
const pmPreview = (req.body as any)?.pmPreview;
const pmPropertyId =
  pmPreview?.propertyId ??
  (req.body as any)?.pmPropertyId ??
  (req.body as any)?.building?.pm_property_id ??
  (req.body as any)?.pm_property_id ??
  (typeof req.query.pmPropertyId === "string" ? req.query.pmPropertyId : undefined) ??
  (typeof req.query.propertyId === "string" ? req.query.propertyId : undefined) ??
  (req.headers["x-pm-property-id"] as string | undefined);

// Helper to read a header as a single string
const getHeader = (name: string) => {
  const v = req.headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v ?? undefined;
};

// Accept PM creds from headers (array-safe), then env, then query/body (for fallback)
const pmUser =
  getHeader("x-pm-username") ||
  (process.env.PM_USERNAME as string | undefined) ||
  (typeof req.query.pmUser === "string" ? req.query.pmUser : undefined) ||
  ((req.body as any)?.pmUser as string | undefined);

const pmPass =
  getHeader("x-pm-password") ||
  (process.env.PM_PASSWORD as string | undefined) ||
  (typeof req.query.pmPass === "string" ? req.query.pmPass : undefined) ||
  ((req.body as any)?.pmPass as string | undefined);

if (!pmUser || !pmPass) {
  return res
    .status(400)
    .json({ ok: false, error: "PM_USERNAME/PM_PASSWORD not configured" });
}


// Build auth header from the resolved creds
const authHeader = "Basic " + Buffer.from(`${pmUser}:${pmPass}`).toString("base64");

    if (!orgId) {
      return res.status(400).json({
        ok: false,
        error: "Missing orgId. Provide ?orgId=<uuid> or x-org-id header.",
      });
    }

    const { meter_id } = (req.body ?? {}) as { meter_id?: string };
    if (!meter_id) {
      return res.status(400).json({ ok: false, error: "Missing body.meter_id" });
    }

    const dry =
      req.query.dry === "1" ||
      req.query.dry === "true" ||
      (req.headers["x-dry-run"] as string) === "1";

   

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ ok: false, error: "Supabase env vars not configured" });
    }
    
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
// (your next existing line continues here, e.g. fetch meter/building)

  const { data, error } = await supabase
  .from("meters")
  .select("id, label, utility, buildings(pm_property_id, org_id, name)")
  .eq("id", (req.body as any)?.meter_id)
  .maybeSingle();


// Don't fail the request if the DB lookup has issues (network/RLS/no row).
if (error) {
  console.warn("meters lookup skipped:", error.message);
}


// NEW: ignore the “no single row” case
if (error && !/Cannot coerce the result to a single JSON object/i.test(error.message)) {
  throw new Error(`Meters query failed: ${error.message}`);
}    

if (error) {
      return res.status(500).json({ ok: false, error: `Meters query failed: ${error.message}` });
    }
  // Use body values (fall back to DB if present)
const meterLabel = (req.body as any)?.meter_label ?? data?.meter_label ?? "New Meter";
let unit         = (req.body as any)?.unit        ?? data?.unit ?? null;
let fuel         = (req.body as any)?.fuel        ?? data?.fuel ?? null;


    // Use DB building if present; otherwise synthesize from query
const building =
  data?.buildings ??
  { pm_property_id: pmPropertyId, org_id: orgId };

// Only enforce org check when we actually loaded a DB building row
if (data?.buildings && building.org_id !== orgId) {
  return res.status(403).json({ ok: false, error: "Meter does not belong to this orgId" });
}

    if (!building.pm_property_id) {
      return res.status(400).json({ ok: false, error: "Building is not linked to PM (missing pm_property_id)" });
    }
    if (data?.pm_meter_id) {

      return res.status(200).json({
        ok: true,
        mode: dry ? "dry-run" : "live",
        info: "Meter already has pm_meter_id; nothing to do",
        pm_meter_id: data.pm_meter_id,
      });
    }

    // 2) Build PM payload
// 2) Build PM payload (use underscored names to avoid duplicate identifier collisions)
const _meterLabel = (req.body?.meter_label as string) || "Unnamed Meter";
const _fuel = (req.body?.fuel as string) || "Electric"; // e.g., "Electric", "Natural Gas", "Other (Energy)"
const _unit = toPmUnit((req.body?.unit as string) || "kWh"); // PM expects canonical strings
const _firstBillDate = (req.body?.firstBillDate as string) || "2010-01-01";

// PM Add Meter requires: type, name, unitOfMeasure, metered, firstBillDate, inUse
const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
<meter>
  <type>${_fuel}</type>
  <name>${_meterLabel}</name>
  <unitOfMeasure>${_unit}</unitOfMeasure>
  <metered>true</metered>
  <firstBillDate>${_firstBillDate}</firstBillDate>
  <inUse>true</inUse>
</meter>`;

const pmPath = `/property/${building.pm_property_id}/meter`;

if (dry) {
  return res.status(200).json({
    ok: true,
    mode: "dry-run",
    meter_id: data.id,
    building_name: building.name,
    pm_property_id: building.pm_property_id,
    pmPreview: {
      createUrl: `${pmBase}${pmPath}`,
      xmlBody,
      inferred: { fuel, unit, meterName },
    },
  });
}




// Resolve PM base EACH request (no global const)
const pmBase =
  (process.env.pmBase?.trim() && process.env.pmBase!.trim().length > 0
    ? process.env.pmBase!.trim()
    : "https://portfoliomanager.energystar.gov/wstest");

// then your pmUrl builder:
const pmUrl =
  pmPreview?.createUrl ??
  (pmPreview?.createPath
    ? `${pmBase}${pmPreview.createPath}`
    : pmPropertyId
    ? `${pmBase}/property/${pmPropertyId}/meter`
    : null);

if (!pmUrl) {
  return res
    .status(400)
    .json({ ok: false, error: "No PM create URL available (missing pmPreview or pmPropertyId)." });
}

    // 3) POST to PM
    const pmResp = await fetch(pmUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/xml",
    Accept: "application/xml",
    Authorization: authHeader,
    "User-Agent": "energy-app/0.1", // PM gateway likes having this
  },
  body: xmlBody,
});

const pmText = await pmResp.text();

if (!pmResp.ok) {
  // Surface PM's explanation (often says exactly which element/value failed)
  return res.status(200).json({
    ok: false,
    error: `PM meter create failed (${pmResp.status})`,
    pmResponse: pmText,
    sentXmlPreview: xmlBody, // optional: delete later
  });
}

return res.status(200).json({ ok: true, pmResponse: pmText });


    // Extract <id>...</id> from response
    const match = pmText.match(/<id>(\d+)<\/id>/);
    const pmMeterId = match?.[1];
    if (!pmMeterId) {
      return res.status(502).json({
        ok: false,
        error: "Created but could not parse PM meter id",
        pmResponse: pmText,
      });
    }

    // 4) Persist pm_meter_id (and pm_fuel for clarity)
    const { error: upErr } = await supabase
      .from("meters")
      .update({ pm_meter_id: pmMeterId, pm_fuel: fuel })
      .eq("id", data.id);

    if (upErr) {
      return res.status(500).json({
        ok: false,
        error: `Update meters.pm_meter_id failed: ${upErr.message}`,
        pm_meter_id: pmMeterId,
      });
    }

await supabase.from("pm_logs").insert({
  org_id: orgId,
  building_id: buildingId,
  action: "create-meter",
  pm_property_id: pmPropertyId,
  pm_meter_id: pmMeterId,
  request_xml: xmlBody,
  response_xml: pmText.slice(0, 2000),
  status: pmResp.status,
});

const existing = await supabase
  .from("meters")
  .select("pm_meter_id")
  .eq("id", meter_id)
  .single();

if (existing.data?.pm_meter_id) {
  return res.status(200).json({
    ok: true,
    skipped: true,
    reason: "Already linked",
    pm_meter_id: existing.data.pm_meter_id,
  });
}


return res.status(200).json({
  ok: true,
  pm_meter_id: pmMeterId,
  pmResponse: pmText,
});



    return res.status(200).json({
      ok: true,
      mode: "live",
      meter_id: data.id,
      building_name: building.name,
      pm_property_id: building.pm_property_id,
      pm_meter_id: pmMeterId,
      pmResponse: pmText,
    });
  } catch (err: any) {
    console.error("create-meter crashed:", err);
    return res.status(500).json({ ok: false, error: err?.message || "Unknown error" });
  }
}
