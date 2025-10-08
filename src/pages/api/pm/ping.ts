// pages/api/pm/ping.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { pmRequest } from "@/lib/pmClient";
import { getPmCredsForOrg } from "./_getCreds";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const orgId = String(req.query.orgId);
    const creds = await getPmCredsForOrg(orgId);
    const xml = await pmRequest(creds, "/account", "GET");
    res.status(200).json({ ok: true, sample: xml.slice(0, 200) + "..." });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}
