// pages/api/pm/list-properties.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { pmRequest } from "@/lib/pmClient";
import { getPmCredsForOrg } from "./_getCreds";

/**
 * Lists all properties visible to this org's ENERGY STAR account.
 * (owner or shared)
 */
function getXmlTagAll(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}>([^<]+)</${tag}>`, "gi");
  const matches: string[] = [];
  let m;
  while ((m = regex.exec(xml))) matches.push(m[1]);
  return matches;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const orgId = String(req.query.orgId);
    const creds = await getPmCredsForOrg(orgId);

    // GET /property/list returns all accessible properties
    const xml = await pmRequest(creds, "/property/list", "GET");

    // extract property IDs and names
    const ids = getXmlTagAll(xml, "id");
    const names = getXmlTagAll(xml, "name");

    const summary = ids.map((id, i) => ({
      id,
      name: names[i] ?? "(no name)",
    }));

    res.status(200).json({ ok: true, count: summary.length, properties: summary });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}
