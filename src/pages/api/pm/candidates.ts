// src/pages/api/pm/candidates.ts
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const q = (req.query.q as string | undefined)?.trim().toLowerCase();
  const pmResp = await fetch(`${process.env.PM_BASE_URL}/property/list`, {
    method: "GET",
    headers: { "Accept": "application/xml" /* + Basic auth */ },
  });
  if (!pmResp.ok) {
    const txt = await pmResp.text();
    return res.status(502).json({ ok: false, error: "PM list failed", details: txt });
  }
  const pmXml = await pmResp.text();
  const all = parsePmPropertyList(pmXml);
  const results = q ? all.filter(p =>
    p.name.toLowerCase().includes(q) || (p.address1 ?? "").toLowerCase().includes(q)
  ) : all;
  res.json({ ok: true, results: results.slice(0, 50) });
}

function parsePmPropertyList(xml: string) {
  const rows: any[] = [];
  const blocks = xml.split(/<\/property>\s*/i);
  for (const block of blocks) {
    const id = block.match(/<id>([^<]+)<\/id>/i)?.[1];
    if (!id) continue;
    rows.push({
      id,
      name: block.match(/<name>([^<]+)<\/name>/i)?.[1] ?? "",
      address1: block.match(/<address1>([^<]+)<\/address1>/i)?.[1] ?? "",
      city: block.match(/<city>([^<]+)<\/city>/i)?.[1] ?? "",
      state: block.match(/<state>([^<]+)<\/state>/i)?.[1] ?? "",
      postal: block.match(/<postalCode>([^<]+)<\/postalCode>/i)?.[1] ?? "",
    });
  }
  return rows;
}
