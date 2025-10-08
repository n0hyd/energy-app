import type { NextApiRequest, NextApiResponse } from "next";
import { uploadUsage } from "@/lib/energystar";
import type { UploadRequest } from "@/lib/energystar/types";

/**
 * POST /api/energystar/upload
 * Body: { meter: MeterBinding, points: UsagePoint[], dryRun?: boolean }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const body = req.body as UploadRequest;
    const dryRun = (req.query.dry === "1") || body.dryRun;
    const result = await uploadUsage({ ...body, dryRun });
    res.status(result.status).json(result);
  } catch (err: any) {
    console.error("[energystar/upload] error", err);
    res.status(500).json({ ok: false, status: 500, error: err?.message || "Upload failed" });
  }
}
