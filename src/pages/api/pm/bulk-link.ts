// src/pages/api/pm/bulk-link.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
const supabase = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string // server-side only
);

/** -------- Types -------- */
type PmPropertyLite = {
  propertyId: string;
  name?: string;
  address1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
};

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

type UpdateItem = {
  buildingId: string;
  buildingName?: string;
  city?: string | null;
  state?: string | null;
  method: "address" | "name";
  score?: number | null;
  pmPropertyId: string;
  pmPropertyName?: string | null;
};

// Keep existing types; this only buckets what you already compute.
function bucketUpdates(updates: UpdateItem[]) {
  const autoCommit: UpdateItem[] = [];
  const needsReview: UpdateItem[] = [];

  for (const u of updates || []) {
    const method = u.method;
    const score = typeof u.score === "number" ? u.score : null;

    const isAddressAuto = method === "address"; // address matches auto-commit
    const isNameAuto = method === "name" && score !== null && score >= 0.99; // name ≥ 0.99 auto-commit

    if (isAddressAuto || isNameAuto) {
      autoCommit.push(u);
    } else {
      needsReview.push(u);
    }
  }
  return { autoCommit, needsReview };
}


/** -------- Small utils -------- */

function normName(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(administration|administrative)\b/g, "admin")
    .replace(/\b(ctr|center)\b/g, "center")
    .replace(/\b(elem|elementary)\b/g, "elementary")
    .replace(/\s+/g, " ")
    .trim();
}

function jaccardScore(a: string, b: string) {
  const A = new Set(normName(a).split(" ").filter(Boolean));
  const B = new Set(normName(b).split(" ").filter(Boolean));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = new Set([...A, ...B]).size;
  return inter / union; // 0..1
}

function bestNameCandidate(bldgName: string, pmList: Array<{ id: string; name: string }>) {
  let best = { id: "", name: "", score: 0 };
  for (const p of pmList || []) {
    const s = jaccardScore(bldgName, p.name);
    if (s > best.score) best = { id: p.id || (p as any).propertyId, name: p.name, score: s };
  }
  return best;
}


function takeSample<T>(arr: T[], n = 5): T[] {
  return Array.isArray(arr) ? arr.slice(0, Math.max(0, Math.min(n, arr.length))) : [];
}

