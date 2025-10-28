/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Bulk-link Energy App buildings to Energy Star Portfolio Manager properties.
 * - Fetch buildings for an org (those missing pm_property_id)
 * - Fetch PM property list (supports <property>… and <links> wrappers)
 * - Hydrate property details as needed
 * - Match by normalized address
 * - If dry=1 → return proposed updates; else PATCH buildings.pm_property_id
 */

type Building = {
  id: string;
  org_id: string;
  name: string;
  address: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  pm_property_id?: string | null;
};

type PmProp = {
  id: string;
  name: string;
  address1: string;
  city: string;
  state: string;
  postal: string;
};

type Update = { buildingId: string; pmPropertyId: string; via: "address" | "name" };

const PM_BASE_URL = process.env.PM_BASE_URL || "https://portfoliomanager.energystar.gov/wstest";
const PM_USERNAME = process.env.PM_USERNAME || "";
const PM_PASSWORD = process.env.PM_PASSWORD || "";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// ---------- Utilities ----------

function basicAuthHeader(): string {
  const token = Buffer.from(`${PM_USERNAME}:${PM_PASSWORD}`).toString("base64");
  return `Basic ${token}`;
}

function norm(s: string | null | undefined): string {
  return (s || "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim();
}

function addrKey(address1: string, city: string, state: string, postal: string): string {
  const zip5 = (postal || "").slice(0, 5);
  return [address1, city, state, zip5].map(norm).join("|");
}

function takeSample<T>(arr: T[], n = 5): T[] {
  return arr.slice(0, Math.max(0, Math.min(n, arr.length)));
}

// ---------- Supabase REST helpers ----------

async function sbGetBuildingsMissing(orgId: string): Promise<Building[]> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Supabase env vars missing");
  }
  const url =
    `${SUPABASE_URL}/rest/v1/buildings` +
    `?select=id,org_id,name,address,city,state,postal_code,pm_property_id` +
    `&org_id=eq.${encodeURIComponent(orgId)}` +
    `&or=(pm_property_id.is.null,pm_property_id.eq.)`;

  const resp = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Accept: "application/json",
    },
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Supabase buildings fetch failed (${resp.status}): ${t}`);
  }
  const rows = (await resp.json()) as Building[];
  return rows || [];
}

async function sbPatchBuildingPmId(buildingId: string, pmPropertyId: string): Promise<void> {
  const url = `${SUPABASE_URL}/rest/v1/buildings?id=eq.${encodeURIComponent(buildingId)}`;
  const resp = await fetch(url, {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ pm_property_id: pmPropertyId }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Supabase PATCH failed (${resp.status}): ${t}`);
  }
}

// ---------- Portfolio Manager helpers ----------

/** Get the PM account id for the credentials via GET /account */
async function pmGetAccountId(): Promise<string> {
  const resp = await fetch(`${PM_BASE_URL}/account`, {
    headers: { Accept: "application/xml", Authorization: basicAuthHeader() },
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`PM /account failed (${resp.status}): ${t}`);
  }
  const xml = await resp.text();
  const id = xml.match(/<id>([^<]+)<\/id>/i)?.[1]?.trim();
  if (!id) throw new Error("PM account id not found in /account response");
  return id;
}

/** Fetch list XML: /account/{id}/property/list */
async function pmFetchPropertyListXml(accountId: string): Promise<string> {
  const resp = await fetch(`${PM_BASE_URL}/account/${accountId}/property/list`, {
    headers: { Accept: "application/xml", Authorization: basicAuthHeader() },
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`PM property list failed (${resp.status}): ${t}`);
  }
  return await resp.text();
}

/** Parse minimal PM property list (inline <property> blocks) */
function parsePmPropertyList(xml: string): PmProp[] {
  const rows: PmProp[] = [];
  const propertyBlocks = xml.match(/<property[\s\S]*?<\/property>/gi) ?? [];

  for (const block of propertyBlocks) {
    const id = block.match(/<id>([^<]+)<\/id>/i)?.[1]?.trim();
    if (!id) continue;

    const name = block.match(/<name>([^<]+)<\/name>/i)?.[1]?.trim() ?? "";
    const address1 =
      block.match(/<(addressLine1|address1)>([^<]+)<\/\1>/i)?.[2]?.trim() ??
      block.match(/<address[^>]*>([^<]+)<\/address>/i)?.[1]?.trim() ??
      "";
    const city = block.match(/<city>([^<]+)<\/city>/i)?.[1]?.trim() ?? "";
    const state = block.match(/<state>([^<]+)<\/state>/i)?.[1]?.trim() ?? "";
    const postal = block.match(/<postalCode>([^<]+)<\/postalCode>/i)?.[1]?.trim() ?? "";

    rows.push({ id, name, address1, city, state, postal });
  }
  return rows;
}

/** Links list format parser */
function parsePmPropertyLinks(xml: string): Array<{ id: string; nameHint: string; href: string }> {
  const out: Array<{ id: string; nameHint: string; href: string }> = [];
  const linkRe = /<link\s+[^>]*>/gi;
  const attr = (tag: string, key: string) =>
    tag.match(new RegExp(`${key}="([^"]+)"`, "i"))?.[1] ?? "";

  const links = xml.match(linkRe) ?? [];
  for (const tag of links) {
    const id = attr(tag, "id");
    const nameHint = attr(tag, "hint") || "";
    const href = attr(tag, "link"); // e.g., /property/19597078
    if (id && href) out.push({ id, nameHint, href });
  }
  return out;
}

