// /src/pages/api/ingest-bills.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";

type Database = any;

type InboundItem = {
  // Building resolution inputs (any may be present)
  buildingId?: string | null;
  manualBuildingId?: string | null;

  // Address fields (used if we need RPC resolution)
  addressText?: string | null;
  service_address?: string | null;
  addressNormalized?: string | null;

  // Meter inputs
  meter_no?: string | null;          // preferred: meters.label
  meterNumber?: string | null;       // alias
  utility_provider?: string | null;  // optional: meter/bill provider name

  // Bill fields
  period_start: string;              // ISO yyyy-mm-dd
  period_end: string;                // ISO yyyy-mm-dd
  total_cost?: number | string | null;
  demand_cost?: number | string | null;

  // Usage (various aliases supported)
  usage_kwh?: number | string | null;
  kwh?: number | string | null;

  usage_mcf?: number | string | null;
  mcf?: number | string | null;

  usage_mmbtu?: number | string | null;
  mmbtu?: number | string | null;

  // Common gas aliases that KGS/others use
  usage_ccf?: number | string | null;
  ccf?: number | string | null;

  usage_therms?: number | string | null;
  therms?: number | string | null;


  // Heat content (MMBtu per MCF), first non-null wins
  heat_content_mmbtu_per_mcf?: number | string | null;
  heat_content?: number | string | null;
  hhv_mmbtu_per_mcf?: number | string | null;

  [key: string]: any;
};

const VALID_TYPES = new Set(["electric", "gas"]);

/** numeric coercion helper */
const numOrNull = (v: any): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? Number(v.replace(/[^0-9.\-]/g, "")) : Number(v);
  return Number.isFinite(n) ? n : null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
