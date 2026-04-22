import type { NextApiRequest, NextApiResponse } from "next";
import fs from "node:fs/promises";
import path from "node:path";
import { getLatestOutputFile, type AdminJobKey } from "@/lib/adminJobs";

const VALID_JOB_KEYS: AdminJobKey[] = [
  "evergy-bills",
  "evergy-green-button",
  "kgs-bills",
  "woodriver-bills",
];

function isValidJobKey(v: unknown): v is AdminJobKey {
  return typeof v === "string" && VALID_JOB_KEYS.includes(v as AdminJobKey);
}

function contentTypeForFile(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".xml") return "application/xml";
  if (ext === ".csv") return "text/csv";
  return "application/octet-stream";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ ok: false, error: "Method not allowed." });
    }

    const jobKey = req.query.jobKey;
    if (!isValidJobKey(jobKey)) {
      return res.status(400).json({ ok: false, error: "Invalid or missing jobKey." });
    }

    const filePath = await getLatestOutputFile(jobKey);
    if (!filePath) {
      return res.status(404).json({ ok: false, error: "No output file found for this job." });
    }

    const buf = await fs.readFile(filePath);
    const baseName = path.basename(filePath);

    res.setHeader("Content-Type", contentTypeForFile(filePath));
    res.setHeader("Content-Disposition", `attachment; filename="${baseName}"`);
    return res.status(200).send(buf);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return res.status(500).json({ ok: false, error: message });
  }
}
