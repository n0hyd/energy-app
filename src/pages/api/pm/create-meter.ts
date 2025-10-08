// pages/api/pm/create-meter.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { pmRequest } from "@/lib/pmClient";
import { getPmCredsForOrg } from "./_getCreds";
import { parseStringPromise } from "xml2js";

const PM_FUEL = { electric: "ELECTRIC_GRID", gas: "NATURAL_GAS" } as const;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { buildingId, type, units, label } = req.body as {
      buildingId: string; type: "electric" | "gas"; units: string; label?: string;
    };
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    const { data: bldg } = await supabase
      .from("buildings")
      .select("id, org_id, pm_property_id")
      .eq("id", buildingId)
      .single();
    if (!bldg?.pm_property_id) throw new Error("No pm_property_id on building. Create the property first.");

    const creds = await getPmCredsForOrg(bldg.org_id);

    const xml = `
<meter>
  <type>${PM_FUEL[type]}</type>
  <unitOfMeasure>${units}</unitOfMeasure>
</meter>`.trim();

    const resp = await pmRequest(creds, `/property/${bldg.pm_property_id}/meter`, "POST", xml);
    const parsed = await parseStringPromise(resp);
    const pmMeterId = parsed?.meter?.id?.[0] || parsed?.response?.id?.[0];
    if (!pmMeterId) throw new Error("Could not parse pmMeterId from PM");

    // Save a local meter row and record the pm_meter_id
    const { data: meter, error: mErr } = await supabase
      .from("meters")
      .insert([{ building_id: bldg.id, type, label: label ?? units, pm_meter_id: pmMeterId }])
      .select()
      .single();
    if (mErr) throw mErr;

    res.status(200).json({ ok: true, pmMeterId, meterId: meter.id });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}
