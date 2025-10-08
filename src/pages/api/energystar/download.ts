import type { NextApiRequest, NextApiResponse } from "next";
import { downloadUsage } from "@/lib/energystar";
import type { DownloadRequest } from "@/lib/energystar/types";

/**
 * POST /api/energystar/download
 * Body: { meter: MeterBinding, start: string, end: string, dryRun?: boolean }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const body = req.body as DownloadRequest;
    const dryRun = (req.query.dry === "1") || body.dryRun;
    const result = await downloadUsage({ ...body, dryRun });
    res.status(result.status).json(result);
  } catch (err: any) {
    console.error("[energystar/download] error", err);
    res.status(500).json({ ok: false, status: 500, error: err?.message || "Download failed" });
  }
}
