// src/pages/api/ingest-bills.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // server-side only
);

// mirror the client-side normalizer (directionals, punctuation, spaces, upper)
function normAddr(raw?: string | null) {
  if (!raw) return "";
  let s = String(raw);
  // trim to first digit (defensive against leading noise)
  const firstDigit = s.search(/\d/);
  if (firstDigit > 0) s = s.slice(firstDigit);

  s = s.replace(/[|()]/g, " ").replace(/\bPER\s+MCF\b.*$/i, "").trim();
  s = s.replace(/\b([NSEW])\.\b/gi, "$1 "); // N. -> N

  s = s.toUpperCase().replace(/[.,#]/g, " ").replace(/\s+/g, " ").trim();

  // compress suffix to USPS-style if it's the last token (DRIVE -> DR, etc.)
  const map: Record<string, string> = {
    AVENUE: "AVE", AVE: "AVE",
    BOULEVARD: "BLVD", BLVD: "BLVD",
    CIRCLE: "CIR", CIR: "CIR",
    COURT: "CT", CT: "CT",
    DRIVE: "DR", DR: "DR",
    HIGHWAY: "HWY", HWY: "HWY",
    LANE: "LN", LN: "LN",
    PARKWAY: "PKWY", PKWY: "PKWY",
    PLACE: "PL", PL: "PL",
    ROAD: "RD", RD: "RD",
    STREET: "ST", ST: "ST",
    TERRACE: "TER", TER: "TER",
    WAY: "WAY",
  };
  const parts = s.split(" ");
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    const abbr = map[last] || map[last.replace(/S$/, "")];
    if (abbr) parts[parts.length - 1] = abbr;
    s = parts.join(" ");
  }
  return s;
}

type IngestItem = {
  buildingId?: string | null;
  addressNormalized?: string | null;     // optional hint
  service_address?: string | null;
  meter_no?: string | null;
  period_start: string;                  // YYYY-MM-DD
  period_end: string;                    // YYYY-MM-DD
  total_cost?: number | null;
  demand_cost?: number | null;
  usage_kwh?: number | null;
  usage_mcf?: number | null;
  usage_mmbtu?: number | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const { orgId, utility, items, autoCreateMeter, billUploadId } = req.body as {
      orgId: string;
      utility: "electric" | "gas" | "water";
      items: IngestItem[];
      autoCreateMeter?: boolean;
      billUploadId?: string | null;
    };

    if (!orgId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, error: "Missing orgId or items" });
    }

    // Pull buildings once for the org
    const { data: buildings, error: bErr } = await supabase
      .from("buildings")
      .select("id,address,city,state")
      .eq("org_id", orgId);

    if (bErr) throw bErr;

    // Quick lookup by normalized address
    const addrIndex = new Map<string, string>(); // norm -> building_id
    for (const b of buildings || []) {
      const n = normAddr(b.address);
      if (n) addrIndex.set(n, b.id);
      const full = normAddr([b.address, b.city, b.state].filter(Boolean).join(" "));
      if (full) addrIndex.set(full, b.id);
    }

    // helper: find building by buildingId|meter|address
    async function resolveBuildingId(item: IngestItem): Promise<{ buildingId: string; meterId?: string }> {
      // 1) explicit buildingId (client pre-match)
      if (item.buildingId) {
        return { buildingId: item.buildingId };
      }

      // 2) try meter_no
      if (item.meter_no) {
        // do we already have a meter with this label for this org & utility?
        // meters table links to building; but we need org scoping -> join via buildings
        const { data: meterRows, error: mErr } = await supabase
          .from("meters")
          .select("id, label, utility, building_id, buildings!inner(org_id)")
          .eq("buildings.org_id", orgId)
          .eq("utility", utility as any) // enum
          .eq("label", String(item.meter_no));

        if (mErr) throw mErr;

        const found = (meterRows || [])[0];
        if (found) {
          return { buildingId: found.building_id, meterId: found.id };
        }
      }

      // 3) address fallback
      const norm = item.addressNormalized || normAddr(item.service_address);
      if (norm) {
        const byAddr = addrIndex.get(norm);
        if (byAddr) return { buildingId: byAddr };
      }

      // 4) couldn’t resolve
      const orgHint = (buildings || []).length
        ? (buildings || []).map(b => `• ${b.address}`).join("\n")
        : "— none found —";
      throw new Error(
        `No building match for bill address: "${item.service_address ?? ""}"\n` +
        `Tip: normalize stored building addresses to USPS style (consistent suffix & punctuation).\n` +
        `Org candidates:\n${orgHint}`
      );
    }

    // Insert each bill (+ usage)
    const results: any[] = [];
    for (const item of items) {
      const { buildingId, meterId: existingMeterId } = await resolveBuildingId(item);

      // Ensure a meter exists (if meter_no & allowed to auto-create)
      let meterId = existingMeterId;
      if (!meterId && item.meter_no) {
        // Try again to find a meter JUST for this building + label
        const { data: tryMeter } = await supabase
          .from("meters")
          .select("id")
          .eq("building_id", buildingId)
          .eq("label", String(item.meter_no))
          .eq("utility", utility as any)
          .limit(1)
          .maybeSingle();

        if (tryMeter?.id) {
          meterId = tryMeter.id;
        } else if (autoCreateMeter) {
          const { data: meterIns, error: mInsErr } = await supabase
            .from("meters")
            .insert({
              building_id: buildingId,
              label: String(item.meter_no),
              utility: utility as any,
            })
            .select("id")
            .single();
          if (mInsErr) throw mInsErr;
          meterId = meterIns.id;
        }
      }

      if (!meterId) {
        // Fallback: create a generic meter for this building/utility if none exists and autoCreate is on
        if (autoCreateMeter) {
          const { data: meterIns, error: mInsErr } = await supabase
            .from("meters")
            .insert({
              building_id: buildingId,
              label: item.meter_no ? String(item.meter_no) : `${utility.toUpperCase()}-AUTO`,
              utility: utility as any,
            })
            .select("id")
            .single();
          if (mInsErr) throw mInsErr;
          meterId = meterIns.id;
        } else {
          throw new Error(`No meter found for building ${buildingId} and autoCreateMeter=false`);
        }
      }

      // Insert bill
      const { data: billIns, error: billErr } = await supabase
        .from("bills")
        .insert({
          bill_upload_id: item ? billUploadId ?? null : null,
          period_start: item.period_start,
          period_end: item.period_end,
          total_cost: item.total_cost ?? null,
          demand_cost: item.demand_cost ?? null,
          building_id: buildingId,
          meter_id: meterId,
        })
        .select("id")
        .single();

      if (billErr) throw billErr;

      // Insert usage
      const { error: usageErr } = await supabase.from("usage_readings").insert({
        bill_id: billIns.id,
        usage_kwh: item.usage_kwh ?? null,
        usage_mcf: item.usage_mcf ?? null,
        usage_mmbtu: item.usage_mmbtu ?? null,
        therms: null,
      });
      if (usageErr) throw usageErr;

      results.push({ bill_id: billIns.id, building_id: buildingId, meter_id: meterId });
    }

    return res.status(200).json({ ok: true, results });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
}
