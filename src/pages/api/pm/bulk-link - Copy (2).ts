// src/pages/api/pm/bulk-link.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Minimal XML helpers (no external deps)
 */
type PmPropertyLite = {
  propertyId: string;
  name?: string;
  address1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
};

function takeSample<T>(arr: T[], n = 5): T[] {
  return Array.isArray(arr) ? arr.slice(0, Math.max(0, Math.min(n, arr.length))) : [];
}

function normalize(str: string | null | undefined): string {
  return (str ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}
/** Tokenize a name and drop weak/stop tokens */
function tokenizeName(s: string | undefined | null): string[] {
  const stop = new Set([
    "USD","USD260","SCHOOL","SCHOOLS","DISTRICT","ELEMENTARY","MIDDLE","HIGH","SENIOR","JUNIOR",
    "CENTER","CENTRE","LEARNING","ADMIN","ADMINISTRATIVE","BUILDING","FACILITY","CAMPUS","STADIUM",
    "FIELD","GYM","AUXILIARY","MAINTENANCE","KITCHEN","CENTRAL","PRIMARY","SECONDARY","THE","OF",
    "AND","DE","USD-260","USD_260"
  ]);

  const cleaned = normalize(s)
    .replace(/[^A-Z0-9 ]+/g, " "); // keep alnum and spaces

  return cleaned
    .split(/\s+/)
    .filter(t => t.length >= 3 && !stop.has(t));
}

/** Jaccard similarity over token sets */
function nameSimilarity(a?: string | null, b?: string | null): number {
  const A = new Set(tokenizeName(a));
  const B = new Set(tokenizeName(b));
  if (A.size === 0 || B.size === 0) return 0;

  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

function addrKey(address?: string | null, city?: string | null, state?: string | null, postal?: string | null) {
  const parts = [normalize(address)];
  const cityN = normalize(city);
  const stateN = normalize(state);
  const postN = normalize(postal);
  if (cityN) parts.push(cityN);
  if (stateN) parts.push(stateN);
  if (postN) parts.push(postN);
  return parts.filter(Boolean).join(" | ");
}

/**
 * ENERGY STAR / Portfolio Manager helpers
 */
function getPmAuthHeader() {
  const username = process.env.PM_USERNAME || "";
  const password = process.env.PM_PASSWORD || "";
  if (!username || !password) {
    throw new Error("Missing PM_USERNAME or PM_PASSWORD env vars");
  }
  return "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
}

function pmBase() {
  return (process.env.PM_BASE_URL?.replace(/\/+$/, "") || "https://portfoliomanager.energystar.gov/ws");
}

async function fetchPmXml(path: string): Promise<string> {
  const url = `${pmBase()}${path}`;
  const resp = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/xml",
      Authorization: getPmAuthHeader(),
    },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`PM GET ${path} failed ${resp.status}: ${text.slice(0, 400)}`);
  }
  return await resp.text();
}

function parseFirstTag(xml: string, tag: string): string | undefined {
  const m =
    xml.match(new RegExp(`<\\s*${tag}\\s*>\\s*<!\\[CDATA\\[(.*?)\\]\\]>\\s*<\\s*/\\s*${tag}\\s*>`, "i")) ||
    xml.match(new RegExp(`<\\s*${tag}\\s*>\\s*([^<]+?)\\s*<\\s*/\\s*${tag}\\s*>`, "i"));
  return m?.[1]?.trim();
}

/** Parse PM /account response → numeric id (as string) */
function parsePmAccountId(xml: string): string | undefined {
  // Commonly <account><id>123456</id>...</account>
  const id =
    parseFirstTag(xml, "id") ||
    parseFirstTag(xml, "accountId") ||
    parseFirstTag(xml, "accountID");
  return id?.replace(/[^\d]/g, "");
}

/** When /property/list returns <links><link ... id="..." hint="..."/></links> */
function parsePropertyLinks(xml: string): Array<{ id: string; hint?: string }> {
  const out: Array<{ id: string; hint?: string }> = [];
  const linkRe = /<\s*link\b([^>]+)>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(xml))) {
    const attrs = m[1];
    const id = (attrs.match(/\bid\s*=\s*"(\d+)"/i)?.[1] || "").trim();
    const hint = (attrs.match(/\bhint\s*=\s*"([^"]*)"/i)?.[1] || "").trim();
    if (id) out.push({ id, hint: hint || undefined });
  }
  return out;
}