function normalize(str: string | null | undefined): string {
  const s = (str ?? "")
    .replace(/\./g, " ") // "S. Clifton" → "S Clifton"
    .replace(/#/g, "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  return s
    .replace(/\bN\b/g, "NORTH")
    .replace(/\bS\b/g, "SOUTH")
    .replace(/\bE\b/g, "EAST")
    .replace(/\bW\b/g, "WEST");
}

function addrKey(
  address?: string | null,
  city?: string | null,
  state?: string | null,
  postal?: string | null
) {
  const parts = [normalize(address)];
  const cityN = normalize(city);
  const stateN = normalize(state);
  const postN = normalize(postal);
  if (cityN) parts.push(cityN);
  if (stateN) parts.push(stateN);
  if (postN) parts.push(postN);
  return parts.filter(Boolean).join(" | ");
}

/** Name tokenization / similarity */
function tokenizeName(s: string | undefined | null): string[] {
  const stop = new Set([
    "USD","USD260","SCHOOL","SCHOOLS","DISTRICT","ELEMENTARY","MIDDLE","HIGH","SENIOR","JUNIOR",
    "CENTER","CENTRE","LEARNING","ADMIN","ADMINISTRATIVE","BUILDING","FACILITY","CAMPUS","STADIUM",
    "FIELD","GYM","AUXILIARY","MAINTENANCE","KITCHEN","CENTRAL","PRIMARY","SECONDARY","THE","OF",
    "AND","DE","USD-260","USD_260","OPERATIONS","OPERATION"
  ]);
  const cleaned = normalize(s).replace(/[^A-Z0-9 ]+/g, " ");
  return cleaned.split(/\s+/).filter(t => t.length >= 3 && !stop.has(t));
}

function nameSimilarity(a?: string | null, b?: string | null): number {
  // fast path: normalized exact name match (handles "Admin Center", "Central Kitchen")
  if (normName(a || "") === normName(b || "")) return 1;
  const A = new Set(tokenizeName(a));
  const B = new Set(tokenizeName(b));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

/** -------- ENERGY STAR helpers -------- */
function pmBase() {
  return (process.env.PM_BASE_URL?.replace(/\/+$/, "") || "https://portfoliomanager.energystar.gov/ws");
}

function getPmAuthHeader() {
  const username = process.env.PM_USERNAME || "";
  const password = process.env.PM_PASSWORD || "";
  if (!username || !password) {
    throw new Error("Missing PM_USERNAME or PM_PASSWORD env vars");
  }
  return "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
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

function parsePmAccountId(xml: string): string | undefined {
  const id = parseFirstTag(xml, "id") || parseFirstTag(xml, "accountId") || parseFirstTag(xml, "accountID");
  return id?.replace(/[^\d]/g, "");
}

/** Legacy: if list response returns <property> nodes (rare for accounts) */
function parsePmPropertiesLite(xml: string): PmPropertyLite[] {
  const chunks = xml.split(/<\s*property\b/i).slice(1);
  const props: PmPropertyLite[] = [];
  for (const chunk of chunks) {
    const closeIdx = chunk.indexOf("</property>");
    const body = closeIdx >= 0 ? chunk.slice(0, closeIdx) : chunk;
    const get = (tag: string) =>
      (body.match(new RegExp(`<\\s*${tag}\\s*>\\s*<!\\[CDATA\\[(.*?)\\]\\]>\\s*<\\s*/\\s*${tag}\\s*>`, "i")) ||
        body.match(new RegExp(`<\\s*${tag}\\s*>\\s*([^<]+?)\\s*<\\s*/\\s*${tag}\\s*>`, "i")))?.[1]?.trim();
    const prop: PmPropertyLite = {
      propertyId: get("propertyId") || "",
      name: get("name"),
      address1: get("address1") || get("addressLine1") || get("address"),
      city: get("city"),
      state: get("state"),
      postalCode: get("postalCode") || get("postal"),
    };
    if (prop.propertyId) props.push(prop);
  }
  return props;
}

/** New: when list returns <links><link id="..." hint="..."/></links> */
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

function parsePmPropertyDetail(xml: string): PmPropertyLite | null {
  const grab = (tag: string) =>
    (xml.match(new RegExp(`<\\s*${tag}\\s*>\\s*<!\\[CDATA\\[(.*?)\\]\\]>\\s*<\\s*/\\s*${tag}\\s*>`, "i")) ||
      xml.match(new RegExp(`<\\s*${tag}\\s*>\\s*([^<]+?)\\s*<\\s*/\\s*${tag}\\s*>`, "i")))?.[1]?.trim();

  const propertyId = grab("id") || grab("propertyId") || "";
  const name = grab("name");
  const address1 = grab("address1") || grab("addressLine1") || grab("address") || grab("streetAddress") || undefined;
  const city = grab("city");
  const state = grab("state") || grab("stateCode");
  const postalCode = grab("postalCode") || grab("postal") || grab("zip") || grab("zipcode");

  if (!propertyId) return null;
  return { propertyId, name, address1, city, state, postalCode };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Retry/backoff; if still failing, return id+hint so we can at least name-match */
async function fetchPropertyDetailLite(id: string, hint?: string): Promise<PmPropertyLite | null> {
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const xml = await fetchPmXml(`/property/${encodeURIComponent(id)}`);
      const parsed = parsePmPropertyDetail(xml);
      if (parsed) return parsed;
      throw new Error("Empty or unparsable property detail");
    } catch (e: any) {
      const msg = String(e?.message || e);
      console.warn(`[pm] Failed to fetch/parse property ${id} (attempt ${attempt}/${maxAttempts})`, msg);
      if (attempt === maxAttempts) {
        return hint ? { propertyId: id, name: hint } : null;
      }
      const is429 = /429|Rate limit exceeded/i.test(msg);
      const base = is429 ? 900 : 400;
      const delay = base * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 150);
      await sleep(delay);
    }
  }
  return null;
}

/** -------- Supabase helpers -------- */
async function upsertPmLink(
  buildingId: string,
  orgId: string,
  pmPropertyId: string,
  pmPropertyName: string | null
) {
  return await supabase
    .from("buildings")
    .update({
      pm_property_id: pmPropertyId,
      pm_property_name: pmPropertyName ?? null, // ✅ snapshot name
    })
    .eq("id", buildingId)
    .eq("org_id", orgId);
}


function getAdminSupabase() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url) throw new Error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return createSupabaseClient(url, key, { auth: { persistSession: false } });
}

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

