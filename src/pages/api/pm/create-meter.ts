// src/pages/api/pm/create-meter.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Lazy Supabase client (server-side only).
 * If SUPABASE envs aren't present, returns null and DB ops are skipped.
 */
function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Map simple units to PM's canonical strings */
function toPmUnit(u: string): string {
  const s = (u || "").toLowerCase().trim();
  if (s === "kwh") return "kWh (thousand Watt-hours)";
  if (s === "kbtu") return "kBtu (thousand Btu)";
  if (s === "therms") return "therms";
  if (s === "ccf") return "ccf";
  if (s === "gallons") return "gallons";
  return u; // PM will 400 if it's not valid; we bubble their message back
}

function requiredString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function escapeXml(s: string | null | undefined): string {
  const v = (s ?? "").toString();
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toPmMeterType(fuelRaw: string | null | undefined, r?: any): string {
  const f = (fuelRaw || "").toLowerCase().trim();
  if (f === "electric" || f === "elec" || f === "power") return "Electric";
  if (f === "natural gas" || f === "gas") return "Natural Gas";
  return "Other (Energy)"; // safe fallback
}

function toPmUnitByFuel(pmTypeRaw: string | null | undefined, unitRaw: string | null | undefined): string {
  const pmType = (pmTypeRaw || "").trim();
  const u = (unitRaw || "").toLowerCase().trim();

  if (pmType === "Electric") {
    if (u === "mwh") return "MWh (million Watt-hours)";
    return "kWh (thousand Watt-hours)";
  }
  if (pmType === "Natural Gas") {
    if (u === "therm" || u === "therms") return "therms";
    if (u === "ccf") return "ccf (hundred cubic feet)";
    if (u === "kcf") return "kcf (thousand cubic feet)";
    if (u === "mcf") return "MCF (million cubic feet)";
    if (u === "m3" || u === "cubic meters" || u === "cubic metre" || u === "cubic meter") return "cubic meters";
    if (u === "kbtu" || u === "k-btu" || u === "k btu") return "kBtu (thousand Btu)";
    return "kBtu (thousand Btu)";
  }
  return "kBtu (thousand Btu)";
}

function buildXmlSafely({
  fuel,
  unit,
  meter_label,
  meter_number,
}: {
  fuel: string | null;
  unit: string | null;
  meter_label: string | null;
  meter_number: string | null;
}): string {
  const pmType = toPmMeterType(fuel);
  const pmUnit = toPmUnitByFuel(pmType, unit);
  const unitUsed =
    pmUnit
      ? pmUnit
      : pmType === "Electric"
        ? "kWh (thousand Watt-hours)"
        : pmType === "Natural Gas"
          ? "therms"
          : "kBtu (thousand Btu)";

  if (pmType === "Natural Gas" && /Watt-hours/i.test(unitUsed)) {
    throw new Error(`Guard: Gas meter cannot use ${unitUsed}`);
  }

  const meterName = meter_number || meter_label || "Meter";
  return `<?xml version="1.0" encoding="UTF-8"?><meter><type>${escapeXml(pmType)}</type><name>${escapeXml(meterName)}</name><unitOfMeasure>${escapeXml(unitUsed)}</unitOfMeasure><metered>true</metered><firstBillDate>2010-01-01</firstBillDate><inUse>true</inUse></meter>`;
}


export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ ok: false, error: "Method Not Allowed" });
    }

    // ---- Inputs ----------------------------------------------------------------
    const orgId = typeof req.query.orgId === "string" ? req.query.orgId : undefined;
    const pmPropertyId =
  typeof req.query.pmPropertyId === "string"
    ? req.query.pmPropertyId
    : typeof req.query.pm_property_id === "string"
    ? req.query.pm_property_id
    : undefined;


    if (!orgId) return res.status(400).json({ ok: false, error: "Missing orgId" });
    if (!pmPropertyId) return res.status(400).json({ ok: false, error: "Missing pmPropertyId" });

    const meter_id = (req.body?.meter_id as string) || (req.body?.meterId as string);
    if (!requiredString(meter_id)) {
      return res.status(400).json({ ok: false, error: "Missing meter_id in body" });
    }

