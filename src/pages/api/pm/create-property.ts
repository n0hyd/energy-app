// pages/api/pm/create-property.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { pmRequest, escapeXml } from "@/lib/pmClient";
import { getPmCredsForOrg } from "./_getCreds";

function getXmlTag(xml: string, tag: string) {
  const m = xml.match(new RegExp(`<${tag}>([^<]+)</${tag}>`, "i"));
  return m?.[1] || null;
}

// Map your internal activity codes -> PM primaryFunction labels
function toPmPrimaryFunction(activity_code: string): string {
  const map: Record<string, string> = {
    "Education": "K-12 School",
    "K12": "K-12 School",
    "School": "K-12 School",
    "Office": "Office",
    "Warehouse": "Warehouse",
  };
  return map[activity_code] || activity_code; // if you already store PM labels, keep them
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const buildingId = String(req.query.buildingId);
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: b, error: bErr } = await supabase
      .from("buildings")
      .select("id, org_id, name, address, city, state, postal_code, square_feet, activity_code, year_built, pm_property_id")
      .eq("id", buildingId)
      .single();
    if (bErr || !b) throw bErr || new Error("Building not found");
    if (b.pm_property_id) return res.status(200).json({ ok: true, pmPropertyId: b.pm_property_id, note: "already set" });

    // validate required
    if (!b.name) throw new Error("Missing building.name");
    if (!b.address) throw new Error("Missing building.address");
    if (!b.city) throw new Error("Missing building.city");
    if (!b.postal_code) throw new Error("Missing building.postal_code");
    if (!b.state) throw new Error("Missing building.state (2-letter)");
    const primaryFunction = toPmPrimaryFunction(b.activity_code || "");
    if (!primaryFunction) throw new Error("Missing/invalid activity_code → primaryFunction");

    const creds = await getPmCredsForOrg(b.org_id);

    // 1) get accountId
    const acctXml = await pmRequest(creds, "/account", "GET");
    const accountId = getXmlTag(acctXml, "id");
    if (!accountId) throw new Error("Could not read accountId from /account");

    // 2) build XML exactly like PM example requires
    // Example: /account/{id}/property with yearBuilt, constructionStatus, GFA<value>, etc. :contentReference[oaicite:1]{index=1}
    const gfa = Number(b.square_feet) || 0;
    const yearBuilt = b.year_built || 2000;

    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<property>` +
      `<name>${escapeXml(b.name)}</name>` +
      `<primaryFunction>${escapeXml(primaryFunction)}</primaryFunction>` +
      `<address address1="${escapeXml(b.address)}" city="${escapeXml(b.city)}" postalCode="${escapeXml(b.postal_code)}" state="${escapeXml(b.state)}" country="US"/>` +
      `<yearBuilt>${yearBuilt}</yearBuilt>` +
      `<constructionStatus>Existing</constructionStatus>` +
      `<grossFloorArea temporary="false" units="Square Feet"><value>${gfa}</value></grossFloorArea>` +
      `<occupancyPercentage>100</occupancyPercentage>` +
      `<isFederalProperty>false</isFederalProperty>` +
      `</property>`;

    const resp = await pmRequest(creds, `/account/${accountId}/property`, "POST", xml);
    const pmPropertyId = getXmlTag(resp, "id");
    if (!pmPropertyId) throw new Error("Could not parse pmPropertyId from PM");

    await supabase.from("buildings").update({ pm_property_id: pmPropertyId }).eq("id", b.id);

    res.status(200).json({ ok: true, pmPropertyId });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}