/** -------- API handler -------- */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const orgId = (req.query.orgId as string) || (req.body?.orgId as string) || "";
  const dry =
    String(req.query.dry ?? req.body?.dry ?? "").trim() !== "" &&
    String(req.query.dry ?? req.body?.dry) !== "0";

  if (!orgId) {
    return res.status(400).json({ ok: false, error: "Missing orgId" });
  }

  let printedOnce = false;

  try {
    // 0) Account → accountId
    const accountXml = await fetchPmXml("/account");
    console.log("[pm] Raw /account XML (first 300):", (accountXml ?? "").slice(0, 300));

    let accountId = (process.env.PM_ACCOUNT_ID || "").trim();
    if (!accountId) accountId = parsePmAccountId(accountXml) || "";
    if (!accountId) throw new Error("Could not resolve PM accountId from /account. Set PM_ACCOUNT_ID or verify creds.");

    console.log("[pm] Using PM accountId:", accountId);

    // 1) Property list (links mode for accounts)
    const listXml = await fetchPmXml(`/account/${encodeURIComponent(accountId)}/property/list`);
    console.log("[pm] Raw ENERGY STAR property/list XML (first 400 chars):", (listXml ?? "").slice(0, 400));

    // 2) Build pmProps (from links or <property> nodes)
    let pmProps: PmPropertyLite[] = [];
    if (/<\s*links\b/i.test(listXml)) {
      const links = parsePropertyLinks(listXml);
      console.log("[pm] property/list returned links; will fetch property details", {
        linkCount: links.length,
        sample: links.slice(0, 5),
      });

      const maxToFetch = links.length; // fetch all for full scoring (no sampling)

      const collected: PmPropertyLite[] = [];
      for (let i = 0; i < maxToFetch; i++) {
        const { id, hint } = links[i];
        const detail = await fetchPropertyDetailLite(id, hint);
        if (detail) collected.push(detail);
        await sleep(900); // respectful throttle
      }

      pmProps = collected;
      console.log("[pm] Fetched property details:", {
        count: pmProps.length,
        sample: pmProps,
      });
    } else {
      pmProps = parsePmPropertiesLite(listXml);
    }

    // Debug summaries
    console.log("[pm] Pulled ENERGY STAR properties:", {
      count: Array.isArray(pmProps) ? pmProps.length : "unknown",
      sample: takeSample(pmProps, 3),
    });

    const pmByAddr = new Map<string, PmPropertyLite[]>();
    for (const p of pmProps) {
      const key = addrKey(p.address1, p.city, p.state, p.postalCode) || addrKey(p.address1);
      if (!key) continue;
      const arr = pmByAddr.get(key) ?? [];
      arr.push(p);
      pmByAddr.set(key, arr);
    }
    console.log("[pm] Address keys from ENERGY STAR (first 5):", takeSample(Array.from(pmByAddr.keys()), 5));

    // 3) Buildings needing link
    const buildings = await getBuildingsForOrg(orgId);
    const needsLinking = buildings.filter(b => !b.pm_property_id || String(b.pm_property_id).trim() === "");
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

    // 4) Matching
    const results: Array<{
      buildingId: string;
      buildingName: string;
      key: string;
      pmPropertyId?: string;
      pmCandidates?: Array<{ propertyId: string; name?: string }>;
      matched: boolean;
      reason?: string;
      matchMethod?: "address" | "name-fallback";
      matchScore?: number;
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
pmPropertyName: chosen.name, // ✅ add this line
          reason: score < 0.35 ? `address-match low-name-sim=${score.toFixed(2)}` : "address-match",
          matchMethod: "address",
          matchScore: score,
        });
      } else if (hits.length > 1) {
        const scored = hits
          .map(h => ({ prop: h, score: nameSimilarity(b.name, h.name) }))
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
pmPropertyName: chosen.name, // ✅ add this line
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
        // No address hit → name fallback over all props, scoped by city/state if available
        const cityN = normalize(b.city);
        const stateN = normalize(b.state);
        const pool = pmProps.filter(p => {
          const sameCity = cityN ? normalize(p.city) === cityN : true;
          const sameState = stateN ? normalize(p.state) === stateN : true;
          return sameCity && sameState;
        });

        const candidates = (pool.length ? pool : pmProps)
          .map(p => ({ prop: p, score: nameSimilarity(b.name, p.name) }))
          .sort((x, y) => y.score - x.score);

        const best = candidates[0];
        const THRESH = 0.6;
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
            matchMethod: "name-fallback",
            matchScore: typeof best.score === "string" ? parseFloat(best.score) : best.score,

  		pmPropertyName: best.name, // ✅ add this line
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
    } // end for..of

  // 5) Commit policy
