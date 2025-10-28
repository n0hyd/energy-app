import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/lib/supabaseClient";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const { orgId, buildingId, pmPropertyId, pmPropertyName } = req.body || {};
    if (!orgId || !buildingId || !pmPropertyId) {
      return res.status(400).json({ ok: false, error: "Missing required fields" });
    }

    // Get current user
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return res.status(401).json({ ok: false, error: "Not authenticated" });
    }

    // Verify membership (optional guard)
    const { data: membership } = await supabase
      .from("memberships")
      .select("id")
      .eq("org_id", orgId)
      .eq("profile_id", user.id)
      .maybeSingle();

    if (!membership) {
      return res.status(403).json({ ok: false, error: "Not authorized for this organization" });
    }

    // Update building record
    const { error: updateErr } = await supabase
      .from("buildings")
      .update({
        pm_property_id: pmPropertyId,
        pm_property_name: pmPropertyName || null,
      })
      .eq("id", buildingId)
      .eq("org_id", orgId);

    if (updateErr) throw updateErr;

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("approve-link error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