/** Parse details from /property/{id} */
function parsePmPropertyDetail(xml: string): PmPropertyLite | null {
  // Extract by tags (fallbacks included)
  const grab = (tag: string) =>
    (xml.match(new RegExp(`<\\s*${tag}\\s*>\\s*<!\\[CDATA\\[(.*?)\\]\\]>\\s*<\\s*/\\s*${tag}\\s*>`, "i")) ||
      xml.match(new RegExp(`<\\s*${tag}\\s*>\\s*([^<]+?)\\s*<\\s*/\\s*${tag}\\s*>`, "i")))?.[1]?.trim();

  const propertyId = grab("id") || grab("propertyId") || "";
  const name = grab("name");
  // Address fields can live under <address> or <primaryAddress>, etc.
  // Try multiple common tags to be resilient.
  const address1 =
    grab("address1") || grab("addressLine1") || grab("address") || grab("streetAddress") || undefined;
  const city = grab("city");
  const state = grab("state") || grab("stateCode");
  const postalCode = grab("postalCode") || grab("postal") || grab("zip") || grab("zipcode");

  if (!propertyId) return null;
  return { propertyId, name, address1, city, state, postalCode };
}
/** Simple delay */
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Fetch and parse one property detail (with retry/backoff). Falls back to hint-only if all retries fail. */
async function fetchPropertyDetailLite(id: string, hint?: string): Promise<PmPropertyLite | null> {
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const xml = await fetchPmXml(`/property/${encodeURIComponent(id)}`);
      const parsed = parsePmPropertyDetail(xml);
      if (parsed) return parsed;
      // If parsed is null, treat as error to try retry path
      throw new Error("Empty or unparsable property detail");
    } catch (e: any) {
      const txt = String(e?.message || e);
      const is429 = /429|Rate limit exceeded/i.test(txt);
      const isLast = attempt === maxAttempts;

      console.warn(`[pm] Failed to fetch/parse property ${id} (attempt ${attempt}/${maxAttempts})`, txt);

      if (isLast) {
        // Fallback: at least return id + name from hint so we can log/inspect
        return hint ? { propertyId: id, name: hint } : null;
      }

      // Exponential backoff with small jitter; be gentle with PM
      const base = is429 ? 900 : 400;
      const delay = base * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 150);
      await sleep(delay);
    }
  }
  return null;
}


/**
 * Supabase helpers
 */
function getAdminSupabase() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
  return createSupabaseClient(url, key, { auth: { persistSession: false } });
}

type BuildingRow = {
  id: string;
  org_id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  pm_property_id?: string | null;
};

async function getBuildingsForOrg(orgId: string): Promise<BuildingRow[]> {
  const sb = getAdminSupabase();
  const { data, error } = await sb
    .from("buildings")
    .select("id, org_id, name, address, city, state, postal_code, pm_property_id")
    .eq("org_id", orgId);
  if (error) throw error;
  return (data ?? []) as BuildingRow[];
}

async function setPmPropertyId(buildingId: string, pmPropertyId: string): Promise<void> {
  const sb = getAdminSupabase();
  const { error } = await sb.from("buildings").update({ pm_property_id: pmPropertyId }).eq("id", buildingId);
  if (error) throw error;
}

