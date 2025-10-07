// src/pages/api/ingest-bills.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";
import { ingestBills, type IngestOptions, type ParsedBillItem } from "@/lib/ingest-bills";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type BodyShape = IngestOptions & {
  items: ParsedBillItem[];
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Method guard
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  // --- Boot log (matches your previous style) ---
  const hasAuthHeader = !!req.headers.authorization;
  const cookieLen = (req.headers.cookie || "").length;
  const envRef = (() => {
    try {
      return new URL(SUPABASE_URL).host.split(".")[0];
    } catch {
      return "(bad-url)";
    }
  })();
  console.log(
    "[ingest][boot] env.supabaseUrl:",
    SUPABASE_URL,
    "env.ref:",
    envRef
  );
  console.log("[ingest] hit", {
    method: req.method,
    url: req.url,
    hasAuthHeader,
    cookieLen,
    envRef,
    cookieRef: cookieLen ? "(present)" : "(none)",
  });

  // --- Parse body defensively ---
  let body: BodyShape | null = null;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body as BodyShape);
  } catch {
    return res.status(400).json({ ok: false, error: "Invalid JSON body" });
  }
  if (!body || !body.orgId || !body.utility || !Array.isArray(body.items)) {
    return res.status(400).json({ ok: false, error: "Missing orgId/utility/items" });
  }

  // --- Create cookie-aware server client ---
  const cookieClient = createPagesServerClient({ req, res });

  // Try cookie session first
  let {
    data: { user: cookieUser },
  } = await cookieClient.auth.getUser();

  // Fallback to Bearer token if no cookie user
  if (!cookieUser && req.headers.authorization?.startsWith("Bearer ")) {
    const token = req.headers.authorization.slice("Bearer ".length).trim();
    const bearerClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { persistSession: false },
    });
    const { data, error } = await bearerClient.auth.getUser(token);
    if (!error && data?.user) {
      cookieUser = data.user;
    }
  }

  if (!cookieUser) {
    console.log("[ingest] server sees user", { err: "Auth session missing!", userId: null });
    return res.status(401).json({ ok: false, error: "Auth session missing" });
  }
  console.log("[ingest] server sees user", { err: null, userId: cookieUser.id });

  // --- Optional: membership check (recommended) ---
  {
    const { data, error } = await cookieClient
      .from("memberships")
      .select("org_id")
      .eq("profile_id", cookieUser.id)
      .eq("org_id", body.orgId)
      .maybeSingle();

    if (error) {
      console.error("[ingest] org membership check error", error);
      return res.status(403).json({ ok: false, error: "Membership check failed" });
    }
    if (!data) {
      return res.status(403).json({ ok: false, error: "User not a member of this org" });
    }
  }

  // --- Execute ingest ---
  try {
    const results = await ingestBills(cookieClient, {
      orgId: body.orgId,
      utility: body.utility,
      billUploadId: body.billUploadId ?? null,
      autoCreateMeter: body.autoCreateMeter ?? true,
    }, body.items);

    return res.status(200).json({
      ok: true,
      processed: results.length,
      results,
    });
  } catch (err: any) {
    console.error("[ingest] error", err);
    return res.status(500).json({ ok: false, error: err?.message || "Unexpected server error" });
  }
}
