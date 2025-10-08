import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  try {
    const dry = req.query.dry === "1" || req.query.dry === "true";
    const body = req.body ?? {};

    // TODO: validate body.meter and body.points here

    if (dry) {
      return res.status(200).json({ ok: true, mode: "dry-run", received: body });
    }

    // TODO: do the real upload work here

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("ENERGYSTAR upload error:", err);
    return res.status(500).json({ ok: false, error: err?.message ?? "Server error" });
  }
}