/**
 * API handler
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const orgId = (req.query.orgId as string) || (req.body?.orgId as string) || "";
  const dry = String(req.query.dry ?? req.body?.dry ?? "").trim() !== "" && String(req.query.dry ?? req.body?.dry) !== "0";
  if (!orgId) return res.status(400).json({ ok: false, error: "Missing orgId" });

  let printedOnce = false;

  try {
    // --- 0) Resolve PM accountId (required by property list endpoint) ---
    const accountXml = await fetchPmXml("/account");

    // DEBUG: peek at raw account XML
    console.log("[pm] Raw /account XML (first 300):", (accountXml ?? "").slice(0, 300));

    // Allow override via env if provided (useful for multi-account setups)
    let accountId = (process.env.PM_ACCOUNT_ID || "").trim();
    if (!accountId) {
      accountId = parsePmAccountId(accountXml) || "";
    }
    if (!accountId) {
      throw new Error("Could not resolve PM accountId from /account response. Set PM_ACCOUNT_ID or check PM creds.");
    }

    // DEBUG: which accountId are we using?
    console.log("[pm] Using PM accountId:", accountId);

    // --- 1) Pull PM properties for this account ---
    const xmlData = await fetchPmXml(`/account/${encodeURIComponent(accountId)}/property/list`);

    // DEBUG: peek at the raw XML (first 400 chars)
    console.log("[pm] Raw ENERGY STAR property/list XML (first 400 chars):", (xmlData ?? "").slice(0, 400));

// --- 2) Parse lightweight list for matching ---
let pmProps: PmPropertyLite[] = [];
if (/<\s*links\b/i.test(xmlData)) {
  const links = parsePropertyLinks(xmlData);
  console.log("[pm] property/list returned links; will fetch property details", {
    linkCount: links.length,
    sample: links.slice(0, 5),
  });

  // In dry-run, just fetch a few to avoid rate limits; in commit, fetch all (sequential).
  const maxToFetch = dry ? Math.min(links.length, 6) : links.length;

  const collected: PmPropertyLite[] = [];
  for (let i = 0; i < maxToFetch; i++) {
    const { id, hint } = links[i];
    const detail = await fetchPropertyDetailLite(id, hint);
    if (detail) collected.push(detail);

    // Gentle throttle between calls to respect PM limits
    // (fetchPropertyDetailLite also backs off on 429s)
    await sleep(900);
  }

  pmProps = collected;

  console.log("[pm] Fetched property details:", {
    count: pmProps.length,
    sample: pmProps.slice(0, 3),
  });
} else {
  pmProps = parsePmPropertiesLite(xmlData);
}


    // DEBUG: show what we pulled from ENERGY STAR (visible in PowerShell)
    console.log("[pm] Pulled ENERGY STAR properties:", {
      count: Array.isArray(pmProps) ? pmProps.length : "unknown",
      sample: takeSample(pmProps, 3),
    });

    // --- 3) Build a map keyed by normalized address ---
    const pmByAddr = new Map<string, PmPropertyLite[]>();
    for (const p of pmProps) {
      const key = addrKey(p.address1, p.city, p.state, p.postalCode) || addrKey(p.address1);
      if (!key) continue;
      const arr = pmByAddr.get(key) ?? [];
      arr.push(p);
      pmByAddr.set(key, arr);
    }

    // DEBUG: show a few normalized address keys from PM
    console.log("[pm] Address keys from ENERGY STAR (first 5):", takeSample(Array.from(pmByAddr.keys()), 5));

    // --- 4) Fetch buildings in this org and pick those needing a link ---
    const buildings = await getBuildingsForOrg(orgId);
    const needsLinking = buildings.filter(b => !b.pm_property_id || String(b.pm_property_id).trim() === "");

    // DEBUG: confirm buildings we're trying to link
    console.log("[pm] Buildings missing pm_property_id:", {
      count: needsLinking.length,
      sample: takeSample(
        needsLinking.map(b => ({
          id: b.id,
          name: b.name,
          address: b.address,
          city: b.city,
          state: b.state,
          postal_code: b.postal_code,
        })),
        3
      ),
    });

    // --- 5) Attempt to match by normalized address key ---
    const results: Array<{
  buildingId: string;
  buildingName: string;
  key: string;
  pmPropertyId?: string;
  pmCandidates?: Array<{ propertyId: string; name?: string }>;
  matched: boolean;
  reason?: string;
  matchMethod?: "address" | "name-fallback";
  matchScore?: number; // 0..1 when name-fallback or for logging address name-sim
}> = [];


for (const b of needsLinking) {
  const key =
    addrKey(b.address, b.city, b.state, b.postal_code) ||
    addrKey(b.address) ||
    "";

  if (!printedOnce) {
    console.log("[pm] First building match attempt:", {
      building: {
        id: b.id,
        name: b.name,
        address: b.address,
        city: b.city,
        state: b.state,
        postal: b.postal_code,
      },
      key,
      pmHit: pmByAddr.get(key),
    });
    printedOnce = true;
  }

  if (!key) {
    results.push({
      buildingId: b.id,
      buildingName: b.name,
      key,
      matched: false,
      reason: "No usable address fields present",
    });
    continue;
  }

  const hits = pmByAddr.get(key) ?? [];

  if (hits.length === 1) {
    // Single address hit – keep it, sanity-log low name similarity
    const hit = hits[0];
    const score = nameSimilarity(b.name, hit.name);
    if (score < 0.35) {
      console.log("[pm] Address match found but name looks off; keeping match but logging", {
        building: { id: b.id, name: b.name },
        pm: { id: hit.propertyId, name: hit.name },
        score: score.toFixed(2),
      });
    }
      results.push({
    buildingId: b.id,
    buildingName: b.name,
    key,
    pmPropertyId: hit.propertyId,
    pmCandidates: [{ propertyId: hit.propertyId, name: hit.name }],
    matched: true,
    reason: score < 0.35 ? `address-match low-name-sim=${score.toFixed(2)}` : "address-match",
    matchMethod: "address",
    matchScore: score,
  });

  } else if (hits.length > 1) {
    // Multiple address hits – disambiguate by name similarity
    const scored = hits
      .map(h => ({
        prop: h,
        score: nameSimilarity(b.name, h.name),
      }))
      .sort((x, y) => y.score - x.score);

    const best = scored[0];
    const second = scored[1]?.score ?? 0;
    const THRESH = 0.55;
    const CLEAR_MARGIN = 0.15;

    if (best && best.score >= THRESH && (best.score - second) >= CLEAR_MARGIN) {
      console.log("[pm] Name fallback disambiguated", {
        building: { id: b.id, name: b.name },
        chosen: { id: best.prop.propertyId, name: best.prop.name, score: best.score.toFixed(2) },
      });
      results.push({
  buildingId: b.id,
  buildingName: b.name,
  key,
  pmPropertyId: best.prop.propertyId,
  pmCandidates: [{ propertyId: best.prop.propertyId, name: best.prop.name }],
  matched: true,
  reason: `address-ambiguous, name-fallback score=${best.score.toFixed(2)}`,
  matchMethod: "name-fallback",
  matchScore: best.score,
});

    } else {
      results.push({
        buildingId: b.id,
        buildingName: b.name,
        key,
        pmCandidates: takeSample(
          hits.map(h => ({ propertyId: h.propertyId, name: h.name })),
          5
        ),
        matched: false,
        reason: `Ambiguous: ${hits.length} PM properties share this key (name fallback inconclusive)`,
      });
    }
  } else {
    // No address hit – try name-based fallback across all PM props,
    // preferably scoped by city/state when provided
    const cityN = normalize(b.city);
    const stateN = normalize(b.state);

    const pool = pmProps.filter(p => {
      const sameCity = cityN ? normalize(p.city) === cityN : true;
      const sameState = stateN ? normalize(p.state) === stateN : true;
      return sameCity && sameState;
    });

    const candidates = (pool.length ? pool : pmProps)
      .map(p => ({
        prop: p,
        score: nameSimilarity(b.name, p.name),
      }))
      .sort((x, y) => y.score - x.score);

    const best = candidates[0];
    const THRESH = 0.6; // stricter when no address key
    if (best && best.score >= THRESH) {
      console.log("[pm] Name fallback used (no address match)", {
        building: { id: b.id, name: b.name, city: b.city, state: b.state },
        chosen: { id: best.prop.propertyId, name: best.prop.name, score: best.score.toFixed(2) },
      });
      results.push({
        buildingId: b.id,
        buildingName: b.name,
        key,
        pmPropertyId: best.prop.propertyId,
        pmCandidates: [{ propertyId: best.prop.propertyId, name: best.prop.name }],
        matched: true,
        reason: `name-fallback score=${best.score.toFixed(2)}${pool.length ? " (scoped by city/state)" : ""}`,
      });
    } else {
      results.push({
        buildingId: b.id,
        buildingName: b.name,
        key,
        pmCandidates: takeSample(
          candidates.slice(0, 5).map(c => ({
            propertyId: c.prop.propertyId,
            name: c.prop.name,
          })),
          5
        ),
        matched: false,
        reason: "No PM property found for this key (name fallback inconclusive)",
      });
    }
  }
}



   // --- 6) If not dry-run, persist unambiguous matches ---
// Policy: always commit address matches;
// only commit name-fallback when score >= 0.99 (near-exact).
if (!dry) {
  let committed = 0;
  for (const r of results) {
    const okToCommit =
      r.matched &&
      r.pmPropertyId &&
      (
        r.matchMethod === "address" ||
        (r.matchMethod === "name-fallback" && (r.matchScore ?? 0) >= 0.99)
      );

    if (okToCommit) {
      await setPmPropertyId(r.buildingId, r.pmPropertyId);
      committed++;
    }
  }
  // Send result (works for both dry-run and commit)
return res.status(200).json({
  ok: true,
  mode: dry ? "dry-run" : "commit",
  orgId,
  accountId,
  pulled: { pmCount: pmProps.length },
  attempted: results.length,
  linked: results.filter(r => r.matched).length,
  results,
  // Optional preview of what would commit on a real run:
  wouldCommit: dry
    ? results
        .filter(r => r.matched && r.pmPropertyId)
        .filter(r => r.matchMethod === "address" || (r.matchMethod === "name-fallback" && (r.matchScore ?? 0) >= 0.99))
        .map(r => ({ buildingId: r.buildingId, pmPropertyId: r.pmPropertyId, method: r.matchMethod, score: r.matchScore }))
    : undefined,
  samplePm: takeSample(pmProps, 5),
});
} catch (err: any) {
  console.error("bulk-link handler crashed:", err);
  return res.status(500).json({ ok: false, error: err?.message || String(err) });
}
}

