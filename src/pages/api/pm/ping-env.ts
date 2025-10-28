// src/pages/api/pm/ping-env.ts
import type { NextApiRequest, NextApiResponse } from "next";
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({
    PM_USERNAME: !!process.env.PM_USERNAME,
    PM_PASSWORD: !!process.env.PM_PASSWORD,
  });
}
