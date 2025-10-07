// src/pages/api/ingest-bills.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type IngestPayload = {
  orgId: string;
  utility: "electric" | "gas";
  billUploadId?: string | null;
  autoCreateMeter?: boolean;
  items: Array<{
    buildingId: string | null;
    addressNormalized: string | null;
    service_address: string | null;
    meter_no: string | null;
    match_via: "meter" | "address" | "none";
    utility_provider: string | null;
    period_start: string; // YYYY-MM-DD
    period_end: string;   // YYYY-MM-DD
    total_cost: number | null;
    demand_cost: number | null;
    usage_kwh: number | null;
    usage_mcf: number | null;
    usage_mmbtu: number | null;
  }>;
};

/* ------------------------ Auth Header Extraction ---------------------- */

function getBearerFromRequest(req: NextApiRequest): string | null {
  // 1) Standard Authorization header
  const auth = req.headers.authorization;
  if (auth && /^Bearer\s+/i.test(auth)) return auth;

  // 2) Supabase Auth Helpers cookie (or legacy)
  const rawCookie = req.headers.cookie ?? "";
  if (!rawCookie) return null;

  // Parse cookies -> map
  const cookieMap = Object.fromEntries(
    rawCookie.split(";").map((p) => {
      const i = p.indexOf("=");
      const k = (i >= 0 ? p.slice(0, i) : p).trim();
      const v = (i >= 0 ? p.slice(i + 1) : "").trim();
      return [k, v];
    })
  );

  // Legacy names sometimes used
  const legacy = cookieMap["sb-access-token"] ?? cookieMap["supabase-auth-token"];
  if (legacy) {
    try {
      const val = decodeURIComponent(legacy);
      if (val.startsWith("{")) {
        const j = JSON.parse(val);
        if (j.access_token) return `Bearer ${j.access_token}`;
      }
      return `Bearer ${val}`;
    } catch {
      return `Bearer ${legacy}`;
    }
  }

  // Supabase Auth Helpers cookie: sb-<project-ref>-auth-token
  const sbKey = Object.keys(cookieMap).find((k) =>
    /^sb-[a-z0-9]+-auth-token$/i.test(k)
  );
  if (sbKey) {
    let val = cookieMap[sbKey];
    try {
      val = decodeURIComponent(val);
      // Typical format: "base64-<base64(JSON)>"
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
      return `Bearer ${val}`;
    }
  }

  return null;
}

/* -------------------------- Server Supabase --------------------------- */

function getServerClient(req: NextApiRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // Optional: trusted server/CLI override via secret → uses service role (bypasses RLS)
  const ingestSecretHeader =
    (req.headers["x-energy-ingest-secret"] ||
      req.headers["x-energy-admin"]) as string | undefined;
  const ingestSecret = process.env.ENERGY_INGEST_SECRET;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE;

  if (ingestSecret && serviceRole && ingestSecretHeader === ingestSecret) {
    return createClient<any>(supabaseUrl, serviceRole, {
      auth: { persistSession: false, detectSessionInUrl: false },
    });
  }

  // Default: act as the end user (Bearer or cookie-derived)
  const bearer = getBearerFromRequest(req);
  return createClient<any>(supabaseUrl, supabaseAnon, {
    auth: { persistSession: false, detectSessionInUrl: false },
    global: { headers: { ...(bearer ? { Authorization: bearer } : {}) } },
  });
}

/* ------------------------------- Handler ------------------------------ */

type Json = Record<string, any>;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Log cookie/ENV project refs to catch mismatches
  const cookie = req.headers.cookie ?? "";
  const cookieRefMatch = cookie.match(/(?:^|;\s*)sb-([a-z0-9]+)-auth-token=/i);
  const COOKIE_REF = cookieRefMatch?.[1] || "(none)";

  console.log("[ingest] hit", {
    method: req.method,
    url: req.url,
    hasAuthHeader: !!req.headers.authorization,
    cookieLen: cookie.length,
    envRef: ENV_REF,
    cookieRef: COOKIE_REF,
  });

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const supabase = getServerClient(req);

  // Who does the server see?
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  const uid = userData?.user?.id ?? null;
  console.log("[ingest] server sees user", {
    err: userErr?.message ?? null,
    userId: uid,
  });

  // Parse body (string or object)
  let orgId: string | undefined;
  let utility: "electric" | "gas" | undefined;
  let items: any[] | undefined;

  try {
    if (typeof req.body === "string") {
      const parsed = JSON.parse(req.body);
      orgId = parsed?.orgId;
      utility = parsed?.utility;
      items = parsed?.items;
    } else {
      const b = req.body as Json;
      orgId = b?.orgId;
      utility = b?.utility;
      items = b?.items;
    }
  } catch {
    return res.status(400).json({ ok: false, error: "Invalid JSON body" });
  }

  // Guards
  if (!uid) return res.status(401).json({ ok: false, error: "Not authenticated" });
  if (!orgId) return res.status(400).json({ ok: false, error: "Missing orgId" });
  if (utility !== "electric" && utility !== "gas") {
    return res.status(400).json({ ok: false, error: "Bad or missing utility" });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, error: "No items to ingest" });
  }

  // Verify org membership
  const { data: mem, error: memErr } = await supabase
    .from("memberships")
    .select("org_id, profile_id, role")
    .eq("profile_id", uid)
    .eq("org_id", orgId)
    .single();

  if (memErr || !mem) {
    return res.status(403).json({ ok: false, error: "Forbidden for this org" });
  }

  /* -------------------------- YOUR INGESTION -------------------------- */
  // Replace this stub with your existing ingestion logic.
  // Keep returns inside this try/catch.

  let insertedBills = 0;
  let updatedBills = 0;
  let createdMeters = 0;
  let addressMisses: Array<{ raw?: string; reason?: string }> = [];

  try {
    // for (const item of items) {
    //   // ... your meter/building matching + upserts here ...
    //   // Update counters accordingly
    // }
    return res.status(200).json({
      ok: true,
      insertedBills,
      updatedBills,
      createdMeters,
      addressMisses,
    });
  } catch (e: any) {
    console.error("[/api/ingest-bills] Error:", e);
    return res
      .status(500)
      .json({ ok: false, error: String(e?.message ?? e ?? "Unknown error") });
  }
}
