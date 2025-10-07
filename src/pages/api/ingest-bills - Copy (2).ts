// src/pages/api/ingest-bills.ts
// NOTE: Do NOT add "use client" to API routes.

import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

/** 
 * If you have generated types, you can replace `any` with your Database type.
 * import type { Database } from "@/types/supabase";
 * const serverClient = createClient<Database>(...)
 */

// --- Helpers to extract auth from the incoming request ---

function getBearerFromRequest(req: NextApiRequest): string | null {
  const auth = req.headers.authorization;
  if (auth && /^Bearer\s+/i.test(auth)) return auth;

  const rawCookie = req.headers.cookie ?? "";
  if (!rawCookie) return null;

  // Parse cookies into a map
  const cookieMap = Object.fromEntries(
    rawCookie.split(";").map((p) => {
      const i = p.indexOf("=");
      const k = p.slice(0, i).trim();
      const v = i >= 0 ? p.slice(i + 1).trim() : "";
      return [k, v];
    })
  );

  // 1) Legacy cookie names some folks use
  const legacy =
    cookieMap["sb-access-token"] ??
    cookieMap["supabase-auth-token"];
  if (legacy) {
    try {
      const val = decodeURIComponent(legacy);
      // Some setups store JSON here; others store the raw token.
      if (val.startsWith("{")) {
        const j = JSON.parse(val);
        if (j.access_token) return `Bearer ${j.access_token}`;
      }
      return `Bearer ${val}`;
    } catch {
      return `Bearer ${legacy}`;
    }
  }

  // 2) Supabase Auth Helpers cookie: sb-<project-ref>-auth-token
  // Your header shows: sb-ejtccsagughlsoqikobz-auth-token=base64-<...>
  const sbKey = Object.keys(cookieMap).find((k) =>
    /^sb-[a-z0-9]+-auth-token$/i.test(k)
  );
  if (sbKey) {
    let val = cookieMap[sbKey];
    try {
      val = decodeURIComponent(val);
      // Value format is usually "base64-<base64-encoded JSON>"
      const base64Prefix = "base64-";
      if (val.startsWith(base64Prefix)) {
        const b64 = val.slice(base64Prefix.length);
        const json = Buffer.from(b64, "base64").toString("utf8");
        const payload = JSON.parse(json);
        if (payload?.access_token) return `Bearer ${payload.access_token}`;
      }
      // Fallbacks: raw JSON or raw token
      if (val.startsWith("{")) {
        const payload = JSON.parse(val);
        if (payload?.access_token) return `Bearer ${payload.access_token}`;
      }
      return `Bearer ${val}`;
    } catch {
      // If decoding fails, still try to use the raw cookie value
      return `Bearer ${val}`;
    }
  }

  // 3) Nothing usable found
  return null;
}

function getServerClient(req: NextApiRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // OPTIONAL: allow server-to-server calls (e.g., PowerShell) using a shared secret
  // When provided, we'll use the SERVICE ROLE key which bypasses RLS.
  // Only enable if you understand the security trade-offs.
  const ingestSecretHeader = (req.headers["x-energy-ingest-secret"] || req.headers["x-energy-admin"]) as string | undefined;
  const ingestSecret = process.env.ENERGY_INGEST_SECRET;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE; // NEVER expose this to the client

  if (ingestSecret && serviceRole && ingestSecretHeader === ingestSecret) {
    // Service role client (no per-user context). Use only for trusted server/CLI calls.
    return createClient<any>(supabaseUrl, serviceRole, {
      auth: { persistSession: false, detectSessionInUrl: false },
    });
  }

  // Otherwise, try to run as the end user (Bearer header or Supabase cookies)
  const bearer = getBearerFromRequest(req);

  return createClient<any>(supabaseUrl, supabaseAnon, {
    auth: {
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        ...(bearer ? { Authorization: bearer } : {}),
      },
    },
  });
}

/* ---------------- Helpers ---------------- */

// Accept "YYYY-MM-DD", "MM-DD-YY", or anything Date.parse can handle; returns "YYYY-MM-DD".
function ymd(s: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{2}-\d{2}-\d{2}$/.test(s)) {
    const [mm, dd, yy] = s.split("-");
    const fullYear = 2000 + Number(yy);
    return `${fullYear}-${mm}-${dd}`;
  }
  const d = new Date(s);
  if (!isNaN(+d)) return d.toISOString().slice(0, 10);
  throw new Error(`Bad date: ${s}`);
}

function normMeterLabel(s?: string | null) {
  return (s ?? "").replace(/\s+/g, "").toUpperCase();
}

