// src/pages/api/pm/sync-meters.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";


const PM_UNIT_BY_FUEL: Record<string, string> = {
  Electric: "kWh (thousand Watt-hours)",
  "Natural Gas": "therms",
  // fallbacks for other fuels if you add them later:
  Steam: "kBtu (thousand Btu)",
  "District Hot Water": "kBtu (thousand Btu)",
  "District Chilled Water": "kBtu (thousand Btu)",
};

function toPmMeterType(fuel: string | null, r?: any): string {
  const f = (fuel || "").toLowerCase().trim();

  if (f === "electric" || f === "elec" || f === "power") return "Electric";
  if (f === "natural gas" || f === "gas") return "Natural Gas";

  if (f === "fuel oil" || f === "oil") {
    // Try to pick a specific number if mentioned; default to No 2
    const lbl = (r?.meter_label || "").toLowerCase();
    if (/\bno?\s*1\b|#?1\b/.test(lbl)) return "Fuel Oil No 1";
    if (/\bno?\s*4\b|#?4\b/.test(lbl)) return "Fuel Oil No 4";
    if (/\bno?\s*5\b|#?5\b|\bno?\s*6\b|#?6\b|5\s*or\s*6/.test(lbl))
      return "Fuel Oil No 5 or 6";
    return "Fuel Oil No 2";
  }

  if (f === "water") {
    // Safest default; refine later if you split indoor/outdoor
    return "Municipally Supplied Potable Water - Mixed Indoor/Outdoor";
  }

  // Fall back to a valid bucket
  return "Other (Energy)";
}

function toPmUnitByFuel(
  pmTypeRaw: string | null | undefined,
  unitRaw: string | null | undefined
): string {
  const pmType = (pmTypeRaw || "").trim();             // e.g., "Electric", "Natural Gas"
  const u = (unitRaw || "").toLowerCase().trim();      // e.g., "kwh", "therms", "ccf", "kbtu", "mwh", etc.

  // ELECTRIC
  if (pmType === "Electric") {
    if (u === "mwh") return "MWh (million Watt-hours)";
    // default for electric
    return "kWh (thousand Watt-hours)";
  }

  // NATURAL GAS
  if (pmType === "Natural Gas") {
    if (u === "therm" || u === "therms") return "therms";
    if (u === "ccf") return "ccf (hundred cubic feet)";
    if (u === "kcf") return "kcf (thousand cubic feet)";
    if (u === "mcf") return "MCF (million cubic feet)";
    if (u === "m3" || u === "cubic meters" || u === "cubic metre" || u === "cubic meter")
      return "cubic meters";
    if (u === "kbtu" || u === "k-btu" || u === "k btu")
      return "kBtu (thousand Btu)";
    // fallback for gas
    return "kBtu (thousand Btu)";
  }

  // STEAM / DISTRICT HEAT / CHILLED WATER (keep simple + valid)
  if (pmType === "Steam") {
    if (u === "klb" || u === "k-lb" || u === "k lb" || u === "klbs")
      return "kLbs. (thousand pounds)";
    return "kBtu (thousand Btu)";
  }
  if (pmType === "District Hot Water" || pmType === "District Chilled Water") {
    return "kBtu (thousand Btu)";
  }

  // WATER (if you ever pass it through)
  if (pmType.startsWith("Municipally Supplied Potable Water")) {
    // Portfolio Manager accepts volume for water, but we keep kBtu fallback if you’re not posting water meters yet.
    return "kBtu (thousand Btu)";
  }

  // FUEL OILS / PROPANE (safe thermal fallback)
  if (pmType.startsWith("Fuel Oil") || pmType === "Propane" || pmType === "LPG") {
    return "kBtu (thousand Btu)";
  }

  // LAST RESORT — keep your constant fallback if you want
  // (You can remove PM_UNIT_BY_FUEL entirely if you prefer this single source of truth.)
  return PM_UNIT_BY_FUEL[pmType] || "kBtu (thousand Btu)";
}


// 👇 Add this helper (right after inferFuel or toPmUnit)
function getUsageValue(r: any): number | null {
  const fuel = (r?.type || r?.fuel || "").toLowerCase();
  if (fuel.includes("elec")) return r.usage_kwh ?? null;
  if (fuel.includes("gas")) return r.usage_mmbtu ?? null;
  return null;
}


function mapFuel(localUtility?: string | null, pmFuel?: string | null): string {
  // Prefer an explicit pm_fuel if you’ve populated it; otherwise map from your local enum
  const lu = (localUtility || "").toLowerCase();
  if (pmFuel) return pmFuel;
  if (lu.includes("electric")) return "Electric";
  if (lu.includes("gas")) return "Natural Gas";
  if (lu.includes("steam")) return "Steam";
  if (lu.includes("hot")) return "District Hot Water";
  if (lu.includes("chilled")) return "District Chilled Water";
  return "Electric"; // sensible default for K–12
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}


type Row = {
  meter_id: string;
  meter_label: string | null;
  meter_number: string | null;
  utility: string | null;   // your enum is USER-DEFINED; will arrive as string
  provider: string | null;
  pm_meter_id: string | null;

  building_id: string;
  building_name: string;
  pm_property_id: string | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Accept orgId via query (?orgId=...) or header (x-org-id)
    const orgId =
      (req.query.orgId as string) ||
      (req.headers["x-org-id"] as string) ||
      "";

    if (!orgId) {
      return res.status(400).json({
        ok: false,
        error: "Missing orgId. Provide ?orgId=<uuid> or x-org-id header.",
      });
    }

    // normalize dry; accept ?dry=1 or ?dry=true
    const d = String(req.query.dry ?? "").toLowerCase();
    const dry = d === "1" || d === "true";

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ ok: false, error: "Supabase env vars not configured" });
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // 1) List meters that need a PM meter id (pm_meter_id is NULL/empty)
    //    and the building is already linked to PM (pm_property_id is set)
    const { data, error } = await supabase
      .from("meters")
      .select(`
        meter_id:id,
        meter_label:label,
        meter_number,        
utility,
        provider,
        type,
	pm_meter_id,
        pm_fuel,
bills (
          id,
          period_end,
          usage_readings (
            usage_kwh,
            usage_mmbtu
          )
        ),
        buildings:building_id (
          building_id:id,
          building_name:name,
          pm_property_id,
          org_id
        )
      `)
      .eq("buildings.org_id", orgId)
      .not("buildings.pm_property_id", "is", null) // building is linked to PM
      .is("pm_meter_id", null) // this meter still needs to be created on PM
.order("period_end", { foreignTable: "bills", ascending: false })
      .limit(1, { foreignTable: "bills" })      

// .limit(5);

    if (error) {
      return res.status(500).json({ ok: false, error: `Supabase query failed: ${error.message}` });
    }

    // If you see zero results, flip the filter above:
    //   .is("buildings.pm_property_id", null)  -->  .not("buildings.pm_property_id", "is", null)
    // The initial null-check helps you confirm your PM linking is present as expected.

  // Build rows with pmPreview
function inferFuel(r: any): string | null {
    const usageValue = getUsageValue(r);

  const lbl = (r?.meter_label || "").toLowerCase();
  const prov = (r?.provider || "").toLowerCase();

  if (u === "kwh" || u === "mwh") return "Electric";
  if (["kbtu","therms","ccf","mcf"].includes(u)) return "Natural Gas";
  if (["gallons","gal"].includes(u)) return "Fuel Oil";

  if (lbl.includes("electric") || lbl.includes("elec") || lbl.includes("power")) return "Electric";
  if (lbl.includes("gas")) return "Natural Gas";
  if (lbl.includes("water")) return "Water";
  if (prov.includes("electric")) return "Electric";
  if (prov.includes("gas")) return "Natural Gas";
  return null;
}

function toPmMeterType(fuel: string | null, r?: any): string {
  const f = (fuel || "").toLowerCase().trim();

  if (f === "electric" || f === "elec" || f === "power") return "Electric";
  if (f === "natural gas" || f === "gas") return "Natural Gas";

  if (f === "fuel oil" || f === "oil") {
    const lbl = (r?.meter_label || "").toLowerCase();
    if (/\bno?\s*1\b|#?1\b/.test(lbl)) return "Fuel Oil No 1";
    if (/\bno?\s*4\b|#?4\b/.test(lbl)) return "Fuel Oil No 4";
    if (/\bno?\s*5\b|#?5\b|\bno?\s*6\b|#?6\b|5\s*or\s*6/.test(lbl))
      return "Fuel Oil No 5 or 6";
    return "Fuel Oil No 2";
  }

  if (f === "water") {
    return "Municipally Supplied Potable Water - Mixed Indoor/Outdoor";
  }

  return "Other (Energy)";
}

function toPmUnit(unit: string | null | undefined, pmType: string): string | null {
  const s = (unit || "").toLowerCase().trim();

  if (pmType === "Electric") {
    return "kWh (thousand Watt-hours)";
  }

  if (pmType === "Natural Gas") {
    if (s === "therm" || s === "therms") return "therms";
    if (s === "kbtu") return "kBtu (thousand Btu)";
    if (s === "ccf") return "ccf (hundred cubic feet)";
    if (s === "mcf") return "Mcf (thousand cubic feet)";
    return "therms";
  }

  if (
    pmType.startsWith("Municipally Supplied") ||
    pmType.startsWith("Well Water") ||
    pmType.startsWith("Other -")
  ) {
    return "gal (US Gallons)";
  }

  // fallbacks
  if (s === "kbtu") return "kBtu (thousand Btu)";
  if (s === "kwh") return "kWh (thousand Watt-hours)";
  return s || null;
}


// ... your select above that returns `data` ...

const rows = (data || []).map((r: any) => {
  const pmPropertyId = r.buildings?.pm_property_id ?? null;
const createPath = pmPropertyId ? `/property/${pmPropertyId}/meter` : null;

  // prefer DB fields; fall back to inferred fuel from unit/label/provider
const localFuel =
  r.type ?? r.fuel ?? r.utility ?? inferFuel(r) ?? null;

const pmType = toPmMeterType(localFuel, r);


// get latest usage from embedded bills (we limited to 1 most recent)
const latestBill = Array.isArray(r.bills) ? r.bills[0] : null;
const latestUsage = latestBill?.usage_readings ?? null;

const usage_kwh   = latestUsage?.usage_kwh   ?? null;
const usage_mmbtu = latestUsage?.usage_mmbtu ?? null;

// choose PM unit string directly (don’t read from DB)
const pmUnit = toPmUnitByFuel(pmType, r.unit);

// (Optional) pick a numeric value for preview/submission later
const usageValue =
  (localFuel?.toLowerCase().includes("elec")) ? usage_kwh :
  (localFuel?.toLowerCase().includes("gas"))  ? usage_mmbtu :
  null;


  const meterName =
    r.meter_label // some queries alias label -> meter_label
    ?? r.label    // schema default column name on meters
    ?? r.meter_number
    ?? r.meter_id
    ?? "Unnamed Meter";

  const escape = (s: string) =>
    String(s ?? "").replace(/[<>&'"]/g, (c) => ({
      "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;",
    }[c]!));

// after you compute pmType and pmUnit
const unitUsed =
  pmUnit
    ? pmUnit
    : pmType === "Electric"
      ? "kWh (thousand Watt-hours)"
      : pmType === "Natural Gas"
        ? "therms"
        : "kBtu (thousand Btu)";

// 🔒 Safety assertions so we never send a bad combo
if (pmType === "Natural Gas" && /Watt-hours/i.test(unitUsed)) {
  throw new Error(`Guard: Gas meter cannot use ${unitUsed}`);
}
if (pmType === "Electric" && /(therms|ccf|kcf|MCF|cubic meters|kBtu)/i.test(unitUsed)) {
  throw new Error(`Guard: Electric meter cannot use ${unitUsed}`);
}

console.log("PM DEBUG →", {
  meterId: r.meter_id,
  pmType,
  dbUnit: r.unit,
  pmUnitComputed: pmUnit,
  unitUsed,                       // <- THIS is what we must embed in XML
});

// ✅ Build XML using unitUsed (not pmUnit)
const xmlBody =
  `<?xml version="1.0" encoding="UTF-8"?>` +
  `<meter>` +
    `<type>${escapeXml(pmType)}</type>` +
    `<name>${escapeXml(meterName)}</name>` +
    `<unitOfMeasure>${escapeXml(unitUsed)}</unitOfMeasure>` +  // <-- unitUsed here
    `<metered>true</metered>` +
    `<firstBillDate>2010-01-01</firstBillDate>` +
    `<inUse>true</inUse>` +
  `</meter>`;

console.log("PM DEBUG XML →", xmlBody);  // so sentXmlPreview matches exactly


  const pmPreview = pmPropertyId
    ? { propertyId: pmPropertyId, createPath: `/property/${pmPropertyId}/meter`, xmlBody }
    : null;

  return {
    meter_id: r.meter_id ?? r.id,
    meter_label: r.meter_label ?? r.label ?? null,
    meter_number: r.meter_number ?? null,
    building_id: r.buildings?.building_id,
    building_name: r.buildings?.building_name,
    pm_property_id: pmPropertyId,
    fuel: pmType,
    unit: pmUnit,
usage_value: usageValue,
    pmPreview: pmPropertyId ? { xmlBody, createPath, propertyId: pmPropertyId } : null,
  };
});

// INSERT: live mode push to PM
if (!dry) {
  const username =
    (req.headers["x-pm-username"] as string) || process.env.PM_USERNAME || "";
  const password =
    (req.headers["x-pm-password"] as string) || process.env.PM_PASSWORD || "";

  if (!username || !password) {
    return res.status(400).json({
      ok: false,
      error: "Missing PM credentials. Provide x-pm-username/x-pm-password headers or set PM_USERNAME/PM_PASSWORD envs.",
    });
  }

  // Choose PM environment
  const env = String(req.query.env || "").toLowerCase();
  const base =
    env === "wstest"
      ? "https://portfoliomanager.energystar.gov/wstest"
      : "https://portfoliomanager.energystar.gov/pm";

  const auth = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");

  // Create a Supabase client for writes (you already created one above)
  const created: Array<{ meter_id: string; pm_meter_id: string }> = [];
  const failures: Array<{ meter_id: string; error: string }> = [];

  // Only attempt rows that have a PM property id and no pm_meter_id yet
  const todo = rows.filter(r => r.pm_property_id && !r.pm_meter_id);

  for (const r of todo) {
    try {
      const url = `${base}/property/${r.pm_property_id}/meter`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/xml",
          "Content-Type": "application/xml",
          Authorization: auth,
          "User-Agent": "energy-app/1.0",
        },
        body: xmlBody,
      });

      if (resp.status === 201 || resp.status === 200) {
        // PM returns Location header with new meter id
        const loc = resp.headers.get("Location") || "";
        // IDs usually appear at the end of the path
        const pmId = loc.split("/").pop() || "";

        if (!pmId) throw new Error("Missing Location header or meter id.");

        // Update our DB with pm_meter_id
        const { error: updErr } = await supabase
          .from("meters")
          .update({ pm_meter_id: pmId })
          .eq("id", r.meter_id);

        if (updErr) throw new Error(`DB update failed: ${updErr.message}`);

        created.push({ meter_id: r.meter_id, pm_meter_id: pmId });
      } else {
        const txt = await resp.text();
        throw new Error(`PM ${resp.status}: ${txt.slice(0, 500)}`);
      }
    } catch (e: any) {
      failures.push({ meter_id: r.meter_id, error: e?.message || String(e) });
    }
  }

  return res.status(200).json({
    ok: failures.length === 0,
    mode: "live",
    created,
    failures,
  });
}


// final response (match what your UI expects)
return res.status(200).json({
  ok: true,
  mode: dry ? "dry" : "live",
  preview: rows,
});
 
  } catch (err: any) {
    console.error("sync-meters handler crashed:", err);
    return res.status(500).json({ ok: false, error: err?.message || "Unknown error" });
  }
}
