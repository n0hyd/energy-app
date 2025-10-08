// src/pages/api/energystar/upload.ts
import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "POST") {
    res.status(200).json({ ok: true, mode: "pages-router", route: "/api/energystar/upload" });
  } else {
    res.status(405).json({ ok: false, error: "Method not allowed" });
  }
}
