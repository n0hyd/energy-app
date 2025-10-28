import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { XMLParser } from "fast-xml-parser";

// Self-contained PM helpers (GET only for now), no external client import
const PM_BASE_URL = process.env.PM_BASE_URL!;
const PM_USERNAME = process.env.PM_USERNAME!;
const PM_PASSWORD = process.env.PM_PASSWORD!;

function basicAuthHeader() {
  const token = Buffer.from(`${PM_USERNAME}:${PM_PASSWORD}`).toString("base64");
  return `Basic ${token}`;
}

/**
 * GET an XML endpoint from PM and return text
 */
async function pmGetXml(path: string) {
  const url = `${PM_BASE_URL}${path}`;
  const resp = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "application/xml",
      "Authorization": basicAuthHeader(),
    },
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`PM GET ${path} failed (${resp.status}): ${body.slice(0, 300)}`);
  }
  return await resp.text();
}

/**
 * Parse the minimal info we need from PM's meter list XML.
 * This is intentionally simple and tolerant; adjust if your XML differs.
 */
function parsePmMetersList(xml: string) {
  // Very loose parsing: find each <meter ...> block and pull a few attributes/children
  const meters: Array<{ id: string; type?: string; fuelType?: string; number?: string; alias?: string; description?: string; }> = [];
  const meterBlocks = xml.match(/<meter[\s\S]*?<\/meter>/g) || [];
  for (const block of meterBlocks) {
    const id = (block.match(/<id>(.*?)<\/id>/) || [,""])[1] ||
               (block.match(/id="([^"]+)"/) || [,""])[1];

    const type = (block.match(/<type>(.*?)<\/type>/) || [,""])[1];
    const fuelType = (block.match(/<fuelType>(.*?)<\/fuelType>/) || [,""])[1];
    const number = (block.match(/<number>(.*?)<\/number>/) || [,""])[1];
    const alias = (block.match(/<alias>(.*?)<\/alias>/) || [,""])[1];
    const description = (block.match(/<description>([\s\S]*?)<\/description>/) || [,""])[1];

    if (id) meters.push({ id, type, fuelType, number, alias, description });
  }
  return meters;
}


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


type MeterRow = {
  id: string;
  building_id: string;
  pm_meter_id: string | null;        // TODO(schema): meters.pm_meter_id text NULL
  type: string;                      // enum: 'electric' | 'gas' | ...
  provider: string;                  // ✅ provider (was utility)
  label: string | null;              // meter number lives here per your note
  building_name: string;
  pm_property_id: string;            // buildings.pm_property_id
};

type DryRunAction = {
  meter_id: string;
  building: string;
  pmPropertyId: string;
  localMeterNumber?: string | null;
  localType: string;
  localProvider: string;             // ✅ renamed field
  decision: "link" | "create" | "skip";
  reason: string;
  chosenPmMeterId?: string;
};

type SyncActionResult = DryRunAction & {
  wrotePmMeterId?: string;
  dbUpdated?: boolean;
  pmCall?: "link" | "create";
};

function normalize(s?: string | null) {
  return (s ?? "").trim().toLowerCase();
}
function extractLocalMeterNumber(m: MeterRow): string | null {
  return m.label ? m.label.trim() : null;
}

// List PM meters for a property (uses our pmGetXml + parser)
async function listPmMetersForProperty(pmPropertyId: string) {
  const xml = await pmGetXml(`/property/${encodeURIComponent(pmPropertyId)}/meter/list`);
  return parsePmMetersList(xml);
}

async function linkExistingPmMeter(_pmPropertyId: string, pmMeterId: string) {
  return pmMeterId; // no PM call; we just persist the ID locally
}

// Create is intentionally disabled here to avoid sending malformed XML.
// We’ll wire this to your real client once we confirm its export names.
async function createPmMeter(_pmPropertyId: string, _local: MeterRow) {
throw new Error("PM create not implemented in this route yet — dry-run and 'link' will work. We’ll hook 'create' to your client next.");
}

function chooseMatch(pmMeters: any[], local: MeterRow, localNum: string | null) {
  const nType = normalize(local.type);
  const nProv = normalize(local.provider);

  if (localNum) {
    const byNumber = pmMeters.find((m: any) => normalize(m.number) === normalize(localNum));
    if (byNumber) return { decision: "link" as const, pmMeterId: byNumber.id, reason: "matched by meter number" };
  }

  const byTypeProvider = pmMeters.find((m: any) => {
    const mType = normalize(m.type || m.fuelType);
    const mAlias = normalize(m.alias || m.description || "");
    return mType === nType && (nProv ? mAlias.includes(nProv) : true);
  });
  if (byTypeProvider) {
    return { decision: "link" as const, pmMeterId: byTypeProvider.id, reason: "matched by type + alias/provider" };
  }

  return { decision: "create" as const, reason: "no match found on property" };
}

