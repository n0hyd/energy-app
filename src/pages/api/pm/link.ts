// src/pages/api/pm/link.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const { buildingId, pmPropertyId } = req.body as { buildingId: string; pmPropertyId: string };
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { error } = await supabase.from("buildings").update({ pm_property_id: pmPropertyId }).eq("id", buildingId);
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true });
}
