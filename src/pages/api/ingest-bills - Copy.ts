// pages/api/ingest-bills.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

/** ========== ENV (server-only) ========== */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  // Fail fast with a clear message if vars are missing
  throw new Error(
    "Missing Supabase env vars. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local"
  );
}

// One server-side client for the whole module (service role bypasses RLS for these controlled writes)
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

/** ========== Types from OCR UI payload ========== */
type IncomingItem = {
  vendor: "evergy" | "kgs" | "woodriver" | "unknown";
  address: string | null;
  meter_no: string | null;
  period_start: string | null; // "MM-DD-YY", "YYYY-MM-DD", or "MM/DD/YYYY"
  period_end: string | null;
  usage_kwh: number | null;
  usage_mcf: number | null;
  usage_mmbtu: number | null;
  section_total_cost: number | null; // not stored directly, but OK to accept
  total_cost: number | null;
  demand_cost: number | null;
  bill_upload_id: string | null; // optional linkage
};

type RowResult =
  | { ok: true; idx: number; bill_id: string; usage_id: string | null; meter_id: string; building_id: string }
  | { ok: false; idx: number; error: string };

/** ========== Small helpers ========== */

// Normalize address like the OCR page does (soft cleanup)
function normalizeAddress(raw?: string | null): string {
  if (!raw) return "";
  let s = String(raw);
  s = s.replace(/[|()]/g, " ").replace(/\s+/g, " ").trim();
  const firstDigit = s.search(/\d/);
  if (firstDigit > 0) s = s.slice(firstDigit);
  s = s.replace(/\bPER\s+MCF\b.*$/i, "").trim();
  s = s.replace(/(\d)([NSEW])\.?/gi, "$1 $2 ");
  s = s.toUpperCase().replace(/[.,#]/g, " ").replace(/\s+/g, " ").trim();
  return s;
}

// Parse "MM-DD-YY", "MM/DD/YYYY", or "YYYY-MM-DD" → "YYYY-MM-DD"
function toIsoDate(input?: string | null): string | null {
  if (!input) return null;
  const s = input.trim();

  // YYYY-MM-DD
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // MM/DD/YYYY
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1]}-${m[2]}`;

  // MM-DD-YY → assume 20YY
  m = s.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (m) {
    const year = Number(m[3]);
    const yyyy = year >= 70 ? 1900 + year : 2000 + year; // crude pivot, adjust if needed
    return `${yyyy}-${m[1]}-${m[2]}`;
  }

  // MM-DD-YYYY
  m = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[1]}-${m[2]}`;

  // MM/DD/YY
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (m) {
    const year = Number(m[3]);
    const yyyy = year >= 70 ? 1900 + year : 2000 + year;
    return `${yyyy}-${m[1]}-${m[2]}`;
  }

  return null;
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Utility/type inference
function inferUtilityAndType(item: IncomingItem): { utility: "electric" | "gas"; type: "electric" | "gas" } {
  if (numOrNull(item.usage_kwh) != null) return { utility: "electric", type: "electric" };
  // If any gas-ish usage present, mark gas
  if (numOrNull(item.usage_mcf) != null || numOrNull(item.usage_mmbtu) != null) return { utility: "gas", type: "gas" };
  // Fallback by vendor, if needed
  if (item.vendor === "evergy") return { utility: "electric", type: "electric" };
  return { utility: "gas", type: "gas" };
}

/** ========== DB helpers ========== */

async function getAllBuildingsMap(client: SupabaseClient) {
  // buildings: id, name, address, org_id, ...
  const { data, error } = await client
    .from("buildings")
    .select("id,name,address,org_id")
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to load buildings: ${error.message}`);

  // Build a lookup by normalized address (many → first match)
  const map = new Map<string, { id: string; name: string; address: string | null; org_id: string }[]>();
  (data ?? []).forEach((b) => {
    const key = normalizeAddress(b.address ?? "");
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(b as any);
  });
  return map;
}

async function findOrCreateMeter(
  client: SupabaseClient,
  building_id: string,
  label: string, // we store meter_no here
  utility: "electric" | "gas",
  type: "electric" | "gas"
): Promise<string> {
  // meters: id, building_id, type, label, utility:contentReference[oaicite:3]{index=3}
  const { data: existing, error: selErr } = await client
    .from("meters")
    .select("id,label,utility,type,building_id")
    .eq("building_id", building_id)
    .eq("label", label)
    .eq("utility", utility)
    .limit(1);

  if (selErr) throw new Error(`Failed to search meters: ${selErr.message}`);
  if (existing && existing.length > 0) return existing[0].id;

  const { data: created, error: insErr } = await client
    .from("meters")
    .insert([{ building_id, label, utility, type }])
    .select("id")
    .single();

  if (insErr) throw new Error(`Failed to create meter: ${insErr.message}`);
  return created!.id;
}

async function findExistingBill(
  client: SupabaseClient,
  meter_id: string,
  period_start: string,
  period_end: string
): Promise<string | null> {
  const { data, error } = await client
    .from("bills")
    .select("id")
    .eq("meter_id", meter_id)
    .eq("period_start", period_start)
    .eq("period_end", period_end)
    .limit(1);

  if (error) throw new Error(`Failed checking existing bill: ${error.message}`);
  return data && data.length > 0 ? data[0].id : null;
}

async function insertBillAndUsage(client: SupabaseClient, args: {
  building_id: string;
  meter_id: string;
  bill_upload_id: string | null;
  period_start: string;
  period_end: string;
  total_cost: number | null;
  demand_cost: number | null;
  usage_kwh: number | null;
  usage_mcf: number | null;
  usage_mmbtu: number | null;
}): Promise<{ bill_id: string; usage_id: string | null }> {
  // Insert bill:contentReference[oaicite:4]{index=4}
  const { data: bill, error: billErr } = await client
    .from("bills")
    .insert([{
      building_id: args.building_id,
      meter_id: args.meter_id,
      bill_upload_id: args.bill_upload_id ?? null,
      period_start: args.period_start,
      period_end: args.period_end,
      total_cost: args.total_cost,
      demand_cost: args.demand_cost
    }])
    .select("id")
    .single();

  if (billErr) throw new Error(`Failed to insert bill: ${billErr.message}`);
  const bill_id = bill!.id as string;

  // Insert usage_readings (one row per bill, columns are nullable & constrained):contentReference[oaicite:5]{index=5}
  const hasAnyUsage =
    args.usage_kwh != null || args.usage_mcf != null || args.usage_mmbtu != null;

  if (!hasAnyUsage) {
    return { bill_id, usage_id: null };
  }

  const { data: usage, error: usageErr } = await client
    .from("usage_readings")
    .insert([{
      bill_id,
      usage_kwh: args.usage_kwh,
      usage_mcf: args.usage_mcf,
      usage_mmbtu: args.usage_mmbtu
      // `therms` left null; you may compute later if you want
    }])
    .select("id")
    .single();

  if (usageErr) {
    // Roll back bill if usage insert fails (best-effort since no SQL transaction here)
    await client.from("bills").delete().eq("id", bill_id);
    throw new Error(`Failed to insert usage: ${usageErr.message}`);
  }

  return { bill_id, usage_id: usage!.id as string };
}

/** ========== Handler ========== */
export default async function handler(req: NextApiRequest, res: NextApiResponse<RowResult[] | { error: string }>) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { items } = (req.body ?? {}) as { items?: IncomingItem[] };
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Body must include { items: IncomingItem[] }" });
    }

    // Preload buildings once; we’ll match by normalized address
    const buildingsMap = await getAllBuildingsMap(supabase);

    const results: RowResult[] = [];
    for (let idx = 0; idx < items.length; idx++) {
      const it = items[idx];

      try {
        // Basic validation / normalization
        const addressNorm = normalizeAddress(it.address);
        const meterNo = (it.meter_no ?? "").trim();
        const startIso = toIsoDate(it.period_start);
        const endIso = toIsoDate(it.period_end);
        const totalCost = numOrNull(it.total_cost);
        const demandCost = numOrNull(it.demand_cost);
        const usage_kwh = numOrNull(it.usage_kwh);
        const usage_mcf = numOrNull(it.usage_mcf);
        const usage_mmbtu = numOrNull(it.usage_mmbtu);

        if (!addressNorm) throw new Error("Missing or empty address");
        if (!startIso || !endIso) throw new Error("Invalid period_start/period_end");
        if (!meterNo) throw new Error("Missing meter_no");

        // Resolve building by normalized address (must exist):contentReference[oaicite:6]{index=6}
        const candidates = buildingsMap.get(addressNorm) ?? [];
        if (candidates.length === 0) {
          throw new Error(
            `No building matched address "${it.address}". Create building first or edit the address to match.`
          );
        }
        if (candidates.length > 1) {
          throw new Error(
            `Multiple buildings matched address "${it.address}". Please disambiguate (unique addresses).`
          );
        }
        const building = candidates[0];

        // Infer utility/type from usage or vendor, then find/create meter:contentReference[oaicite:7]{index=7}
        const { utility, type } = inferUtilityAndType(it);
        const meter_id = await findOrCreateMeter(supabase, building.id, meterNo, utility, type);

        // Avoid duplicates: skip if same meter_id + exact period already exists:contentReference[oaicite:8]{index=8}
        const existing = await findExistingBill(supabase, meter_id, startIso, endIso);
        if (existing) {
          results.push({ ok: true, idx, bill_id: existing, usage_id: null, meter_id, building_id: building.id });
          continue;
        }

        // Insert bill + usage
        const ins = await insertBillAndUsage(supabase, {
          building_id: building.id,
          meter_id,
          bill_upload_id: it.bill_upload_id ?? null,
          period_start: startIso,
          period_end: endIso,
          total_cost: totalCost,
          demand_cost: demandCost,
          usage_kwh,
          usage_mcf,
          usage_mmbtu
        });

        results.push({ ok: true, idx, bill_id: ins.bill_id, usage_id: ins.usage_id, meter_id, building_id: building.id });
      } catch (e: any) {
        results.push({ ok: false, idx, error: e?.message ?? "Unknown error" });
      }
    }

    return res.status(200).json(results);
  } catch (err: any) {
    console.error("Ingest error (top-level):", err);
    return res.status(500).json({ error: err?.message ?? "Unknown server error" });
  }
}
