import type { NextApiRequest, NextApiResponse } from "next";
import { getAdminJobsSnapshot, startAdminJob, type AdminJobKey } from "@/lib/adminJobs";

type RunBody = {
  jobKey?: AdminJobKey;
  startMonth?: string;
  endMonth?: string;
};

const VALID_JOB_KEYS: AdminJobKey[] = [
  "evergy-bills",
  "evergy-green-button",
  "kgs-bills",
  "woodriver-bills",
];

function isValidJobKey(v: unknown): v is AdminJobKey {
  return typeof v === "string" && VALID_JOB_KEYS.includes(v as AdminJobKey);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === "GET") {
      const snapshot = await getAdminJobsSnapshot();
      return res.status(200).json(snapshot);
    }

    if (req.method === "POST") {
      const body = (req.body ?? {}) as RunBody;
      if (!isValidJobKey(body.jobKey)) {
        return res.status(400).json({ ok: false, error: "Invalid or missing jobKey." });
      }

      const result = await startAdminJob(body.jobKey, {
        startMonth: body.startMonth,
        endMonth: body.endMonth,
      });

      if (!result.ok) {
        return res.status(409).json(result);
      }

      return res.status(200).json(result);
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return res.status(500).json({ ok: false, error: message });
  }
}
