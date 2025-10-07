// /src/pages/api/ingest-bills.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";

type Database = any;

// ---------- Types coming from the client ----------
type InboundItem = {
  // Building resolution inputs
  buildingId?: string | null;                 // may be set by UI manual picker
  manualBuildingId?: string | null;           // sometimes UI uses this name
  addressText?: string | null;                // raw OCR address (any field name works, we'll normalize below)
  service_address?: string | null;
  addressNormalized?: string | null;

  // Meter inputs
  meter_no?: string | null;                   // meters.label (meter number)
  meterNumber?: string | null;                // alt key from some UIs
  utility_provider?: string | null;           // company name stored on meter/bill if you track it

  // Bill fields
  period_start: string;                       // ISO yyyy-mm-dd
  period_end: string;                         // ISO yyyy-mm-dd
  total_cost?: number | string | null;        // numeric
  demand_cost?: number | string | null;       // numeric nullable

  // Raw passthrough for debugging/visibility
  [key: string]: any;
};

const VALID_TYPES = new Set(["electric", "gas"]);

// ---------- Helper: coerce number or null ----------
function numOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? Number(v.replace(/[^0-9.\-]/g, "")) : Number(v);
  return Number.isFinite(n) ? n : null;
}

// ---------- API Handler ----------
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const supabase = createPagesServerClient<Database>({ req, res });

  try {
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) return res.status(401).json({ ok: false, error: "Auth session missing!" });

    // Parse body
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    // Expected: { orgId, utility, billUploadId, items, autoCreateMeter }
    const orgId: string | null = body?.orgId ?? null;
    const meterType: string | null = body?.utility ?? null;
    const billUploadId: string | null = body?.billUploadId ?? null;
    const autoCreateMeter: boolean = !!body?.autoCreateMeter;
    const items: InboundItem[] = Array.isArray(body?.items) ? body.items : [];

    if (!items.length) return res.status(400).json({ ok: false, error: "No items provided" });
    if (!meterType || !VALID_TYPES.has(meterType)) {
      return res.status(400).json({ ok: false, error: "Top-level 'utility' must be 'electric' or 'gas'." });
    }
    if (!orgId) {
      // We only need orgId if we must do address-based matching. We'll enforce to avoid surprises.
      return res.status(400).json({ ok: false, error: "Missing orgId (required for address matching)." });
    }

    const results: Array<{ index: number; building_id: string | null; meter_id: string | null; bill_id?: string; error?: string }> = [];
    let createdBills = 0;

    for (let i = 0; i < items.length; i++) {
      const it = items[i];

      // --- Resolve buildingId: manual -> meter -> address RPC ---
      let buildingId: string | null =
        (it.buildingId as string | null) ??
        (it.manualBuildingId as string | null) ??
        null;

      // collect address candidates
      const addressText: string | null =
        (it.addressText as string | null) ??
        (it.service_address as string | null) ??
        (it.addressNormalized as string | null) ??
        null;

      const meterLabel: string | null =
        (it.meter_no as string | null) ??
        (it.meterNumber as string | null) ??
        null;

      // (B) meter-first building match if not manually set
      if (!buildingId && meterLabel) {
        const { data: m, error: mErr } = await supabase
          .from("meters")
          .select("building_id")
          .eq("label", meterLabel)
          .limit(1)
          .maybeSingle();
        if (!mErr && m?.building_id) buildingId = m.building_id as string;
      }

      // (C) address match (primary + alternates) if still missing and we have an address
      if (!buildingId && addressText) {
        const { data: rpc, error: rErr } = await supabase
          .rpc("find_building_by_addr_any", { p_org_id: orgId, p_raw: addressText })
          .maybeSingle();
        if (!rErr && rpc) buildingId = rpc as unknown as string;
      }

      if (!buildingId) {
        results.push({ index: i, building_id: null, meter_id: null, error: "Missing buildingId on one or more items (no match selected/found)." });
        continue; // don't try to insert this one
      }

      // --- Resolve meterId within the building (optional create) ---
      let meterId: string | null = null;

      if (meterLabel) {
        // Try find in this building
        const { data: m2, error: m2Err } = await supabase
          .from("meters")
          .select("id, building_id")
          .eq("building_id", buildingId)
          .eq("label", meterLabel)
          .limit(1)
          .maybeSingle();

        if (!m2Err && m2?.id) {
          meterId = m2.id as string;
        } else if (autoCreateMeter) {
          // Create meter with proper type/utility
          const upsertPayload: any = {
            building_id: buildingId,
            type: meterType,         // 'electric' | 'gas'
            label: meterLabel,
            utility: meterType,      // keep utility in sync with type to satisfy NOT NULL
            provider: it.utility_provider ?? null,
          };

          // Attempt insert; if unique constraint races, re-select
          const { data: mIns, error: mInsErr } = await supabase.from("meters").insert(upsertPayload).select("id").maybeSingle();
          if (!mInsErr && mIns?.id) {
            meterId = mIns.id as string;
          } else {
            // Try re-select in case of duplication error
            const { data: m3 } = await supabase
              .from("meters")
              .select("id")
              .eq("building_id", buildingId)
              .eq("label", meterLabel)
              .limit(1)
              .maybeSingle();
            if (m3?.id) meterId = m3.id as string;
          }
        }
      }

      // --- Insert bill (requires period, building; meter is optional but preferred) ---
      const billPayload: any = {
        bill_upload_id: billUploadId,
        building_id: buildingId,
        meter_id: meterId,
        period_start: it.period_start,
        period_end: it.period_end,
        total_cost: numOrNull(it.total_cost),
        demand_cost: numOrNull(it.demand_cost),
      };

      const { data: bill, error: billErr } = await supabase.from("bills").insert(billPayload).select("id").maybeSingle();
      if (billErr) {
        results.push({ index: i, building_id: buildingId, meter_id: meterId, error: `Bill insert failed: ${billErr.message}` });
        continue;
      }

      createdBills += 1;
      results.push({ index: i, building_id: buildingId, meter_id: meterId, bill_id: bill?.id as string });
    }

    // If any rows failed solely because of missing buildingId, mirror the client error
    const missing = results.find(r => r.error?.startsWith("Missing buildingId"));
    if (missing) {
      return res.status(400).json({ ok: false, error: "Missing buildingId on one or more items (no match selected/found).", results });
    }

    return res.status(200).json({
      ok: true,
      summary: {
        itemsReceived: items.length,
        billsCreated: createdBills,
      },
      results,
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: String(err?.message ?? err) });
  }
}