function normAddr(s?: string | null) {
  return (s ?? "").replace(/[.,#]/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
}

function pickUsageFor(utility: "electric" | "gas", row: any) {
  if (utility === "electric") {
    return { usage_kwh: row.usage_kwh ?? null, usage_mcf: null, therms: null, usage_mmbtu: null };
  }
  if (row.usage_mcf != null) return { usage_kwh: null, usage_mcf: row.usage_mcf, therms: null, usage_mmbtu: null };
  if (row.therms != null) return { usage_kwh: null, usage_mcf: null, therms: row.therms, usage_mmbtu: null };
  if (row.usage_mmbtu != null) return { usage_kwh: null, usage_mcf: null, therms: null, usage_mmbtu: row.usage_mmbtu };
  return { usage_kwh: null, usage_mcf: null, therms: null, usage_mmbtu: null };
}

async function resolveBuildingId(
  supabase: ReturnType<typeof getServerClient>,
  orgId: string,
  input: { buildingId?: string | null; addressNormalized?: string | null; service_address?: string | null }
): Promise<string | null> {
  if (input.buildingId) return input.buildingId;

  const by = normAddr(input.addressNormalized ?? input.service_address ?? "");
  if (!by) return null;

  // Try alternates (view/table) first
  try {
    const { data: alts, error: altErr } = await supabase
      .from("building_service_addresses" as any)
      .select("building_id,address,org_id")
      .eq("org_id", orgId);
    if (!altErr && Array.isArray(alts)) {
      const hit = alts.find((r: any) => normAddr(r.address) === by);
      if (hit) return hit.building_id;
    }
  } catch {
    // ignore if view doesn't exist
  }

  // Fallback to buildings.address within org
  const { data: buildings } = await supabase
    .from("buildings")
    .select("id,address,org_id")
    .eq("org_id", orgId);
  const hit = (buildings ?? []).find((b: any) => normAddr(b.address) === by);
  return hit ? hit.id : null;
}

async function resolveMeterId(
  supabase: ReturnType<typeof getServerClient>,
  orgId: string,
  buildingId: string | null,
  meterLabelRaw: string | null,
  utility: "electric" | "gas",
  autoCreate: boolean
): Promise<{ meterId: string | null; buildingId: string | null; created: boolean }> {
  const meterKey = normMeterLabel(meterLabelRaw);

  // find by label inside org (join to buildings for org filter)
  if (meterKey) {
    const { data: meters } = await supabase
      .from("meters")
      .select("id,label,building_id,buildings!inner(org_id)")
      .eq("buildings.org_id", orgId);

    const existing = (meters ?? []).find((m: any) => normMeterLabel(m.label) === meterKey);
    if (existing) return { meterId: existing.id, buildingId: existing.building_id, created: false };
  }

  if (autoCreate && buildingId) {
    const { data: inserted, error: mErr } = await supabase
      .from("meters")
      .insert({
        building_id: buildingId,
        type: utility as any,    // enum meter_type
        utility: utility as any, // enum utility_type
        label: meterLabelRaw ?? null,
        is_primary: false,
      })
      .select("id,building_id")
      .single();
    if (mErr) throw new Error(`Meter upsert failed: ${mErr.message}`);
    return { meterId: inserted!.id, buildingId: inserted!.building_id, created: true };
  }

  return { meterId: null, buildingId, created: false };
}

async function findExistingBillId(
  supabase: ReturnType<typeof getServerClient>,
  meterId: string,
  start: string,
  end: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("bills")
    .select("id")
    .eq("meter_id", meterId)
    .eq("period_start", start)
    .eq("period_end", end)
    .limit(1);
  if (error || !data?.length) return null;
  return data[0].id as string;
}

/* ---------------- Handler ---------------- */

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log("[ingest] hit", {
    method: req.method,
    url: req.url,
    hasAuthHeader: !!req.headers.authorization,
    cookieLen: (req.headers.cookie ?? "").length,
  });

  const supabase = getServerClient(req);

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  console.log("[ingest] server sees user", {
    err: userErr?.message ?? null,
    userId: userData?.user?.id ?? null,
  });

  // ...keep the rest of your existing ingest logic unchanged...
}

  try {
    const {
      orgId,
      utility,
      billUploadId = null,
      autoCreateMeter = true,
      items = [],
    }: {
      orgId: string;
      utility: "electric" | "gas";
      billUploadId?: string | null;
      autoCreateMeter?: boolean;
      items: Array<{
        buildingId?: string | null;
        addressNormalized?: string | null;
        service_address?: string | null;
        meter_no?: string | null;
        utility_provider?: string | null;
        period_start: string;
        period_end: string;
        total_cost?: number | null;
        section_total_cost?: number | null;
        demand_cost?: number | null;
        usage_kwh?: number | null;
        usage_mcf?: number | null;
        therms?: number | null;
        usage_mmbtu?: number | null;
      }>;
    } = req.body || {};

    // Auth from Bearer token (sent by client)
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes?.user?.id;
    console.log("ingest-bills user:", uid || "(none)");
    if (!uid) return res.status(401).json({ ok: false, error: "Not authenticated" });

    if (!orgId) return res.status(400).json({ ok: false, error: "Missing orgId" });
    if (utility !== "electric" && utility !== "gas") {
      return res.status(400).json({ ok: false, error: "Bad or missing utility" });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, error: "No items to ingest" });
    }

    // Verify caller is member of org
    const { data: mem, error: memErr } = await supabase
      .from("memberships")
      .select("org_id")
      .eq("profile_id", uid)
      .eq("org_id", orgId)
      .single();
    if (memErr || !mem) return res.status(403).json({ ok: false, error: "Forbidden for this org" });

    let insertedBills = 0;
    let updatedBills = 0;
    let createdMeters = 0;
    const addressMisses: Array<{ service_address: string | null; meter_no: string | null }> = [];

    for (const row of items) {
      const start = ymd(row.period_start);
      const end = ymd(row.period_end);

      // 1) Resolve building (explicit → alternates → buildings.address)
      let buildingId: string | null = await resolveBuildingId(supabase, orgId, {
        buildingId: row.buildingId ?? null,
        addressNormalized: row.addressNormalized ?? null,
        service_address: row.service_address ?? null,
      });

      // 2) Resolve meter (by label within org; auto-create if allowed)
      const meterRes = await resolveMeterId(
        supabase,
        orgId,
        buildingId,
        row.meter_no ?? null,
        utility,
        !!autoCreateMeter
      );
      const meterId = meterRes.meterId;
      buildingId = meterRes.buildingId;
      if (meterRes.created) createdMeters += 1;

      if (!meterId || !buildingId) {
        addressMisses.push({ service_address: row.service_address ?? null, meter_no: row.meter_no ?? null });
        continue;
      }

      const total_cost = row.total_cost ?? row.section_total_cost ?? null;
      const demand_cost = row.demand_cost ?? null;
      const usage = pickUsageFor(utility, row);

      // 3) Update on duplicate (meter_id + period range) — last upload wins
      const existingId = await findExistingBillId(supabase, meterId, start, end);

      if (existingId) {
        const { error: upErr } = await supabase
          .from("bills")
          .update({
            bill_upload_id: billUploadId,
            total_cost,
            demand_cost,
            utility_provider: row.utility_provider ?? null,
            building_id: buildingId,
            meter_id: meterId,
          })
          .eq("id", existingId);
        if (upErr) throw new Error(`Bill update failed: ${upErr.message}`);

        // Replace usage_readings (delete → insert)
        await supabase.from("usage_readings").delete().eq("bill_id", existingId);
        const { error: uErr } = await supabase.from("usage_readings").insert({
          bill_id: existingId,
          usage_kwh: usage.usage_kwh,
          usage_mcf: usage.usage_mcf,
          therms: usage.therms,
          usage_mmbtu: usage.usage_mmbtu,
        });
        if (uErr) throw new Error(`Usage replace failed: ${uErr.message}`);

        updatedBills += 1;
        continue;
      }

      // 4) Insert new bill + usage
      const { data: bill, error: bErr } = await supabase
        .from("bills")
        .insert({
          bill_upload_id: billUploadId,
          period_start: start,
          period_end: end,
          total_cost,
          demand_cost,
          building_id: buildingId,
          meter_id: meterId,
          utility_provider: row.utility_provider ?? null,
        })
        .select("id")
        .single();
      if (bErr) throw new Error(`Bill insert failed: ${bErr.message}`);

      const { error: uErr } = await supabase.from("usage_readings").insert({
        bill_id: bill.id,
        usage_kwh: usage.usage_kwh,
        usage_mcf: usage.usage_mcf,
        therms: usage.therms,
        usage_mmbtu: usage.usage_mmbtu,
      });
      if (uErr) {
        await supabase.from("bills").delete().eq("id", bill.id); // rollback to keep DB consistent
        throw new Error(`Usage insert failed: ${uErr.message}`);
      }

      insertedBills += 1;
    }

    return res.status(200).json({
      ok: true,
      insertedBills,
      updatedBills,
      createdMeters,
      addressMisses,
    });
  } catch (e: any) {
    console.error("[/api/ingest-bills] Error:", e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
