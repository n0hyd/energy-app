// src/pages/api/pm/link.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const { buildingId, pmPropertyId } = req.body as { buildingId: string; pmPropertyId: string };
  // Server-only service-role client. Never expose this configuration to the browser.
  const supabase = createServiceRoleClient();

  const { error } = await supabase.from("buildings").update({ pm_property_id: pmPropertyId }).eq("id", buildingId);
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true });
}
