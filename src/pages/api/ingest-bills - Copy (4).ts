// /src/pages/api/ingest-bills.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";

type Database = any;

type InboundItem = {
  buildingId: string | null;             // may be null from client; we will require it
  addressNormalized?: string | null;
  service_address?: string | null;

  meter_no?: string | null;              // meters.label (meter number)
  utility_provider?: string | null;      // meters.provider (company name)
  match_via?: "meter" | "address" | "none";

  period_start: string;                  // ISO yyyy-mm-dd (or 20yy-mm-dd)
  period_end: string;                    // ISO yyyy-mm-dd
  total_cost?: number | null;
  demand_cost?: number | null;

  usage_kwh?: number | null;
  usage_mcf?: number | null;
  usage_mmbtu?: number | null;
};

const VALID_TYPES = new Set(["electric", "gas"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

    const supabase = createPagesServerClient<Database>({ req, res });
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) return res.status(401).json({ ok: false, error: "Auth session missing!" });

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    // From your client: { orgId, utility, billUploadId, items, autoCreateMeter }
    const meterType: string | null = (body?.utility ?? null);
    const billUploadId: string | null = body?.billUploadId ?? null;
    const items: InboundItem[] = Array.isArray(body?.items) ? body.items : [];

    if (!items.length) return res.status(400).json({ ok: false, error: "No items provided" });
    if (!meterType || !VALID_TYPES.has(meterType)) {
      return res.status(400).json({ ok: false, error: "Top-level 'utility' must be 'electric' or 'gas'." });
    }

    const results: Array<{
      buildingId: string;
      meterId: string;
      billId: string;
      createdBill: boolean;
      createdUsage: boolean;
      note?: string;
    }> = [];

    for (const raw of items) {
      const {
        buildingId,
        meter_no = null,
        utility_provider = null,

        period_start,
        period_end,
        total_cost = null,
        demand_cost = null,

        usage_kwh = null,
        usage_mcf = null,
        usage_mmbtu = null,
      } = raw;

      // --- Basic validation ---
      if (!buildingId) {
        return res.status(400).json({ ok: false, error: "Missing buildingId on one or more items (no match selected/found)." });
      }
      if (!period_start || !period_end) {
        return res.status(400).json({ ok: false, error: "Missing period_start or period_end" });
      }

      // ---------- 1) Find or create meter (by building + meter_no as label) ----------
      const meterLabel = (meter_no ?? "").replace(/\s+/g, "").toUpperCase();
      if (!meterLabel) {
        return res.status(400).json({ ok: false, error: "Missing meter_no (meter number) on one or more items." });
      }

      let meterId: string | null = null;

      // try existing by building_id + label
      {
        const { data: m, error: mErr } = await supabase
          .from("meters")
          .select("id, type, provider")
          .eq("building_id", buildingId)
          .eq("label", meterLabel)
          .limit(1)
          .maybeSingle();

        if (mErr) return res.status(500).json({ ok: false, error: `Meter lookup failed: ${mErr.message}` });
        if (m?.id) {
          meterId = m.id;
          // Opportunistically set/refresh provider name
          if (utility_provider && utility_provider.trim() && m.provider !== utility_provider.trim()) {
            const { error: updErr } = await supabase
              .from("meters")
              .update({ provider: utility_provider.trim() })
              .eq("id", m.id);
            if (updErr) return res.status(500).json({ ok: false, error: `Meter update failed: ${updErr.message}` });
          }
        }
      }


      // Create meter if missing
      if (!meterId) {
        const insertRow: any = {
          building_id: buildingId,
          label: meterLabel,
          type: meterType, // enum 'electric' | 'gas'
        };
        if (utility_provider && utility_provider.trim()) {
          insertRow.provider = utility_provider.trim(); // <-- write provider here
        }

        const { data: mIns, error: mInsErr } = await supabase
          .from("meters")
          .insert(insertRow)
          .select("id")
          .single();

        if (mInsErr) return res.status(500).json({ ok: false, error: `Meter insert failed: ${mInsErr.message}` });
        meterId = mIns!.id as string;
      }


      // ---------- 2) Find or insert bill (de-dup by meter_id + exact period) ----------
      const { data: existingBill, error: findBillErr } = await supabase
        .from("bills")
        .select("id")
        .eq("meter_id", meterId)
        .eq("period_start", period_start)
        .eq("period_end", period_end)
        .limit(1)
        .maybeSingle();

      if (findBillErr) return res.status(500).json({ ok: false, error: `Bill lookup failed: ${findBillErr.message}` });

      let billId: string;
      let createdBill = false;

      if (existingBill?.id) {
        const { data: upd, error: updErr } = await supabase
          .from("bills")
          .update({
            total_cost,
            demand_cost,
            bill_upload_id: billUploadId,
            building_id: buildingId,
          })
          .eq("id", existingBill.id)
          .select("id")
          .single();

        if (updErr) return res.status(500).json({ ok: false, error: `Bill update failed: ${updErr.message}` });
        billId = upd!.id;
      } else {
        const { data: bIns, error: bInsErr } = await supabase
          .from("bills")
          .insert({
            bill_upload_id: billUploadId,
            period_start,
            period_end,
            total_cost,
            demand_cost,
            building_id: buildingId,
            meter_id: meterId,
          })
          .select("id")
          .single();

        if (bInsErr) return res.status(500).json({ ok: false, error: `Bill insert failed: ${bInsErr.message}` });
        billId = bIns!.id as string;
        createdBill = true;
      }

      // ---------- 3) Upsert usage_readings (idempotent by UNIQUE bill_id) ----------
      const hasAnyUsage =
        (usage_kwh ?? null) !== null ||
        (usage_mcf ?? null) !== null ||
        (usage_mmbtu ?? null) !== null;

      let createdUsage = false;
      if (hasAnyUsage) {
        const { data: uIns, error: uErr } = await supabase
          .from("usage_readings")
          .upsert(
            {
              bill_id: billId,
              usage_kwh: usage_kwh ?? null,
              usage_mcf: usage_mcf ?? null,
              usage_mmbtu: usage_mmbtu ?? null,
              therms: null, // your client isn’t sending therms right now; adjust if needed
            },
            { onConflict: "bill_id" }
          )
          .select("id");

        if (uErr) return res.status(500).json({ ok: false, error: `Usage upsert failed: ${uErr.message}` });
        createdUsage = !!uIns?.length;
      }

      results.push({
        buildingId,
        meterId,
        billId,
        createdBill,
        createdUsage,
      });
    }

    const createdBills = results.filter(r => r.createdBill).length;
    const upsertedUsage = results.filter(r => r.createdUsage).length;

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