// If this meter is already linked in our DB, short-circuit
try {
  const sb = getSupabase();
  if (sb) {
    const { data: existing, error: exErr } = await sb
      .from("meters")
      .select("id, pm_meter_id")
      .eq("id", meter_id)
      .single();

    if (!exErr && existing?.pm_meter_id) {
      return res.status(200).json({
        ok: true,
        alreadyLinked: true,
        pm_meter_id: existing.pm_meter_id,
      });
    }
  }
} catch (_) {
  // non-fatal; proceed to attempt PM create
}


  // Resolve PM base URL (default to wstest)
const pmBase =
  (process.env.pmBase?.trim() && process.env.pmBase!.trim().length > 0
    ? process.env.pmBase!.trim()
    : "https://portfoliomanager.energystar.gov/wstest");

// ---- Build or reuse XML ------------------------------------------------------
const previewXml =
  typeof req.body?.xmlBody === "string" ? req.body.xmlBody : undefined;

const fuel         = (req.body?.fuel ?? null) as string | null;
const unit         = (req.body?.unit ?? null) as string | null;
const meter_label  = (req.body?.meter_label ?? null) as string | null;
const meter_number = (req.body?.meter_number ?? null) as string | null;

const xmlToSend =
  previewXml && previewXml.includes("<meter>")
    ? previewXml
    : buildXmlSafely({ fuel, unit, meter_label, meter_number });

// ---- POST to PM with timeout -------------------------------------------------
const pmUrl = `${pmBase}/property/${encodeURIComponent(pmPropertyId)}/meter`;

// Build auth header (whatever you already do)
const u = (process.env.PM_USERNAME || process.env.pm_username || "").trim();
const p = (process.env.PM_PASSWORD || process.env.pm_password || "").trim();
const authHeader = "Basic " + Buffer.from(`${u}:${p}`, "ascii").toString("base64");

const headers: Record<string, string> = {
  "Content-Type": "application/xml",
  "Authorization": authHeader,
  "Accept": "application/xml",
};

// Abort after 15s so we never stall
const ctrl = new AbortController();
const tm = setTimeout(() => ctrl.abort(), 15000);

let resp: Response;
try {
  resp = await fetch(pmUrl, {
    method: "POST",
    headers,
    body: xmlToSend,
    signal: ctrl.signal,
  });
} catch (err: any) {
  clearTimeout(tm);
  // Always send a response on network error
  return res.status(502).json({
    ok: false,
    error: "PM fetch failed (network/timeout)",
    detail: String(err?.message || err),
    pmUrl,
    sentXmlPreview: xmlToSend,
  });
}
clearTimeout(tm);

// ---- Handle PM response ------------------------------------------------------
if (!resp.ok) {
  const text = await resp.text().catch(() => "");
  return res.status(200).json({
    ok: false,
    error: `PM meter create failed (${resp.status})`,
    pmResponse: text,
    pmUrl,
    sentXmlPreview: xmlToSend, // EXACT XML we sent
  });
}

// ---- Success: extract PM meter id and persist to DB -------------------------
let newPmMeterId: string | null = null;

// Prefer Location header like .../meter/1234567
const loc = resp.headers.get("Location") || resp.headers.get("location");
if (loc) {
  const m = loc.match(/\/meter\/(\d+)/i);
  if (m) newPmMeterId = m[1];
}

// If not in header, try the body for <id>1234567</id>
if (!newPmMeterId) {
  const bodyText = await resp.text().catch(() => "");
  const m2 = bodyText.match(/<id>(\d+)<\/id>/i);
  if (m2) newPmMeterId = m2[1];
}

let warning: string | undefined = undefined;
try {
  const sb = getSupabase();
  if (sb && newPmMeterId) {
    const { error: upErr } = await sb
      .from("meters")
      .update({
        pm_meter_id: newPmMeterId,
        pm_linked_at: new Date().toISOString(),
      })
      .eq("id", meter_id);
    if (upErr) {
      warning = `Created on PM, but failed to update meters: ${upErr.message}`;
    }
  }
} catch (e: any) {
  warning = `Created on PM, but failed to update meters: ${e?.message || "unknown error"}`;
}

// Final response
return res.status(200).json({
  ok: true,
  pm_meter_id: newPmMeterId,
  ...(warning ? { warning } : {}),
});
} catch (e: any) {
  return res.status(500).json({ ok: false, error: e?.message || "Unknown error" });
}
}
