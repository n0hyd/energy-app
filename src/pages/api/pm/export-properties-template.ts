// src/pages/api/pm/export-properties-template.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import path from "path";
import fs from "fs";

// Match your actual schema
type Building = {
  id: string;
  org_id: string;
  name: string | null;
  address: string | null;          // legacy combined line
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;            // DB "character" type (assume string here)
  state_code: string | null;       // optional
  postal_code: string | null;
  square_feet: number | string | null; // numeric may come back as string
  activity_code: string | null;
  hours_of_operation: number | string | null;
  number_of_students: number | null;
  number_of_staff: number | null;
  year_built: number | null;
  pm_property_id: string | null;
};

const PROPERTIES_SHEET = "Properties";
const IDS_SHEET = "Property IDs";

// Header list mirrors ENERGY STAR template columns we’re filling
const PROPS_HEADERS = [
  "Property Name (Required)",
  "Street Address (Required)",
  "Street Address 2 (Optional)",
  "City/Municipality (Required)",
  "County\n(Optional)",
  "State/Province (Required for US or Canada)",
  "Other State/Province (Required for Non-US-or-Canada)",
  "Postal Code (Required)",
  "Country (Required)",
  "Year Built/Year Planned for Construction (Required)",
  "Primary Function (Required)",
  "Construction Status (Required)",
  "Gross Floor Area (Required)",
  "GFA Units (Required)",
  "Occupancy (%) (Required)",
  "Property Structure (Required)",
  "Number of Buildings (Required for Multi-building properties)",
  "Parent Property\n (Optional)",
  "Is this a Federal Property (owned by any country?) (Required)",
  "Federal Country (Required if Federal)",
  "Irrigated Area\n (Optional)",
  "Irrigated Area Units\n (Optional)",
  "Is this an Institutional Property? (Applicable only for Canadian properties)",
];

const IDS_HEADERS = [
  "Property Name (Required if you want to add Property IDs)",
  "Custom ID 1 Name (Required if you want to add one Custom ID)",
  "Custom ID 1 Value (Required if you want to add one Custom ID)",
];

