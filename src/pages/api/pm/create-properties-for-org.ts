// pages/api/pm/create-properties-for-org.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import { pmRequest, escapeXml } from "@/lib/pmClient";
import { getPmCredsForOrg } from "./_getCreds";

// simple helper to pull a single tag value from PM XML
function getXmlTag(xml: string, tag: string) {
  const m = xml.match(new RegExp(`<${tag}>([^<]+)</${tag}>`, "i"));
  return m?.[1] || null;
}

// Map your internal activity codes -> PM primaryFunction labels
function toPmPrimaryFunction(activity_code: string): string {
  const key = (activity_code || "").trim();

  const map: Record<string, string> = {
    // K-12 variants
    Education: "K-12 School",
    K12: "K-12 School",
    "K-12 School": "K-12 School",
    School: "K-12 School",

    // Offices
    Office: "Office",
    "Office (General)": "Office",

    // Warehouses / distribution
    Warehouse: "Non-Refrigerated Warehouse",
    "Non-Refrigerated Warehouse": "Non-Refrigerated Warehouse",
    "Refrigerated Warehouse": "Refrigerated Warehouse",
    "Warehouse/Distribution Center": "Distribution Center",
    "Warehouse Distribution Center": "Distribution Center",
    "Distribution Center": "Distribution Center",
  };

  // If we recognize the activity_code, map it; otherwise pass it through
  return map[key] || key;
}


// Convert a PM primaryFunction label (e.g. "K-12 School") into the
// root XML element name for the property use (e.g. <k12School>...</k12School>)
function primaryFunctionToUseRootElement(primaryFunction: string): string {
  // Remove punctuation, normalize spaces
  const cleaned = primaryFunction.replace(/[^A-Za-z0-9]+/g, " ").trim();
  if (!cleaned) return "other";

  const parts = cleaned.split(/\s+/);
  const first = parts[0]; // e.g. "K" (from "K 12 School")
  const rest = parts
    .slice(1)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(""); // "12School"

  const combined = first + rest; // "K12School"
  return combined.charAt(0).toLowerCase() + combined.slice(1); // "k12School"
}


// Minimal shape of the buildings rows we care about
type BuildingRow = {
  id: string;
  org_id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  square_feet: number | null;
  activity_code: string | null;
  year_built: number | null;
  pm_property_id: string | null;
  hours_of_operation: number | null;
  number_of_students: number | null;
  number_of_staff: number | null;
};