// ---- Handler ----
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const dry = req.query.dry === "1" || req.query.dry === "true";
    const orgId = String(req.query.orgId || "").trim();
    if (!orgId) return res.status(400).json({ ok: false, error: "Missing orgId" });

    // 1) Buildings for this org that already have pm_property_id
    const { data: bldgs, error: bErr } = await supabaseAdmin
      .from("buildings")
      .select("id,name,pm_property_id")
      .eq("org_id", orgId)
      .not("pm_property_id", "is", null);

    if (bErr) return res.status(500).json({ ok: false, error: `Buildings query failed: ${bErr.message}` });
    const buildingIds = (bldgs ?? []).map(b => b.id);
    if (buildingIds.length === 0) {
      return res.status(200).json({ ok: true, mode: dry ? "dry-run" : "live", count: 0, message: "No properties with pm_property_id." });
    }

    // 2) Candidate meters: pm_meter_id IS NULL and belongs to those buildings
    const { data: meters, error: mErr } = await supabaseAdmin
      .from("meters")
      .select(`
        id,
        building_id,
        pm_meter_id,
        type,
        provider,             
        label,
        buildings:building_id (
          id,
          name,
          pm_property_id
        )
      `)
      .is("pm_meter_id", null)
      .in("building_id", buildingIds);

    if (mErr) return res.status(500).json({ ok: false, error: `Meters query failed: ${mErr.message}` });

    const input: MeterRow[] = (meters || [])
      .map((m: any) => ({
        id: m.id,
        building_id: m.building_id,
        pm_meter_id: m.pm_meter_id ?? null,
        type: m.type,
        provider: m.provider,                       // ✅ provider
        label: m.label ?? null,
        building_name: m.buildings?.name ?? "(unknown building)",
        pm_property_id: m.buildings?.pm_property_id,
      }))
      .filter(m => !!m.pm_property_id);

    if (input.length === 0) {
      return res.status(200).json({
        ok: true,
        mode: dry ? "dry-run" : "live",
        count: 0,
        message: "No meters require PM linking/creation.",
      });
    }

    // 3) Dry-run decision build
    const dryRun: DryRunAction[] = [];
    for (const row of input) {
      const pmMeters = await listPmMetersForProperty(row.pm_property_id);
      const localNum = extractLocalMeterNumber(row);
      const choice = chooseMatch(pmMeters, row, localNum);

      dryRun.push({
        meter_id: row.id,
        building: row.building_name,
        pmPropertyId: row.pm_property_id,
        localMeterNumber: localNum,
        localType: row.type,
        localProvider: row.provider,                // ✅ provider
        decision: choice.decision,
        reason: choice.reason,
        chosenPmMeterId: (choice as any).pmMeterId,
      });
    }

    if (dry) {
      return res.status(200).json({
        ok: true,
        mode: "dry-run",
        count: dryRun.length,
        sample: dryRun.slice(0, 10),
        actions: dryRun,
      });
    }

    // 4) Live execution
    const results: SyncActionResult[] = [];
    for (const action of dryRun) {
      const base: SyncActionResult = { ...action };
      try {
        let pmMeterId: string | undefined;

        if (action.decision === "link" && action.chosenPmMeterId) {
          pmMeterId = await linkExistingPmMeter(action.pmPropertyId, action.chosenPmMeterId);
          base.pmCall = "link";
        } else if (action.decision === "create") {
          const local = input.find(m => m.id === action.meter_id)!;
          pmMeterId = await createPmMeter(action.pmPropertyId, local);
          base.pmCall = "create";
        } else {
          base.decision = "skip";
          base.reason = base.reason || "No action required.";
        }

        if (pmMeterId) {
          const { error: upErr } = await supabaseAdmin
            .from("meters")
            .update({ pm_meter_id: pmMeterId })
            .eq("id", action.meter_id);

          if (upErr) {
            base.reason = `PM ok, DB update failed: ${upErr.message}`;
          } else {
            base.dbUpdated = true;
            base.wrotePmMeterId = pmMeterId;
          }
        }

        results.push(base);
      } catch (e: any) {
        results.push({ ...base, reason: `Failed: ${e?.message || String(e)}` });
      }
    }

    const linked = results.filter(r => r.pmCall === "link").length;
    const created = results.filter(r => r.pmCall === "create").length;

    return res.status(200).json({
      ok: true,
      mode: "live",
      total: results.length,
      linked,
      created,
      results,
    });
  } catch (err: any) {
    console.error("[meter-sync] crashed:", err);
    return res.status(500).json({ ok: false, error: err?.message || String(err) });
  }
}