// ---------- helpers ----------
function prefer<T>(...vals: (T | null | undefined)[]) {
  for (const v of vals) {
    if (v !== undefined && v !== null && `${v}`.trim?.() !== "") return v as T;
  }
  return "" as unknown as T;
}
function numOr<T extends number>(v: any, fallback: T): number {
  if (v === null || v === undefined) return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
function stateFrom(b: Building) {
  // prefer state_code, then state (your DB has both in some cases)
  return prefer(b.state_code, b.state);
}

// Build a row for the Properties sheet
function rowForProperties(b: Building): (string | number | null)[] {
  const country = "United States";
  const addr1 = prefer(b.address_line1, b.address);
  const addr2 = prefer(b.address_line2, "");
  const city = prefer(b.city, "");
  const stateUS = prefer(stateFrom(b), ""); // required for US/CA
  const otherState = ""; // not used for US
  const postal = prefer(b.postal_code, "");

  const yearBuilt = numOr(b.year_built, 1800); // default 1800
  const gfa = numOr(b.square_feet, 1);         // default 1
  const primaryFn = prefer(b.activity_code, "");

  return [
    prefer(b.name, ""),           // Property Name
    addr1,                        // Street Address
    addr2,                        // Street Address 2
    city,                         // City/Municipality
    "",                           // County (Optional)
    stateUS,                      // State/Province (US/CA)
    otherState,                   // Other State/Province (non-US/CA)
    postal,                       // Postal Code
    country,                      // Country (hardcoded)
    yearBuilt,                    // Year Built (default 1800)
    primaryFn,                    // Primary Function
    "Existing",                   // Construction Status
    gfa,                          // Gross Floor Area (default 1)
    "Sq. Ft.",                    // GFA Units (exact text)
    100,                          // Occupancy (%)
    "Single Building Property",   // Property Structure
    1,                            // Number of Buildings
    "",                           // Parent Property
    "No",                         // Federal Property?
    "",                           // Federal Country
    null,                           // Irrigated Area
    null,                           // Irrigated Area Units
    "",                           // Institutional (Canada only)
  ];
}

// ---------- route ----------
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const orgId = (req.query.orgId as string) || "";
    if (!orgId) {
      res.status(400).json({ ok: false, error: "Missing orgId" });
      return;
    }

    // Supabase server client (service key needed to bypass RLS for server export)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Pull buildings for this org — NOTE: no "country" field in your schema
    const { data: buildings, error } = await supabase
      .from("buildings")
      .select(
        [
          "id",
          "org_id",
          "name",
          "address",
          "address_line1",
          "address_line2",
          "city",
          "state",
          "state_code",
          "postal_code",
          "square_feet",
          "activity_code",
          "hours_of_operation",
          "number_of_students",
          "number_of_staff",
          "year_built",
          "pm_property_id",
        ].join(",")
      )
      .eq("org_id", orgId)
      .order("name", { ascending: true });

    if (error) {
      res.status(500).json({ ok: false, error: error.message });
      return;
    }

    const rows = (buildings ?? []) as Building[];

    // Load template
    const templatePath = path.join(process.cwd(), "public", "templates", "Add_Properties.xlsx");
    if (!fs.existsSync(templatePath)) {
      res.status(500).json({ ok: false, error: `Template not found at ${templatePath}` });
      return;
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);

    const propsSheet = workbook.getWorksheet(PROPERTIES_SHEET);
    const idsSheet = workbook.getWorksheet(IDS_SHEET);
    if (!propsSheet) {
      res.status(500).json({ ok: false, error: `Sheet '${PROPERTIES_SHEET}' not found in template.` });
      return;
    }
    if (!idsSheet) {
      res.status(500).json({ ok: false, error: `Sheet '${IDS_SHEET}' not found in template.` });
      return;
    }

    // Make sure headers are exactly what we expect
    PROPS_HEADERS.forEach((h, i) => {
      const cell = propsSheet.getCell(1, i + 1);
      if ((cell.value ?? "").toString().trim() !== h) cell.value = h;
    });
    IDS_HEADERS.forEach((h, i) => {
      const cell = idsSheet.getCell(1, i + 1);
      if ((cell.value ?? "").toString().trim() !== h) cell.value = h;
    });

    // Write Properties rows starting at row 2
    rows.forEach((b, idx) => {
      const data = rowForProperties(b);
 // Safety: if Irrigated Area (index 20) is blank, blank out Units (index 21)
      if (data[20] === "" || data[20] === null || data[20] === undefined || data[20] === 0) {
        data[21] = null;
      }
      const r = propsSheet.getRow(2 + idx);
      r.values = [, ...data]; // ExcelJS row.values is 1-based
      r.commit();
    });

    // Clear potential leftover rows
    if (propsSheet.actualRowCount > rows.length + 1) {
      for (let rn = rows.length + 2; rn <= propsSheet.actualRowCount; rn++) {
        const r = propsSheet.getRow(rn);
        r.values = [];
        r.commit();
      }
    }

    // Leave Property IDs sheet blank (headers only)
    if (idsSheet.actualRowCount > 1) {
      for (let rn = 2; rn <= idsSheet.actualRowCount; rn++) {
        const r = idsSheet.getRow(rn);
        r.values = [];
        r.commit();
      }
    }

    // Optional: simple autofit
    [propsSheet, idsSheet].forEach((ws) => {
      ws.columns?.forEach((col) => {
        let max = 12;
        col.eachCell({ includeEmpty: false }, (cell) => {
          const v = (cell.value ?? "").toString();
          if (v.length > max) max = v.length;
        });
        col.width = Math.min(Math.max(max + 2, 14), 60);
      });
    });

    // Stream file
    const filename = `Add_Properties_${orgId}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err: any) {
    console.error("export-properties-template error:", err);
    res.status(500).json({ ok: false, error: err?.message || "Unknown error" });
  }
}