async function createOrEnsurePropertyUseForBuilding(
  creds: any,
  pmPropertyId: string,
  b: BuildingRow,
  primaryFunction: string,
  gfa: number
) {
  // 1) If a property use already exists, don’t create another
  try {
    const listXml = await pmRequest(
      creds,
      `/property/${pmPropertyId}/propertyUse/list`,
      "GET"
    );

    if (listXml && listXml.includes("<propertyUse>")) {
      return;
    }
  } catch (err) {
    console.error(
      `Error checking existing property uses for PM property ${pmPropertyId}:`,
      err
    );
    // fall through and try to create a use anyway
  }

   const useRoot = primaryFunctionToUseRootElement(primaryFunction);

  // Pick an effective date for GFA:
  // - If year_built is present and sane (>= 1900, <= current year), use Jan 1 of that year
  // - Otherwise fall back to 2000-01-01
  const currentYear = new Date().getFullYear();
  const builtYear =
    b.year_built &&
    b.year_built >= 1900 &&
    b.year_built <= currentYear
      ? b.year_built
      : 2000;

  const currentAsOf = `${builtYear}-01-01`; // YYYY-MM-DD

  // Minimal, schema-safe useDetails: just totalGrossFloorArea
  const useDetailsXml =
    `<totalGrossFloorArea units="Square Feet" currentAsOf="${currentAsOf}" temporary="false">` +
    `<value>${gfa}</value>` +
    `</totalGrossFloorArea>`;


  const useXml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<${useRoot}>` +
    `<name>${escapeXml(b.name || "")}</name>` +
    `<useDetails>` +
    useDetailsXml +
    `</useDetails>` +
    `</${useRoot}>`;

  await pmRequest(
    creds,
    `/property/${pmPropertyId}/propertyUse`,
    "POST",
    useXml
  );
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const orgId = String(req.query.orgId || "").trim();
    if (!orgId) {
      return res.status(400).json({ ok: false, error: "Missing orgId" });
    }

    // Server-only service-role client so we can bypass RLS inside a trusted API route.
    // Never expose this configuration to the browser.
    const supabase = createServiceRoleClient();

    // Pull all buildings for this org that might need PM properties
    const { data: buildings, error: bErr } = await supabase
      .from("buildings")
      .select<BuildingRow>(
        "id, org_id, name, address, city, state, postal_code, square_feet, activity_code, year_built, pm_property_id, hours_of_operation, number_of_students, number_of_staff"
      )
      .eq("org_id", orgId);


    if (bErr) throw bErr;
    if (!buildings || buildings.length === 0) {
      return res.status(200).json({
        ok: true,
        message: "No buildings found for org",
        processedCount: 0,
        results: [],
      });
    }

    // Get PM credentials + accountId once for the org
    const creds = await getPmCredsForOrg(orgId);
    const acctXml = await pmRequest(creds, "/account", "GET");
    const accountId = getXmlTag(acctXml, "id");
    if (!accountId) throw new Error("Could not read accountId from /account");

    const results: Array<{
      buildingId: string;
      buildingName: string;
      created: boolean;
      skipped?: boolean;
      pm_property_id?: string;
      error?: string;
    }> = [];

  for (const b of buildings) {
  try {
    if (b.pm_property_id) {
      // Property already exists in PM – make sure it has a property use
      const primaryFunction = toPmPrimaryFunction(b.activity_code || "");
      const gfa = Number(b.square_feet ?? 0) || 0;

      await createOrEnsurePropertyUseForBuilding(
        creds,
        b.pm_property_id,
        b,
        primaryFunction,
        gfa
      );

      results.push({
        buildingId: b.id,
        buildingName: b.name || "(unnamed)",
        created: false,
        skipped: false,
        pm_property_id: b.pm_property_id,
      });
      continue;
    }

    // validate required
    if (!b.name) throw new Error("Missing building.name");

        if (!b.address) throw new Error("Missing building.address");
        if (!b.city) throw new Error("Missing building.city");
        if (!b.postal_code) throw new Error("Missing building.postal_code");
        if (!b.state) throw new Error("Missing building.state (2-letter)");

        const primaryFunction = toPmPrimaryFunction(b.activity_code || "");
        if (!primaryFunction) throw new Error("Missing/invalid activity_code → primaryFunction");

        const gfa = Number(b.square_feet ?? 0) || 0;
        const yearBuilt = b.year_built || 2000;

        const xml =
          `<?xml version="1.0" encoding="UTF-8"?>` +
          `<property>` +
          `<name>${escapeXml(b.name)}</name>` +
          `<primaryFunction>${escapeXml(primaryFunction)}</primaryFunction>` +
          `<address address1="${escapeXml(b.address)}" city="${escapeXml(
            b.city || ""
          )}" postalCode="${escapeXml(b.postal_code || "")}" state="${escapeXml(
            b.state || ""
          )}" country="US"/>` +
          `<yearBuilt>${yearBuilt}</yearBuilt>` +
          `<constructionStatus>Existing</constructionStatus>` +
          `<grossFloorArea temporary="false" units="Square Feet"><value>${gfa}</value></grossFloorArea>` +
          `<occupancyPercentage>100</occupancyPercentage>` +
          `<isFederalProperty>false</isFederalProperty>` +
          `</property>`;

        const resp = await pmRequest(creds, `/account/${accountId}/property`, "POST", xml);
        const pmPropertyId = getXmlTag(resp, "id");
        if (!pmPropertyId) throw new Error("Could not parse pmPropertyId from PM");

        

                   // Ensure a property use exists for this new property
    await createOrEnsurePropertyUseForBuilding(
      creds,
      pmPropertyId,
      b,
      primaryFunction,
      gfa
    );

    await supabase
      .from("buildings")
      .update({ pm_property_id: pmPropertyId })
      .eq("id", b.id);


        // Map building use details into PM useDetails
        const weeklyHours =
          b.hours_of_operation != null ? Number(b.hours_of_operation) : null;
        const staffCount =
          b.number_of_staff != null ? Number(b.number_of_staff) : null;

        // Heuristic: treat as high school if name or activity code suggests it
        const isHighSchool =
          /HIGH/i.test(b.name || "") || /HS/i.test(b.activity_code || "") ? "Yes" : "No";

        const schoolDistrictName =
          b.city ? `${b.city} School District` : "School District";

        let useDetailsXml =
          `<totalGrossFloorArea units="Square Feet" currentAsOf="${today}" temporary="false">` +
          `<value>${gfa}</value>` +
          `</totalGrossFloorArea>`;

        if (weeklyHours && weeklyHours > 0) {
          useDetailsXml +=
            `<weeklyOperatingHours currentAsOf="${today}" temporary="false">` +
            `<value>${weeklyHours}</value>` +
            `</weeklyOperatingHours>`;
        }

        if (staffCount && staffCount > 0) {
          useDetailsXml +=
            `<numberOfWorkers currentAsOf="${today}" temporary="false">` +
            `<value>${staffCount}</value>` +
            `</numberOfWorkers>`;
        }

        // Conservative defaults; PM will use these to refine the model,
        // and they can be edited later in the PM UI if needed.
        useDetailsXml +=
          `<openOnWeekends currentAsOf="${today}" temporary="false">` +
          `<value>No</value>` +
          `</openOnWeekends>` +
          `<percentCooled currentAsOf="${today}" temporary="false">` +
          `<value>100</value>` +
          `</percentCooled>` +
          `<percentHeated currentAsOf="${today}" temporary="false">` +
          `<value>100</value>` +
          `</percentHeated>` +
          `<cookingFacilities currentAsOf="${today}" temporary="false">` +
          `<value>Yes</value>` +
          `</cookingFacilities>` +
          `<isHighSchool currentAsOf="${today}" temporary="false">` +
          `<value>${isHighSchool}</value>` +
          `</isHighSchool>` +
          `<monthsInUse currentAsOf="${today}" temporary="false">` +
          `<value>9</value>` +
          `</monthsInUse>` +
          `<schoolDistrict currentAsOf="${today}" temporary="false">` +
          `<value>${escapeXml(schoolDistrictName)}</value>` +
          `</schoolDistrict>`;

        const useXml =
          `<?xml version="1.0" encoding="UTF-8"?>` +
          `<${useRoot}>` +
          `<name>${escapeXml(b.name || "")}</name>` +
          `<useDetails>` +
          useDetailsXml +
          `</useDetails>` +
          `</${useRoot}>`;

        await pmRequest(
          creds,
          `/property/${pmPropertyId}/propertyUse`,
          "POST",
          useXml
        );

        await supabase
          .from("buildings")
          .update({ pm_property_id: pmPropertyId })
          .eq("id", b.id);


        results.push({
          buildingId: b.id,
          buildingName: b.name || "(unnamed)",
          created: true,
          pm_property_id: pmPropertyId,
        });
      } catch (err: any) {
        console.error("PM create property error for building", b.id, err);
        results.push({
          buildingId: b.id,
          buildingName: b.name || "(unnamed)",
          created: false,
          error: err?.message || String(err),
        });
      }
    }

    return res.status(200).json({
      ok: true,
      message: `Processed ${results.length} buildings.`,
      processedCount: results.length,
      results,
    });
  } catch (e: any) {
    console.error("create-properties-for-org error:", e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}
