// src/lib/ingest-bills.ts
// SERVER-ONLY ingest logic. Do NOT import a browser supabase client here.
// Accept an authenticated server Supabase client from the API route.

export type UtilityKind = "electric" | "gas";

export type ParsedBillItem = {
  service_address: string | null;
  meter_no?: string | null;
  period_start: string | Date;
  period_end: string | Date;
  total_cost?: number | null;
  demand_cost?: number | null;
  usage_kwh?: number | null;
  usage_mcf?: number | null;
  usage_mmbtu?: number | null;
  utility_provider?: string | null; // only if your bills table has this column
};

export type IngestOptions = {
  orgId: string;
  utility: UtilityKind;
  billUploadId?: string | null;
  autoCreateMeter?: boolean; // default true
};

type BuildingRow = {
  id: string;
  org_id: string;
  name: string | null;
  address: string | null;
  city?: string | null;
  state?: string | null;
};

type MeterRow = {
  id: string;
  building_id: string;
  utility: UtilityKind;
  label: string | null;
  type?: UtilityKind | null;
};

type BillRow = {
  id: string;
};

type UsageRow = {
  id: string;
};

/* ---------------- Address normalization helpers ---------------- */

const SUFFIX_MAP: Record<string, string> = {
  avenue: "ave", ave: "ave",
  boulevard: "blvd", blvd: "blvd",
  circle: "cir", cir: "cir",
  court: "ct", ct: "ct",
  drive: "dr", dr: "dr",
  highway: "hwy", hwy: "hwy",
  lane: "ln", ln: "ln",
  parkway: "pkwy", pkwy: "pkwy",
  place: "pl", pl: "pl",
  road: "rd", rd: "rd",
  street: "st", st: "st",
  terrace: "ter", ter: "ter",
  way: "way",
};
const DIRS = new Set(["n", "s", "e", "w", "ne", "nw", "se", "sw"]);