if (!dry) {
  let committed = 0;
  for (const r of results) {
    const okToCommit =
      r.matched &&
      !!r.pmPropertyId &&
      (
        r.matchMethod === "address" ||
        (r.matchMethod === "name-fallback" && (r.matchScore ?? 0) >= 0.99)
      );

    if (okToCommit) {
      // Prefer the snapshot name from the matched result.
      // (Make sure you added r.pmPropertyName when you set matched=true.)
      const pmName =
        r.pmPropertyName ??
        (Array.isArray(r.pmCandidates) && r.pmCandidates.length > 0
          ? r.pmCandidates[0]?.name ?? null
          : null);

      const { error } = await upsertPmLink(r.buildingId, orgId, r.pmPropertyId!, pmName);
      if (!error) committed++;
      else console.error("Commit failed", { buildingId: r.buildingId, error });
    }
  }
  console.log("[pm] Commit summary:", {
    considered: results.filter(r => r.matched && r.pmPropertyId).length,
    committed,
  });
}

// 6) Response
const { autoCommit, needsReview } = bucketUpdates(
  (results || [])
    .filter(r => r.matched && r.pmPropertyId)
    .map(r => ({
      buildingId: r.buildingId,
      buildingName: r.buildingName ?? null,
      city: r.city ?? null,
      state: r.state ?? null,
      method: (r.matchMethod || "").includes("address") ? "address" : "name",
      score: r.matchScore ?? null,
      pmPropertyId: r.pmPropertyId!,
      pmPropertyName: r.pmPropertyName ?? null,
    }))
);

return res.status(200).json({
  ok: true,
  mode: dry ? "dry-run" : "commit",
  orgId,
  accountId,
  pulled: { pmCount: pmProps.length },
  attempted: results.length,
  linked: results.filter(r => r.matched).length,
  results,
  autoCommit,   // NEW
  needsReview,  // NEW
  committedCount: dry ? 0 : autoCommit.length, // optional counter
  samplePm: takeSample(pmProps, 5),
});
} catch (err: any) {
  console.error("bulk-link handler crashed:", err);
  return res.status(500).json({ ok: false, error: err?.message || String(err) });
}
}