/** Hydrate detail XML */
async function pmFetchPropertyDetailXml(href: string): Promise<string> {
  const url = `${PM_BASE_URL}${href}`;
  const resp = await fetch(url, { headers: { Accept: "application/xml", Authorization: basicAuthHeader() } });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`PM property detail failed (${resp.status}): ${t}`);
  }
  return await resp.text();
}

/** Parse one <property> detail */
function parsePmPropertyDetail(xml: string): PmProp | null {
  const block = xml.match(/<property[\s\S]*?<\/property>/i)?.[0];
  if (!block) return null;

  const get = (re: RegExp) => block.match(re)?.[1]?.trim() ?? "";

  const id = get(/<id>([^<]+)<\/id>/i);
  const name = get(/<name>([^<]+)<\/name>/i);
  const address1 = block.match(/<(addressLine1|address1)>([^<]+)<\/\1>/i)?.[2]?.trim() ?? "";
  const city = get(/<city>([^<]+)<\/city>/i);
  const state = get(/<state>([^<]+)<\/state>/i);
  const postal = get(/<postalCode>([^<]+)<\/postalCode>/i);

  if (!id) return null;
  return { id, name, address1, city, state, postal };
}

// ---------- Matching ----------

function matchBuildingsToPm(buildings: Building[], pmProps: PmProp[]): Update[] {
  const updates: Update[] = [];

  const pmByAddr = new Map<string, PmProp>();
  for (const p of pmProps) {
    pmByAddr.set(addrKey(p.address1, p.city, p.state, p.postal), p);
  }

  for (const b of buildings) {
    const bKey = addrKey(b.address || "", b.city || "", b.state || "", b.postal_code || "");
    const byAddr = pmByAddr.get(bKey);
    if (byAddr) {
      updates.push({ buildingId: b.id, pmPropertyId: byAddr.id, via: "address" });
      continue;
    }
    // Name fallback (looser)
    const byName = pmProps.find((p) => norm(p.name) === norm(b.name));
    if (byName) {
      updates.push({ buildingId: b.id, pmPropertyId: byName.id, via: "name" });
    }
  }

  return updates;
}

// ---------- API Handler ----------

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const orgId = String(req.query.orgId || "").trim();
    const dry = String(req.query.dry || "0") === "1";

    if (!orgId) return res.status(400).json({ ok: false, error: "Missing orgId" });
    if (!PM_USERNAME || !PM_PASSWORD) return res.status(500).json({ ok: false, error: "PM credentials missing" });

    // 1) Load buildings missing pm_property_id
    const buildings = await sbGetBuildingsMissing(orgId);

    // 2) PM account id
    const accountId = await pmGetAccountId();

    // 3) PM property list XML
    const listXml = await pmFetchPropertyListXml(accountId);

    // 4) Parse either inline <property> or links wrapper
    let pmProps: PmProp[] = parsePmPropertyList(listXml);

    if (!pmProps.length) {
      const links = parsePmPropertyLinks(listXml);
      if (links.length) {
        const hydrated: PmProp[] = [];
        for (const link of links) {
          try {
            const detailXml = await pmFetchPropertyDetailXml(link.href);
            const row = parsePmPropertyDetail(detailXml);
            if (row) hydrated.push(row);
          } catch (e: any) {
            // continue on individual failures
            // eslint-disable-next-line no-console
            console.warn(`[pm] hydrate failed for ${link.href}:`, e?.message ?? e);
          }
        }
        pmProps = hydrated;
      } else {
        // eslint-disable-next-line no-console
        console.warn("[pm] property list parsed empty. First 400 chars:", listXml.slice(0, 400));
      }
    }

// DEBUG: show what we pulled from ENERGY STAR (visible in PowerShell)
console.log("[pm] Pulled ENERGY STAR properties:", {
  count: Array.isArray(pmProps) ? pmProps.length : "unknown",
  sample: Array.isArray(pmProps) ? takeSample(pmProps, 3) : pmProps,
});


    // 5) Compute proposed updates
    const updates = matchBuildingsToPm(buildings, pmProps);

    // 6) If not dry, apply
    if (!dry) {
      for (const u of updates) {
        await sbPatchBuildingPmId(u.buildingId, u.pmPropertyId);
      }
    }

    // 7) Debug payload
    const sampleBuildings = takeSample(
      buildings.map((b) => ({ id: b.id, name: b.name, address: b.address || "" })),
      5
    );
    const samplePm = takeSample(
      pmProps.map((p) => ({ id: p.id, name: p.name, address1: p.address1, city: p.city, state: p.state, postal: p.postal })),
      5
    );

    return res.status(200).json({
      ok: true,
      dry,
      matched: updates.length,
      updates,
      debug: {
        buildingsMissingCount: buildings.length,
        pmPropertyCount: pmProps.length,
        sampleBuildings,
        samplePm,
      },
    });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error("bulk-link handler crashed:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Unhandled error", details: String(err?.message ?? err) });
  }
}