function baseClean(s: string): string {
  return s
    .toLowerCase()
    .replace(/[|()]/g, " ")
    .replace(/[.,#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAddress(addr: string | null | undefined): string {
  if (!addr) return "";
  const tokens = baseClean(addr)
    .split(" ")
    .filter(Boolean)
    .map((t) => SUFFIX_MAP[t] ?? t);
  return tokens.join("").trim(); // squish spaces for strict compare
}

function looseKey(addr: string | null | undefined): string {
  if (!addr) return "";
  const tokens = baseClean(addr).toUpperCase().split(" ").filter(Boolean);
  const numIdx = tokens.findIndex((t) => /^\d/.test(t));
  if (numIdx < 0) return "";
  const num = tokens[numIdx];
  const after = tokens.slice(numIdx + 1);
  const street = after.find((t) => !DIRS.has(t.toLowerCase())) ?? "";
  return `${num} ${street.slice(0, 5)}`.trim();
}

function toYmd(d: string | Date): string {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  const s = String(d);
  if (/^\d{2}-\d{2}-\d{2}$/.test(s)) {
    const [mm, dd, yy] = s.split("-");
    return `20${yy}-${mm}-${dd}`;
  }
  return s.slice(0, 10);
}

/* ---------------- Ingest ---------------- */

/**
 * Ingest parsed bill items.
 * @param sb Authenticated SERVER supabase client (from API route).
 * @param opts Ingest options.
 * @param items Parsed bill items.
 */
export async function ingestBills(
  sb: any,
  opts: IngestOptions,
  items: ParsedBillItem[]
): Promise<
  Array<{
    building_id: string | null;
    meter_id: string | null;
    bill_id: string;
    usage_reading_id?: string;
    matched_by: "address" | "loose-address" | "meter-fallback";
    notes?: string[];
  }>
> {
  const results: Array<{
    building_id: string | null;
    meter_id: string | null;
    bill_id: string;
    usage_reading_id?: string;
    matched_by: "address" | "loose-address" | "meter-fallback";
    notes?: string[];
  }> = [];

  const AUTO_CREATE = opts.autoCreateMeter ?? true;

  // Load buildings for org
  const { data: buildings, error: bErr } = await sb
    .from("buildings")
    .select("id, org_id, name, address, city, state")
    .eq("org_id", opts.orgId);

  if (bErr) throw bErr;

  const buildingIndex: Array<
    BuildingRow & { norm: string; loose: string }
  > = (buildings as BuildingRow[]).map((b) => ({
    ...b,
    norm: normalizeAddress(b.address),
    loose: looseKey(b.address),
  }));

  // Try to also load alternate service addresses (if table exists)
  let altAddresses: Array<{ building_id: string; address: string }> = [];
  try {
    const { data: alt, error: altErr } = await sb
      .from("building_service_addresses")
      .select("building_id,address,org_id")
      .eq("org_id", opts.orgId);
    if (!altErr && Array.isArray(alt)) {
      altAddresses = alt.map((r: any) => ({
        building_id: r.building_id,
        address: r.address ?? "",
      }));
    }
  } catch {
    // table/view may not exist yet — ignore
  }

  // Build fast lookup maps for alternates
  const altNormMap = new Map<string, string>(); // norm -> building_id
  const altLooseMap = new Map<string, string>(); // loose -> building_id
  for (const a of altAddresses) {
    const n = normalizeAddress(a.address);
    const l = looseKey(a.address);
    if (n) altNormMap.set(n, a.building_id);
    if (l) altLooseMap.set(l, a.building_id);
  }

  // Helper for error candidate preview
  const previewCandidates = (max = 8) =>
    buildingIndex
      .slice(0, max)
      .map((b) => `• ${b.address ?? "(no address)"} [${b.id.slice(0, 8)}…]`)
      .join("\n");

  for (const item of items) {
    const notes: string[] = [];

    const addrNorm = normalizeAddress(item.service_address);
    const addrLoose = looseKey(item.service_address);

    // Primary building match — exact normalized
    let building: BuildingRow | null =
      buildingIndex.find((b) => b.norm && b.norm === addrNorm) ?? null;

    let matched_by: "address" | "loose-address" | "meter-fallback" = "address";

    // Primary loose
    if (!building && addrLoose) {
      const lo = buildingIndex.find((b) => b.loose && b.loose === addrLoose);
      if (lo) {
        building = lo;
        matched_by = "loose-address";
        notes.push(`Loose primary address match: "${item.service_address}"`);
      }
    }

    // Alternate service addresses (exact)
    if (!building && addrNorm) {
      const bId = altNormMap.get(addrNorm);
      if (bId) {
        building = { id: bId } as BuildingRow;
        matched_by = "address";
        notes.push("Matched via alternate service address (exact)");
      }
    }

    // Alternate service addresses (loose)
    if (!building && addrLoose) {
      const bId = altLooseMap.get(addrLoose);
      if (bId) {
        building = { id: bId } as BuildingRow;
        matched_by = "loose-address";
        notes.push("Matched via alternate service address (loose)");
      }
    }

    // If still no building, we will try meter-wide org lookup below (meter-fallback)
    const meterLabel = (item.meter_no ?? "").replace(/\s+/g, "").toUpperCase() || null;

    // Meter locate/create
    let meterId: string | null = null;

    if (meterLabel) {
      // Prefer meter on currently matched building
      if (building) {
        const { data: mSame, error: mSameErr } = await sb
          .from("meters")
          .select("id")
          .eq("building_id", building.id)
          .eq("utility", opts.utility)
          .eq("label", meterLabel)
          .limit(1);
        if (mSameErr) throw mSameErr;
        meterId = mSame?.[0]?.id ?? null;
      }

      // Search across org if not found
      if (!meterId) {
        const { data: mAny, error: mAnyErr } = await sb
          .from("meters")
          .select("id,building_id,utility,buildings!inner(org_id)")
          .eq("buildings.org_id", opts.orgId)
          .eq("utility", opts.utility)
          .eq("label", meterLabel)
          .limit(1);
        if (mAnyErr) throw mAnyErr;

        if (mAny && mAny.length) {
          meterId = mAny[0].id;

          // Adopt this meter's building if no building yet
          if (!building) {
            building = { id: mAny[0].building_id } as BuildingRow;
            matched_by = "meter-fallback";
            notes.push("Resolved building via meter match across org");
          }
        }
      }

      // Auto-create labeled meter if still not found and have a building
      if (!meterId && building && AUTO_CREATE) {
        const { data: created, error: cErr } = await sb
          .from("meters")
          .insert({
            building_id: building.id,
            label: meterLabel,
            type: opts.utility,
            utility: opts.utility,
          } as Partial<MeterRow>)
          .select("id")
          .single();

        if (cErr) {
          // Unique race? Try to re-fetch
          const { data: re, error: reErr } = await sb
            .from("meters")
            .select("id")
            .eq("building_id", building.id)
            .eq("utility", opts.utility)
            .eq("label", meterLabel)
            .limit(1);
          if (reErr) throw reErr;
          meterId = re?.[0]?.id ?? null;
        } else {
          meterId = created!.id;
          notes.push(`Created ${opts.utility} meter with label ${meterLabel}`);
        }
      }
    } else {
      // No meter in item — create/find unlabeled default meter if building is known
      if (building) {
        const { data: mDef, error: mDefErr } = await sb
          .from("meters")
          .select("id")
          .eq("building_id", building.id)
          .eq("utility", opts.utility)
          .is("label", null)
          .limit(1);
        if (mDefErr) throw mDefErr;

        if (mDef && mDef.length) {
          meterId = mDef[0].id;
        } else if (AUTO_CREATE) {
          const { data: createdDef, error: cDefErr } = await sb
            .from("meters")
            .insert({
              building_id: building.id,
              label: null,
              type: opts.utility,
              utility: opts.utility,
            } as Partial<MeterRow>)
            .select("id")
            .single();
          if (cDefErr) throw cDefErr;
          meterId = createdDef!.id;
          matched_by = "meter-fallback";
          notes.push(`Created default ${opts.utility} meter (no label)`);
        }
      }
    }

    // If we still don't have a building and also no meter to infer from, produce guidance
    if (!building) {
      const candidates = previewCandidates();
      throw new Error(
        `No building match for bill address: "${item.service_address ?? "(null)"}"\n` +
          `Tip: normalize stored building addresses to USPS style (consistent suffix & punctuation).\n` +
          `Org candidates:\n${candidates || "— none found —"}`
      );
    }

    // Insert bill
    const period_start = toYmd(item.period_start);
    const period_end = toYmd(item.period_end);

    const billInsert: any = {
      building_id: building.id ?? null,
      bill_upload_id: opts.billUploadId ?? null,
      period_start,
      period_end,
      total_cost: item.total_cost ?? null,
      demand_cost: item.demand_cost ?? null,
    };

    // If you added a text column on bills for provider, uncomment:
    billInsert.utility_provider = item.utility_provider ?? null;

    const { data: billRow, error: billErr } = await sb
      .from("bills")
      .insert(billInsert)
      .select("id")
      .single();

    if (billErr) throw billErr;

    // Insert usage if present
    let usageId: string | undefined;
    const hasUsage =
      (item.usage_kwh ?? null) !== null ||
      (item.usage_mcf ?? null) !== null ||
      (item.usage_mmbtu ?? null) !== null;

    if (hasUsage) {
      const { data: usageRow, error: usageErr } = await sb
        .from("usage_readings")
        .insert({
          bill_id: billRow!.id,
          meter_id: meterId, // may be null if we elected not to create/attach
          usage_kwh: item.usage_kwh ?? null,
          usage_mcf: item.usage_mcf ?? null,
          usage_mmbtu: item.usage_mmbtu ?? null,
        })
        .select("id")
        .single();

      if (usageErr) throw usageErr;
      usageId = (usageRow as UsageRow).id;
    }

    results.push({
      building_id: building.id ?? null,
      meter_id: meterId,
      bill_id: (billRow as BillRow).id,
      usage_reading_id: usageId,
      matched_by,
      notes,
    });
  }

  return results;
}