console.log("[ingest] hit", {
    method: req.method,
    url: req.url,
    itemsLen:
      Array.isArray((req as any).body?.items) ? (req as any).body.items.length : "n/a",
  });
  const supabase = createPagesServerClient<Database>({ req, res });

  try {
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) return res.status(401).json({ ok: false, error: "Auth session missing!" });

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    // Expected body: { orgId, utility, billUploadId, items, autoCreateMeter }
    const orgId: string | null = body?.orgId ?? null;
    const meterType: string | null = body?.utility ?? null;                // 'electric' | 'gas'
    const billUploadId: string | null = body?.billUploadId ?? null;
    const autoCreateMeter: boolean = !!body?.autoCreateMeter;
    const items: InboundItem[] = Array.isArray(body?.items) ? body.items : [];

    if (!items.length) return res.status(400).json({ ok: false, error: "No items provided" });
    if (!meterType || !VALID_TYPES.has(meterType)) {
      return res.status(400).json({ ok: false, error: "Top-level 'utility' must be 'electric' or 'gas'." });
    }
    if (!orgId) {
      // Needed for address-based resolver
      return res.status(400).json({ ok: false, error: "Missing orgId (required for address matching)." });
    }

    const results: Array<{
      index: number;
      building_id: string | null;
      meter_id: string | null;
      bill_id?: string;
      createdBill?: boolean;
      createdUsage?: boolean;
      error?: string;
    }> = [];

    let createdBills = 0;
    let upsertedUsage = 0;

    for (let i = 0; i < items.length; i++) {
      const it = items[i];

      // -------- Resolve buildingId: manual → meter → address RPC --------
      let buildingId: string | null =
        (it.buildingId as string | null) ??
        (it.manualBuildingId as string | null) ??
        null;

      const addressText: string | null =
        (it.addressText as string | null) ??
        (it.service_address as string | null) ??
        (it.addressNormalized as string | null) ??
        null;

      const meterLabel: string | null =
        (it.meter_no as string | null) ??
        (it.meterNumber as string | null) ??
        null;

      // (B) meter-first: find building by meter label
      if (!buildingId && meterLabel) {
// --- DEBUG: show what we're about to write into usage_readings ---
console.log("[ingest] usage_readings payload", {
  bill_id: billId,
  isGas,
  provider,
  meterType,
  heatContent,
  // inputs
  raw_in: {
    usage_kwh_in: usageKwh,
    usage_mcf_in: usageMcf,
    usage_mmbtu_in: usageMmbtuInput,
    usage_ccf_in: usageCcf,
    usage_therms_in: usageTherms,
  },
  // the computed/derived values we'll persist
  final_out: {
    usage_kwh: !isGas ? usageKwh : null,
    usage_mcf:  isGas ? usageMcf : null,
    usage_mmbtu: isGas ? usageMmbtuDerived : null,
  },
});
        
const { data: m, error: mErr } = await supabase
          .from("meters")
          .select("building_id")
          .eq("label", meterLabel)
          .limit(1)
          .maybeSingle();
        if (!mErr && m?.building_id) buildingId = m.building_id as string;
      }

      // (C) address RPC (primary + alternates)
      if (!buildingId && addressText) {
        const { data: rpc, error: rErr } = await supabase
          .rpc("find_building_by_addr_any", { p_org_id: orgId, p_raw: addressText })
          .maybeSingle();
        if (!rErr && rpc) buildingId = rpc as unknown as string;
      }

      // Hard stop if still missing
      if (!buildingId) {
        results.push({ index: i, building_id: null, meter_id: null, error: "Missing buildingId on one or more items (no match selected/found)." });
        continue;
      }

      // -------- Ensure meter exists in this building --------
      const provider = (it.utility_provider ?? "").toString().trim()
  || (meterType === "electric" ? "electric" : meterType === "gas" ? "gas" : null);



      let meterId: string | null = null;
      if (meterLabel) {
        const { data: m, error: mErr } = await supabase
          .from("meters")
          .select("id, provider")
          .eq("building_id", buildingId)
          .eq("label", meterLabel)
          .limit(1)
          .maybeSingle();

        if (mErr) {
          results.push({ index: i, building_id: buildingId, meter_id: null, error: `Meter lookup failed: ${mErr.message}` });
          continue;
        }
        if (m?.id) {
          meterId = m.id as string;
          if (provider && provider !== m.provider) {
            await supabase.from("meters").update({ provider }).eq("id", meterId);
          }
        }
      }

      if (!meterId) {
        // create meter if missing (or if no label given, still create a typed meter with null label)
        const insertRow: any = {
          building_id: buildingId,
          type: meterType,
          label: meterLabel ?? null,
          provider,
        };
        const { data: mIns, error: mInsErr } = await supabase.from("meters").insert(insertRow).select("id").maybeSingle();
        if (mInsErr) {
          results.push({ index: i, building_id: buildingId, meter_id: null, error: `Meter insert failed: ${mInsErr.message}` });
          continue;
        }
        meterId = mIns!.id as string;
      }

      // -------- Upsert bill (by building + meter + exact period) --------
      const period_start = it.period_start;
      const period_end = it.period_end;

      if (!period_start || !period_end) {
        results.push({ index: i, building_id: buildingId, meter_id: meterId, error: "Missing period_start or period_end" });
        continue;
      }

      const total_cost = numOrNull(it.total_cost);
      const demand_cost = numOrNull(it.demand_cost);

      let billId = "";
      let createdBill = false;

      const { data: existingBill, error: existingErr } = await supabase
        .from("bills")
        .select("id")
        .eq("building_id", buildingId)
        .eq("meter_id", meterId)
        .eq("period_start", period_start)
        .eq("period_end", period_end)
        .maybeSingle();

      if (existingErr) {
        results.push({ index: i, building_id: buildingId, meter_id: meterId, error: `Bill lookup failed: ${existingErr.message}` });
        continue;
      }

      if (existingBill?.id) {
        const { data: upd, error: updErr } = await supabase
          .from("bills")
          .update({
            total_cost,
            demand_cost,
            bill_upload_id: billUploadId,
          })
          .eq("id", existingBill.id)
          .select("id")
          .single();

        if (updErr) {
          results.push({ index: i, building_id: buildingId, meter_id: meterId, error: `Bill update failed: ${updErr.message}` });
          continue;
        }
        billId = upd!.id;
      } else {
        const { data: bIns, error: bInsErr } = await supabase
          .from("bills")
          .insert({
            bill_upload_id: billUploadId,
            building_id: buildingId,
            meter_id: meterId,
            period_start,
            period_end,
            total_cost,
            demand_cost,
          })
          .select("id")
          .single();

        if (bInsErr) {
          results.push({ index: i, building_id: buildingId, meter_id: meterId, error: `Bill insert failed: ${bInsErr.message}` });
          continue;
        }
        billId = bIns!.id as string;
        createdBill = true;
        createdBills += 1;
      }

      // -------- usage_readings upsert (accept aliases, coerce, and derive) --------
// Accept a generic "usage" too; route it based on meter type.
const usageGeneric = numOrNull((it as any).usage ?? (it as any).usage_total ?? (it as any).usage_value);
let usageKwh = numOrNull(it.usage_kwh ?? it.kwh ?? (meterType === "electric" ? usageGeneric : null));
let usageMcf = numOrNull(it.usage_mcf ?? it.mcf ?? (meterType === "gas" ? usageGeneric : null));
let usageMmbtuInput = numOrNull(it.usage_mmbtu ?? it.mmbtu);

// New: extra gas aliases (common on KGS)
const usageCcf = numOrNull(it.usage_ccf ?? it.ccf);
const usageTherms = numOrNull(it.usage_therms ?? it.therms);

// If we got CCF but not MCF, convert: 1 MCF = 10 CCF
if (meterType === "gas" && usageMcf == null && usageCcf != null) {
  usageMcf = Math.round((usageCcf / 10) * 1000) / 1000;
}

// If we got therms but no MMBtu, convert: 1 therm = 0.1 MMBtu
if (meterType === "gas" && (usageMmbtuInput == null) && (usageTherms != null)) {
  usageMmbtuInput = Math.round((usageTherms * 0.1) * 1000) / 1000;
}

// Consider it gas if POST says gas, provider says gas, or the usage fields are gas-only
const isGas =
  meterType === "gas" ||
  /gas/i.test(provider ?? "") ||
  usageMcf != null || usageMmbtuInput != null;


      // Heat content (MMBtu per MCF)
      const heatRaw =
        it.heat_content_mmbtu_per_mcf ??
        it.heat_content ??
        it.hhv_mmbtu_per_mcf ??
        null;

      const heatContent = (() => {
        const n = numOrNull(heatRaw);
        return n && n > 0 ? n : 1.036; // sensible default for gas
      })();

     const usageMmbtuDerived =
  usageMmbtuInput ??
  ((isGas && usageMcf != null)
    ? Math.round(usageMcf * heatContent * 1000) / 1000
    : null);

// If it's gas and we only have MMBtu, derive MCF too so we store both
if (isGas && usageMcf == null && usageMmbtuInput != null) {
  usageMcf = Math.round((usageMmbtuInput / heatContent) * 1000) / 1000;
}



      const hasAnyUsage =
        (usageKwh ?? null) !== null ||
        (usageMcf ?? null) !== null ||
        (usageMmbtuDerived ?? null) !== null;

      let createdUsage = false;
let verifyRow: any = null;


      if (hasAnyUsage) {
  
// 👇👇👇 ADD THIS BLOCK *RIGHT HERE* (pre-upsert payload log)
  console.log("[ingest] usage_readings payload", {
    index: i,
    bill_id: billId,
    provider,
    meterType,
    isGas,
    heatContent,
    raw_in: {
      usage_kwh_in: usageKwh,
      usage_mcf_in: usageMcf,
      usage_mmbtu_in: usageMmbtuInput,
      usage_ccf_in: usageCcf,
      usage_therms_in: usageTherms,
    },
    final_out: {
      usage_kwh: !isGas ? usageKwh : null,
      usage_mcf:  isGas ? usageMcf : null,
      usage_mmbtu: isGas ? usageMmbtuDerived : null,
    },
  });
  // ☝️☝️☝️ END ADD

        const { data: uIns, error: uErr } = await supabase
          .from("usage_readings")
          .upsert(
            {
              bill_id: billId,
              usage_kwh: !isGas ? usageKwh : null,
// For gas, store BOTH MCF and MMBtu (provided or derived)
usage_mcf:  isGas ? usageMcf : null,
usage_mmbtu: isGas ? usageMmbtuDerived : null,

              therms: null, // adjust if your parser provides therms
            },
            { onConflict: "bill_id", ignoreDuplicates: false}
          )
          .select("bill_id, usage_kwh, usage_mcf, usage_mmbtu");

console.log("[ingest] upsert result", { index: i, bill_id: billId, uErr, uIns });

//server log
if (!uErr) {
  const { data: verify } = await supabase
    .from("usage_readings")
    .select("bill_id, usage_kwh, usage_mcf, usage_mmbtu")
    .eq("bill_id", billId)
    .maybeSingle();
  console.log("[ingest] verify row", verify);
verifyRow = verify;
}


        if (uErr) {
          results.push({ index: i, building_id: buildingId, meter_id: meterId, bill_id: billId, error: `usage_readings upsert failed: ${uErr.message}` });
        } else if (uIns?.length) {
          createdUsage = true;
          upsertedUsage += 1;
        }
      }

      results.push({
        index: i,
        building_id: buildingId,
        meter_id: meterId,
        bill_id: billId,
        createdBill,
        createdUsage,
	verifyRow,
      });
    }

    // Mirror client error if any rows had missing buildingId
    const missing = results.find(r => r.error?.startsWith("Missing buildingId"));
    if (missing) {
      return res.status(400).json({ ok: false, error: "Missing buildingId on one or more items (no match selected/found).", results });
    }

    return res.status(200).json({
      ok: true,
      summary: {
        itemsReceived: items.length,
        billsCreated: createdBills,
        usageRowsUpserted: upsertedUsage,
      },
      results,
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: String(err?.message ?? err) });
  }
}
