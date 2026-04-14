// src/pages/ocr-test.tsx
import { useCallback, useMemo, useState, useEffect } from "react";
import * as pdfjsLib from "pdfjs-dist/build/pdf.mjs";
import { supabase } from "@/lib/supabaseClient";
import { useAuthGate } from "@/hooks/useAuthGate";
import { apiFetch } from "@/lib/apiFetch";


/* ---------- PDF.js worker (served from /public) ---------- */
(pdfjsLib as any).GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

/* ---------------- Types ---------------- */
type Item = {
  service_address?: string | null;
  meter_no?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  usage_kwh?: number | null;
  usage_mcf?: number | null;
  therms?: number | null;
  usage_mmbtu?: number | null;
  section_total_cost?: number | null;
  total_cost?: number | null;
  demand_cost?: number | null;
  actual_demand_kw?: number | null;
  adjusted_demand_kw?: number | null;
  summer_peak_kw?: number | null;
  ratchet_kw?: number | null;
  billing_demand_kw?: number | null;
  tariff_min_kw?: number | null;
  hints?: string[];
  __sourceFile?: string;
  __vendor?: Parsed["vendor"];
};

type Parsed = {
  vendor: "evergy" | "kgs" | "woodriver" | "unknown";
  period: Record<string, any>;
  usage_kwh: number | null;
  total_cost: number | null;
  demand_cost: number | null;
  service_address: string | null;
  meter_no: string | null;
  items: Item[];
  hints: string[];
};

/* ---------------- Helpers ---------------- */
function num(s: string | number | null | undefined): number | null {
  if (s === null || s === undefined) return null;
  const n = typeof s === "number" ? s : Number(String(s).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}
function normalizeMeter(raw?: string | null): string {
  if (!raw) return "";
  return raw.replace(/\s+/g, "").toUpperCase();
}
function normalizeMcf(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!isFinite(n)) return null;
  if (Number.isInteger(n) && n >= 1000 && String(Math.trunc(n)).endsWith("000")) {
    const fixed = n / 1000;
    return Number(fixed.toFixed(3));
  }
  return Number(n.toFixed(3));
}
function pick<T>(a: T | null | undefined, b: T | null | undefined): T | null | undefined {
  if (a !== undefined && a !== null && a !== "") return a;
  return b;
}
function mergeTwo(a: Item, b: Item): Item {
  return {
    service_address: pick(a.service_address, b.service_address),
    meter_no: pick(a.meter_no, b.meter_no),
    period_start: pick(a.period_start, b.period_start),
    period_end: pick(a.period_end, b.period_end),
    usage_kwh: pick(a.usage_kwh ?? null, b.usage_kwh ?? null) ?? null,
    usage_mcf: pick(a.usage_mcf ?? null, b.usage_mcf ?? null) ?? null,
    therms: pick(a.therms ?? null, b.therms ?? null) ?? null,
    usage_mmbtu: pick(a.usage_mmbtu ?? null, b.usage_mmbtu ?? null) ?? null,
    section_total_cost: pick(a.section_total_cost ?? null, b.section_total_cost ?? null) ?? null,
    total_cost: pick(a.total_cost ?? null, b.total_cost ?? null) ?? null,
    demand_cost: pick(a.demand_cost ?? null, b.demand_cost ?? null) ?? null,
    actual_demand_kw: pick(a.actual_demand_kw ?? null, b.actual_demand_kw ?? null) ?? null,
    adjusted_demand_kw: pick(a.adjusted_demand_kw ?? null, b.adjusted_demand_kw ?? null) ?? null,
    summer_peak_kw: pick(a.summer_peak_kw ?? null, b.summer_peak_kw ?? null) ?? null,
    ratchet_kw: pick(a.ratchet_kw ?? null, b.ratchet_kw ?? null) ?? null,
    billing_demand_kw: pick(a.billing_demand_kw ?? null, b.billing_demand_kw ?? null) ?? null,
    tariff_min_kw: pick(a.tariff_min_kw ?? null, b.tariff_min_kw ?? null) ?? null,
    hints: [...(a.hints ?? []), ...(b.hints ?? [])],
    __sourceFile: a.__sourceFile || b.__sourceFile,
    __vendor: a.__vendor || b.__vendor,
  };
}
function completenessScore(i: Item): number {
  const fields = [
    i.meter_no,
    i.service_address,
    i.period_start,
    i.period_end,
    i.usage_kwh,
    i.usage_mcf,
    i.therms,
    i.usage_mmbtu,
    i.total_cost,
    i.section_total_cost,
    i.demand_cost,
    i.actual_demand_kw,
    i.adjusted_demand_kw,
    i.summer_peak_kw,
    i.ratchet_kw,
    i.billing_demand_kw,
    i.tariff_min_kw,
  ];
  return fields.reduce((n, v) => n + (v !== undefined && v !== null && v !== "" ? 1 : 0), 0);
}

/* ---------- USPS-style address normalization ---------- */
const USPS_SUFFIX: Record<string, string> = {
  AVENUE: "AVE",
  AVE: "AVE",
  BOULEVARD: "BLVD",
  BLVD: "BLVD",
  CIRCLE: "CIR",
  CIR: "CIR",
  COURT: "CT",
  CT: "CT",
  DRIVE: "DR",
  DR: "DR",
  HIGHWAY: "HWY",
  HWY: "HWY",
  LANE: "LN",
  LN: "LN",
  PARKWAY: "PKWY",
  PKWY: "PKWY",
  PLACE: "PL",
  PL: "PL",
  ROAD: "RD",
  RD: "RD",
  STREET: "ST",
  ST: "ST",
  TERRACE: "TER",
  TER: "TER",
  WAY: "WAY",
};
function baseClean(raw?: string | null): string {
  if (!raw) return "";
  return String(raw)
    .replace(/[|()]/g, " ")
    .replace(/[.,#]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}
function uspsNormalizeAddress(raw?: string | null): string {
  let s = baseClean(raw);
  if (!s) return "";
  s = s.replace(/\b([NSEW])\./g, "$1");
  s = s.replace(/\s+/g, " ");
  const parts = s.split(" ");
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    const abbr = USPS_SUFFIX[last] || USPS_SUFFIX[last.replace(/S$/, "")] || null;
    if (abbr) parts[parts.length - 1] = abbr;
  }
  s = parts.join(" ");
  return s.trim();
}
function cleanAddressRaw(raw?: string | null): string {
  let s = String(raw ?? "");
  const firstDigit = s.search(/\d/);
  if (firstDigit > 0) s = s.slice(firstDigit);
  s = s.replace(/\bPER\s+MCF\b.*$/i, "").trim();
  return uspsNormalizeAddress(s);
}
function normalizeAddress(raw?: string | null): string {
  return uspsNormalizeAddress(raw);
}

/* ---------- Partial match key ---------- */
function addrMatchKey(raw?: string | null): string {
  const norm = uspsNormalizeAddress(raw);
  if (!norm) return "";
  const toks = norm.split(" ");
  const numIdx = toks.findIndex((t) => /^\d/.test(t));
  if (numIdx === -1) return "";
  const num = toks[numIdx];
  const after = toks.slice(numIdx + 1);
  const skip = new Set(["N", "S", "E", "W", "NE", "NW", "SE", "SW"]);
  const street = after.find((t) => !skip.has(t)) ?? "";
  return (num + " " + street.slice(0, 5)).trim();
}

/* ---------- Dedupe + post-process ---------- */
function dedupeAndMerge(items: Item[]): Item[] {
  const buckets = new Map<string, Item[]>();
  for (const raw of items) {
    const meterKey = normalizeMeter(raw.meter_no);
    const addrKey = normalizeAddress(raw.service_address);
    const key = meterKey ? `M::${meterKey}` : `A::${addrKey}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(raw);
  }
  const merged: Item[] = [];
  for (const [, group] of buckets) {
    group.sort((a, b) => completenessScore(b) - completenessScore(a));
    let acc = group[0];
    for (let i = 1; i < group.length; i++) acc = mergeTwo(acc, group[i]);
    acc = {
      ...acc,
      meter_no: normalizeMeter(acc.meter_no),
      service_address: normalizeAddress(acc.service_address),
      usage_mcf: normalizeMcf(acc.usage_mcf),
    };
    merged.push(acc);
  }
  return merged;
}
function postProcessItems(items: Item[]): Item[] {
  return items.map((it) => ({
    ...it,
    service_address: cleanAddressRaw(it.service_address),
    usage_mcf: normalizeMcf(it.usage_mcf),
  }));
}

/* ---- Approve/Confidence helpers ---- */
function isValidDateish(s?: string | null) {
  if (!s) return false;
  return /^\d{2}-\d{2}-\d{2}$/.test(s) || /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function confidenceForItem(i: Item): number {
  let c = 0;
  if (i.meter_no) c += 2;
  if (i.service_address) c += 1;
  if (isValidDateish(i.period_start) && isValidDateish(i.period_end)) c += 2;
  if (i.usage_kwh != null || i.usage_mcf != null || i.usage_mmbtu != null) c += 2;
  if (i.total_cost != null || i.section_total_cost != null) c += 2;
  if (i.demand_cost != null) c += 1;
  return c;
}
function toEditable(it: Item) {
  return {
    address: it.service_address ?? "",
    meter: it.meter_no ?? "",
    start: it.period_start ?? "",
    end: it.period_end ?? "",
    kwh: it.usage_kwh ?? null,
    mcf: it.usage_mcf ?? null,
    mmbtu: it.usage_mmbtu ?? null,
    sectionTotal: it.section_total_cost ?? null,
    total: it.total_cost ?? null,
    demand: it.demand_cost ?? null,
    provider: "",
  };
}

/* ---------------- PDF text extraction ---------------- */
async function extractPdfText(file: File): Promise<string> {
  const data = await file.arrayBuffer();

  const task = (pdfjsLib as any).getDocument({ data });
  const pdf = await task.promise;

  const pageTexts: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent({ normalizeWhitespace: true });
    const items = (content.items || []) as any[];

    const TOL = 2.0;
    type Line = { y: number; chunks: { x: number; str: string }[] };
    const lines: Line[] = [];

    for (const it of items) {
      const str: string = it.str ?? "";
      const tr = it.transform || [0, 0, 0, 0, 0, 0];
      const x = tr[4] ?? 0;
      const y = tr[5] ?? 0;
      let line = lines.find((ln) => Math.abs(ln.y - y) <= TOL);
      if (!line) {
        line = { y, chunks: [] };
        lines.push(line);
      }
      line.chunks.push({ x, str });
    }

    lines.sort((a, b) => b.y - a.y);
    const lineStrings = lines.map((ln) => {
      ln.chunks.sort((a, b) => a.x - b.x);
      return ln.chunks.map((c) => c.str).join(" ");
    });

    pageTexts.push(lineStrings.join("\n"));
  }

  const joined = pageTexts.map((t, i) => `--- PAGE ${i + 1} ---\n${t}`).join("\n");
  if (!joined.trim()) {
    throw new Error(
      "PDF parsed but no text was extracted. If this is a scanned image-only PDF, text may be empty."
    );
  }
  return joined;
}

/* ---------------- Vendor helpers ---------------- */
function vendorToUtility(v: Parsed["vendor"]): "electric" | "gas" {
  return v === "evergy" ? "electric" : "gas";
}
function vendorToProvider(v: Parsed["vendor"]): string | null {
  if (v === "evergy") return "Evergy";
  if (v === "kgs") return "Kansas Gas Service";
  if (v === "woodriver") return "WoodRiver Energy";
  return null;
}

/* ---------------- Evergy (Electric) Parser ---------------- */
function parseEvergy(text: string): Parsed {
  const hints: string[] = [];
  const items: Item[] = [];

  const page1 = text.match(/--- PAGE 1 ---([\s\S]*?)(?=--- PAGE 2 ---|$)/i)?.[1] || "";
  const page2 = text.match(/--- PAGE 2 ---([\s\S]*?)(?=--- PAGE 3 ---|$)/i)?.[1] || "";
  const page3 = text.match(/--- PAGE 3 ---([\s\S]*?)(?=--- PAGE 4 ---|$)/i)?.[1] || "";
  const p23 = `${page2}\n${page3}`;

  const num = (s: string) => parseFloat(s.replace(/,/g, ""));
  const linesOf = (s: string) => s.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // meter row detector when it's in-grid
  const meterAnywhereRx = new RegExp(
    "Meter\\s*[#\\/" + "\\uE000-\\uF8FF\\s]*Service\\s*ID(?:\\s*[#\\uE000-\\uF8FF])?",
    "i"
  );

  // Address (banner)
  const svc = page1.match(/Service\s+location:\s*(.+)$/im) || text.match(/Service\s+location:\s*(.+)$/im);
  const service_address = svc ? cleanAddressRaw(svc[1]) : null;

  // Total to be drafted / due by (banner)
  let total_cost: number | null = null;
  {
    const normalized = text.replace(/[\uE000-\uF8FF]/g, "$").replace(/[ \t]+/g, " ");
    const m = normalized.match(/Total\s+(?:to\s+be\s+drafted|due\s+by)[\s\S]{0,120}?\$?\s*([\d][\d,]*\.\d{2})/i);
    if (m) total_cost = num(m[1]);
  }

  function findCurrentChargesBlock(): string | null {
    const both = p23;
    const s = both.search(/CURRENT\s+CHARGES\b/i);
    if (s < 0) return null;
    const tail = both.slice(s);
    // stop before next section/footer/page (keep BILLING FACTORS inside)
    const end = tail.search(/(?:\n\s*RATE CODES|\n\s*Taxes\b|Page\s+\d+\s+of\s+\d+|--- PAGE \d+ ---|\n\s*Summary\b)/i);
    return end >= 0 ? tail.slice(0, end) : tail;
  }

	    type EvergyCols = {
	    rateCodes: string[];                           // WSSES, MV20KS, ...
	    meters: string[];                              // aligned to columns
	    periods: Array<{ start: string | null; end: string | null }>;
	    kwh: Array<number | null>;                    // from "Energy use kWh" row
	    demandCost: Array<number | null>;             // from Charges "Demand ..." $
	    actualDemandKw: Array<number | null>;         // from "Actual demand kW"
	    adjustedDemandKw: Array<number | null>;       // from "Adjusted demand kW"
	    summerPeakKw: Array<number | null>;           // from "Summer peak kW"
	    ratchetKw: Array<number | null>;              // from "50% of summer peak kW"
	    billingDemandKw: Array<number | null>;        // from "Billing Demand kW"
	    tariffMinKw: Array<number | null>;            // from "Tariff minimum demand kW"
	    sectionTotal: Array<number | null>;           // from "Total current charges" row per column
	  };

   function parsePageGrid(pageText: string): EvergyCols | null {
    // Find the CURRENT CHARGES block on this page only
    const startIdx = pageText.search(/CURRENT\s+CHARGES\b/i);
    if (startIdx < 0) return null;
    const tail = pageText.slice(startIdx);
    const endIdx = tail.search(
      /(?:\n\s*RATE CODES|\n\s*Taxes\b|Page\s+\d+\s+of\s+\d+|--- PAGE \d+ ---|\n\s*Summary\b)/i
    );
    const block = endIdx >= 0 ? tail.slice(0, endIdx) : tail;

    const lines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const num = (s: string) => parseFloat(s.replace(/,/g, ""));

    // Helper: parse a row "tail" into up to N numbers, preserving column positions.
    const parseTailRow = (
      tailText: string,
      N: number,
      opts: { treatDashAsZero?: boolean } = {}
    ): (number | null)[] => {
      const { treatDashAsZero = false } = opts;
      const out: (number | null)[] = [];
      const tokens = tailText.split(/\s+/).filter(Boolean);

      for (const token of tokens) {
        if (out.length >= N) break;

        // Preserve placeholder columns even when PDFs use Unicode dash variants.
        const normalizedToken = token.replace(/[\u2012\u2013\u2014\u2212]/g, "-");
        if (/^-+$/.test(normalizedToken)) {
          out.push(treatDashAsZero ? 0 : null);
          continue;
        }

        // Strip weird glyphs, $, etc., keep digits, commas, dot, minus.
        let raw = normalizedToken.replace(/[^\d,\.\-]/g, "");
        if (!raw) continue;

        // Handle dashes as explicit "no value" but keep the column position
        if (raw === "-" || raw === "--") {
          out.push(treatDashAsZero ? 0 : null);
          continue;
        }

        const cleaned = raw.replace(/,/g, "");
        if (/^-?\d+(?:\.\d+)?$/.test(cleaned)) {
          out.push(parseFloat(cleaned));
        }
      }

      // Pad to N columns so everything stays aligned
      while (out.length < N) out.push(null);
      return out;
    };

    // ---- Rate codes (robust): optional colon; ignore "(See Definitions)"
    const rateTail =
      pageText.match(/Rate\s*code(?:\s*\([^\)]+\))?\s*:?\s*([^\n]+)/i)?.[1]?.trim() || "";
    let rateCodes = [...rateTail.matchAll(/\b[A-Z0-9]{3,}\b/g)].map(m => m[0]);

    // ---- Meter(s): use only the part of the line BEFORE "Rate code"
    const meterLineRaw = lines.find(l => /\bMeter\b/i.test(l)) || "";
    const meterLeft = meterLineRaw.split(/\bRate\s*code\b/i)[0] || meterLineRaw;
    const meterTokensInGrid = meterLeft
      .split(/\s+/)
      .map(t => t.replace(/[^\w-]/g, "")) // strip glyphs/colons
      .filter(Boolean)
      .filter(tok => /^[0-9][0-9\-]{5,}$/.test(tok)); // numeric/hyphen tokens only

    // ---- Determine number of columns N (from rate codes / meters, not kWh)
    const N = Math.max(rateCodes.length || 0, meterTokensInGrid.length || 0, 1);
    if (rateCodes.length === 0) rateCodes.push("COL1");
    while (rateCodes.length < N) rateCodes.push(`COL${rateCodes.length + 1}`);
    if (rateCodes.length > N) rateCodes.splice(N);

    // ---- Meters: rightmost N numeric tokens; if none in-grid, try header fallback
    let meters = meterTokensInGrid.slice(-N);
    if (meters.length === 0) {
      const normAll = (page1 + "\n" + page2 + "\n" + page3)
        .replace(/[\u00A0\u2000-\u200B\uE000-\uF8FF]/g, " ")
        .replace(/[ \t]+/g, " ");
      const headerMeterRxs: RegExp[] = [
        /\bMeter\s*#\s*[:\-]?\s*([A-Za-z0-9\-]{5,})\b/i,
        /\bMeter[\s\u2000-\u200B\uE000-\uF8FF]*#?[\s\u2000-\u200B\uE000-\uF8FF]*[:\-]?\s*([A-Za-z0-9\-]{5,})\b/i,
        /\bMeter\s+Number\s*[:\-]?\s*([A-Za-z0-9\-]{5,})\b/i,
        /\bService\s+ID\s*[:\-]?\s*([A-Za-z0-9\-]{5,})\b/i,
      ];
      let found: string | null = null;
      for (const rx of headerMeterRxs) {
        const m = normAll.match(rx);
        if (m?.[1]) {
          found = m[1].replace(/[^\w-]/g, "");
          break;
        }
      }
      meters = Array(N).fill(found || "");
    } else {
      while (meters.length < N) meters.push("");
      if (meters.length > N) meters = meters.slice(-N);
    }

    // ---- Periods: try in-grid; else banner on p1/this page
    const perLine = lines.find(l => /\bBilling\s+period\b/i.test(l)) || "";
    const inGridPairs = [
      ...perLine.matchAll(
        /(\d{1,2}\/\d{1,2}\/\d{2,4})\s*[–—-]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/g
      ),
    ];
    const bannerPer =
      page1.match(
        /\bBilling\s+period\s*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s*[–—-]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i
      ) ||
      pageText.match(
        /\bBilling\s+period\s*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s*[–—-]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i
      );
    const periods = Array.from({ length: N }, () => ({
      start: null as string | null,
      end: null as string | null,
    }));
    if (inGridPairs.length) {
      const lastN = inGridPairs.slice(-N);
      for (let i = 0; i < N; i++) {
        const p = lastN[i - (N - lastN.length)] || null;
        if (p) periods[i] = { start: p[1], end: p[2] };
      }
    } else if (bannerPer) {
      for (let i = 0; i < N; i++) periods[i] = { start: bannerPer[1], end: bannerPer[2] };
    }

    // ---- kWh per column: parse the line AFTER "kWh"
    let kwh: (number | null)[] = Array(N).fill(null);
    {
      const normLines = lines.map(l =>
        l
          .replace(/[\u00A0\u2000-\u200B\uE000-\uF8FF]/g, " ")
          .replace(/k\W*w\W*h/gi, "kWh")
          .replace(/[ \t]+/g, " ")
          .trim()
      );
      const kwhIdx = normLines.findIndex(l => /Energy\s+use\b.*\bkWh\b/i.test(l));
      if (kwhIdx >= 0) {
        const raw = lines[kwhIdx].replace(/[\u00A0\u2000-\u200B\uE000-\uF8FF]/g, " ");
        const m = raw.match(/kWh\s*(.*)$/i);
        const tailAfter = m ? m[1] : "";
        kwh = parseTailRow(tailAfter, N, { treatDashAsZero: true });
      } else {
        // Fallback: single-meter heuristics into first column only
        const m2 = block
          .replace(/[\u00A0\u2000-\u200B\uE000-\uF8FF]/g, " ")
          .match(/Energy\s+use[\s\S]{0,80}?([0-9][\d,]*(?:\.\d+)?)/i);
        if (m2) {
          kwh[0] = num(m2[1]);
        } else {
          const pres = block.match(/Present\s+meter\s+read[^\n]*?([0-9][0-9,]*(?:\.\d+)?)/i);
          const prev = block.match(/Previous\s+meter\s+read[^\n]*?([0-9][0-9,]*(?:\.\d+)?)/i);
          const mult = block.match(/Billing\s+multiplier[^\n]*?([0-9][0-9,]*(?:\.\d+)?)/i);
          if (pres && prev) {
            kwh[0] = Math.max(
              0,
              (num(pres[1]) - num(prev[1])) * (mult ? num(mult[1]) : 1)
            );
          }
        }
      }
    }

    // ---- Demand $ per column (if present): from "Demand" charges row
    let demandCost: (number | null)[] = Array(N).fill(null);
    {
      const chargesIdx = lines.findIndex(l => /^Charges\b/i.test(l));
      const chargesLines = chargesIdx >= 0 ? lines.slice(chargesIdx) : lines;
      const demandRow = chargesLines.find(l => /^Demand\b/i.test(l));
      if (demandRow) {
        const raw = demandRow.replace(/[\u00A0\u2000-\u200B\uE000-\uF8FF]/g, " ");
        const m = raw.match(/Demand[^\$]*\$(.*)$/i);
        const tailAfter = m ? m[1] : raw.replace(/^Demand\b/i, "");
        demandCost = parseTailRow(tailAfter, N, { treatDashAsZero: true });
      }
    }

    const parseKwMetricRow = (rowLabelRegex: RegExp): (number | null)[] => {
      const normLines = lines.map((l) =>
        l
          .replace(/[\u00A0\u2000-\u200B\uE000-\uF8FF]/g, " ")
          .replace(/[ \t]+/g, " ")
          .trim()
      );
      const idx = normLines.findIndex((l) => rowLabelRegex.test(l));
      if (idx < 0) return Array(N).fill(null);

      const raw = normLines[idx];
      const m = raw.match(rowLabelRegex);
      const tailAfter =
        m && m.index != null ? raw.slice(m.index + m[0].length).replace(/^[:\s]+/, "") : raw;
      return parseTailRow(tailAfter, N, { treatDashAsZero: false });
    };

    const actualDemandKw = parseKwMetricRow(/Actual\s+Demand\s*kW/i);
    const adjustedDemandKw = parseKwMetricRow(/Adjusted\s+Demand\s*kW/i);
    const summerPeakKw = parseKwMetricRow(/Summer\s+Peak\s*kW/i);
    const ratchetKw = parseKwMetricRow(/(?:50|0)\s*%\s+of\s+Summer\s+Peak\s*kW/i);
    const billingDemandKw = parseKwMetricRow(/Billing\s+Demand\s*kW/i);
    const tariffMinKw = parseKwMetricRow(/Tariff\s+Minimum\s+Demand\s*kW/i);

    // ---- Section total $ per column: "Total current charges"
    let sectionTotal: (number | null)[] = Array(N).fill(null);
    {
      const totalLine =
        lines.find(l => /^Total\s+current\s+charges\b/i.test(l)) || "";
      if (totalLine) {
        const raw = totalLine.replace(/[\u00A0\u2000-\u200B\uE000-\uF8FF]/g, " ");
        const m = raw.match(/charges[^\$]*\$(.*)$/i);
        const tailAfter = m ? m[1] : raw.replace(/^Total\s+current\s+charges\b/i, "");
        sectionTotal = parseTailRow(tailAfter, N, { treatDashAsZero: true });
      }
    }

    hints.push(
      `evergy: page N=${N} rates=[${rateCodes.join(", ")}] meters=[${meters.join(
        "|"
      )}] kwh=[${kwh.map(v => v ?? "null").join("|")}] actual_demand_kw=[${actualDemandKw
        .map((v) => v ?? "null")
        .join("|")}] adjusted_demand_kw=[${adjustedDemandKw
        .map((v) => v ?? "null")
        .join("|")}] summer_peak_kw=[${summerPeakKw
        .map((v) => v ?? "null")
        .join("|")}] ratchet_kw=[${ratchetKw
        .map((v) => v ?? "null")
        .join("|")}] billing_demand_kw=[${billingDemandKw
        .map((v) => v ?? "null")
        .join("|")}] tariff_min_kw=[${tariffMinKw.map((v) => v ?? "null").join("|")}]`
    );

    return {
      rateCodes,
      meters,
      periods,
      kwh,
      demandCost,
      actualDemandKw,
      adjustedDemandKw,
      summerPeakKw,
      ratchetKw,
      billingDemandKw,
      tariffMinKw,
      sectionTotal,
    };
  }

  function parseMulti(): EvergyCols | null {
    const cols2 = parsePageGrid(page2);
    const cols3 = parsePageGrid(page3);

    if (!cols2 && !cols3) return null;
    if (cols2 && !cols3) return cols2;
    if (!cols2 && cols3) return cols3;

    // Both pages have grids: concatenate columns
    return {
      rateCodes: [...(cols2?.rateCodes || []), ...(cols3?.rateCodes || [])],
      meters: [...(cols2?.meters || []), ...(cols3?.meters || [])],
      periods: [...(cols2?.periods || []), ...(cols3?.periods || [])],
      kwh: [...(cols2?.kwh || []), ...(cols3?.kwh || [])],
      demandCost: [...(cols2?.demandCost || []), ...(cols3?.demandCost || [])],
      actualDemandKw: [...(cols2?.actualDemandKw || []), ...(cols3?.actualDemandKw || [])],
      adjustedDemandKw: [...(cols2?.adjustedDemandKw || []), ...(cols3?.adjustedDemandKw || [])],
      summerPeakKw: [...(cols2?.summerPeakKw || []), ...(cols3?.summerPeakKw || [])],
      ratchetKw: [...(cols2?.ratchetKw || []), ...(cols3?.ratchetKw || [])],
      billingDemandKw: [...(cols2?.billingDemandKw || []), ...(cols3?.billingDemandKw || [])],
      tariffMinKw: [...(cols2?.tariffMinKw || []), ...(cols3?.tariffMinKw || [])],
      sectionTotal: [...(cols2?.sectionTotal || []), ...(cols3?.sectionTotal || [])],
    };
  }



  // Prefer WSSES; else first column with kWh; else 0
  function pickIndex(cols: EvergyCols): number {
    const w = cols.rateCodes.findIndex(rc => /WSSES/i.test(rc));
    if (w >= 0) return w;
    const any = cols.kwh.findIndex(v => (v ?? 0) > 0);
    return any >= 0 ? any : 0;
  }

  // ---------- pick/assemble ----------
  let period_start: string | null = null;
  let period_end: string | null = null;
  let meter_no: string | null = null;
  let usage_kwh: number | null = null;
  let demand_cost: number | null = null;

     const cols = parseMulti();
  if (cols) {
    // Use one column as the "primary" for summary fields,
    // but emit an Item for *each* meter/column.
    const primaryIdx = pickIndex(cols);

    const primaryPeriod = cols.periods[primaryIdx];
    if (primaryPeriod) {
      period_start = primaryPeriod.start;
      period_end = primaryPeriod.end;
    }

    // Summary usage/demand: sum over all columns (nulls treated as 0)
    const sumNums = (arr: Array<number | null>) =>
      arr.reduce((acc, v) => acc + (typeof v === "number" ? v : 0), 0);

    usage_kwh = cols.kwh.some(v => v != null) ? sumNums(cols.kwh) : null;
    demand_cost = cols.demandCost.some(v => v != null) ? sumNums(cols.demandCost) : null;
    meter_no = cols.meters[primaryIdx] || null;

    hints.push(
      `evergy: multi-meters count=${cols.meters.length} primaryIdx=${primaryIdx} summary_kWh=${usage_kwh ?? "null"}`
    );

    for (let i = 0; i < cols.meters.length; i++) {
      const per = cols.periods[i];
      console.log("[evergy-parse][column]", {
        column: i,
        meter: cols.meters[i] || null,
        period_start: per?.start ?? period_start ?? null,
        period_end: per?.end ?? period_end ?? null,
        existing: {
          usage_kwh: cols.kwh[i] ?? null,
          demand_cost: cols.demandCost[i] ?? null,
          section_total_cost: cols.sectionTotal[i] ?? null,
        },
        new_fields: {
          actual_demand_kw: cols.actualDemandKw[i] ?? null,
          adjusted_demand_kw: cols.adjustedDemandKw[i] ?? null,
          summer_peak_kw: cols.summerPeakKw[i] ?? null,
          ratchet_kw: cols.ratchetKw[i] ?? null,
          billing_demand_kw: cols.billingDemandKw[i] ?? null,
          tariff_min_kw: cols.tariffMinKw[i] ?? null,
        },
      });
      items.push({
        service_address,
        meter_no: cols.meters[i] || null,
        period_start: per?.start ?? period_start,
        period_end: per?.end ?? period_end,
        usage_kwh: cols.kwh[i] ?? null,
        section_total_cost: cols.sectionTotal[i] ?? null,
        total_cost: null, // keep account total at Parsed.total_cost only
        demand_cost: cols.demandCost[i] ?? null,
        actual_demand_kw: cols.actualDemandKw[i] ?? null,
        adjusted_demand_kw: cols.adjustedDemandKw[i] ?? null,
        summer_peak_kw: cols.summerPeakKw[i] ?? null,
        ratchet_kw: cols.ratchetKw[i] ?? null,
        billing_demand_kw: cols.billingDemandKw[i] ?? null,
        tariff_min_kw: cols.tariffMinKw[i] ?? null,
        hints,
      });
    }
  }

  // Last-resort period from banner if still missing
  if (!period_start || !period_end) {
    const perBanner =
      page1.match(
        /\bBilling\s+period\s*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s*[–—-]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i
      ) ||
      page2.match(
        /\bBilling\s+period\s*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s*[–—-]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i
      );
    if (perBanner) {
      period_start = perBanner[1];
      period_end = perBanner[2];
    }
  }

  // Fallback: if we still didn't push any items, create one coarse item
  if (!items.length) {
    const electricItem: Item = {
      service_address,
      meter_no,
      period_start,
      period_end,
      usage_kwh,
      section_total_cost: null,
      total_cost,
      demand_cost,
      actual_demand_kw: null,
      adjusted_demand_kw: null,
      summer_peak_kw: null,
      ratchet_kw: null,
      billing_demand_kw: null,
      tariff_min_kw: null,
      hints,
    };
    items.push(electricItem);
  }



  return {
    vendor: "evergy",
    period: {},
    usage_kwh,
    total_cost,
    demand_cost,
    service_address,
    meter_no,
    items: dedupeAndMerge(postProcessItems(items)),
    hints,
  };
}

/* ---------------- KGS (Gas) Parser — Page 2 only ---------------- */
function parseKgs(text: string): Parsed {
  const hints: string[] = [];
  const items: Item[] = [];

  const normalizedDoc = text.replace(/[\uFF04\uFE69\uFDFC\uF0A4\uE000-\uF8FF]/g, "$");
  const lines = normalizedDoc.split(/\r?\n/);

  const page2 = normalizedDoc.match(/--- PAGE 2 ---([\s\S]*?)(?=--- PAGE 3 ---|$)/i)?.[1] || "";
  const page2Lines = page2.split(/\r?\n/);

  // ---------- helpers ----------
  function escapeRe(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Fuzzy match the service address on page 2 (ignores extra spacing)
  function findAddrIdxOnPage2(p2lines: string[], addr: string | null) {
    if (!addr) return -1;
    const pat = addr.split(/\s+/).map(escapeRe).join("\\s+");
    const re = new RegExp(pat, "i");
    for (let i = 0; i < p2lines.length; i++) {
      const flat = p2lines[i].replace(/\s+/g, " ");
      if (re.test(flat)) return i;
    }
    return -1;
  }

  // Line-indexed section slicer for page 2: start at exact (meter + start + end) line,
  // stop at the next meter row (or end of page 2)
  function sectionForMeterOnPage2Lines(p2lines: string[], meter: string, start: string, end: string) {
    const anchorRe = new RegExp(`^\\s*${escapeRe(meter)}\\s+${escapeRe(start)}\\s+${escapeRe(end)}\\b`, "i");
    const startIdx = p2lines.findIndex((l) => anchorRe.test(l));
    if (startIdx === -1) return null;

    const nextMeterRe = /^\s*[A-Z0-9]{8,14}\s+\d{2}-\d{2}-\d{2}\s+\d{2}-\d{2}-\d{2}\b/i;
    let stopIdx = p2lines.slice(startIdx + 1).findIndex((l) => nextMeterRe.test(l));
    if (stopIdx !== -1) stopIdx = startIdx + 1 + stopIdx;
    return p2lines.slice(startIdx, stopIdx === -1 ? p2lines.length : stopIdx).join("\n");
  }
  // ---------- /helpers ----------

  type MeterRow = { idx: number; meter: string; start: string; end: string };
  const meterRows: MeterRow[] = [];
  for (let i = 0; i < lines.length; i++) {
    const row = lines[i];
    const m = row.match(/([A-Z0-9]{8,14})\s+(\d{2}-\d{2}-\d{2})\s+(\d{2}-\d{2}-\d{2})/i);
    if (m) meterRows.push({ idx: i, meter: m[1], start: m[2], end: m[3] });
  }

  const normAddr = (s?: string | null) => (s ? cleanAddressRaw(s) : null);

  for (let i = 0; i < meterRows.length; i++) {
    const cur = meterRows[i];
    const nextIdx = i + 1 < meterRows.length ? meterRows[i + 1].idx : lines.length;

    // --- ADDRESS (compute first; used to anchor the section on page 2) ---
    let service_address: string | null = null;
    let perMcfIdx = -1;
    for (let up = cur.idx - 1; up >= Math.max(0, cur.idx - 25); up--) {
      if (/^\s*Per\s+MCF\s*$/i.test(lines[up].trim())) {
        perMcfIdx = up;
        break;
      }
    }
    if (perMcfIdx !== -1) {
      let addrLineIdx = perMcfIdx + 1;
      while (addrLineIdx < cur.idx && /^\s*$/.test(lines[addrLineIdx])) addrLineIdx++;
      if (addrLineIdx < cur.idx) service_address = normAddr(lines[addrLineIdx]);
    }
    if (!service_address) {
      for (let up = cur.idx - 1; up >= Math.max(0, cur.idx - 10); up--) {
        if (/^\s*\d{1,6}\s+[A-Z0-9.\s]+$/i.test(lines[up].trim())) {
          service_address = normAddr(lines[up]);
          break;
        }
      }
    }

    // --- SECTION (per-meter, page-2 anchored by meter+dates; robust for duplicate addresses) ---
let section: string | null = null;

// Try to find the exact meter+dates line on page 2, then bound by nearest "Per MCF" lines.
const meterAnchorRe = new RegExp(
  `^\\s*${escapeRe(cur.meter)}\\s+${escapeRe(cur.start)}\\s+${escapeRe(cur.end)}\\b`,
  "i"
);
const meterLineIdx = page2Lines.findIndex((l) => meterAnchorRe.test(l));

if (meterLineIdx !== -1) {
  // Walk UP to this box's "Per MCF"
  let startIdx = meterLineIdx;
  for (let up = meterLineIdx; up >= 0; up--) {
    if (/^\s*Per\s+MCF\b/i.test(page2Lines[up])) { startIdx = up; break; }
  }
  // Walk DOWN to the next "Per MCF" or end of page 2
  let stopIdx = page2Lines.length;
  for (let dn = meterLineIdx + 1; dn < page2Lines.length; dn++) {
    if (/^\s*Per\s+MCF\b/i.test(page2Lines[dn])) { stopIdx = dn; break; }
  }
  section = page2Lines.slice(startIdx, stopIdx).join("\n");
}

// Fallback: use address boxes, but pick the one that actually contains this meter.
if (!section) {
  if (service_address) {
    const addrPat = service_address.split(/\s+/).map(escapeRe).join("\\s+");
    const addrRe = new RegExp(addrPat, "i");

    // Collect all address occurrences on page 2
    const addrIdxs: number[] = [];
    for (let i2 = 0; i2 < page2Lines.length; i2++) {
      const flat = page2Lines[i2].replace(/\s+/g, " ");
      if (addrRe.test(flat)) addrIdxs.push(i2);
    }

    // For each address occurrence, take Per-MCF → next Per-MCF and see if it contains this meter.
    for (const ai of addrIdxs) {
      let startIdx = ai;
      for (let up = ai; up >= 0; up--) {
        if (/^\s*Per\s+MCF\b/i.test(page2Lines[up])) { startIdx = up; break; }
      }
      let stopIdx = page2Lines.length;
      for (let dn = ai + 1; dn < page2Lines.length; dn++) {
        if (/^\s*Per\s+MCF\b/i.test(page2Lines[dn])) { stopIdx = dn; break; }
      }
      const candidate = page2Lines.slice(startIdx, stopIdx).join("\n");
      if (new RegExp(`\\b${escapeRe(cur.meter)}\\b`).test(candidate)) {
        section = candidate;
        break;
      }
    }
  }
}

// Last fallback: use the global line window
if (!section) {
  section = lines.slice(cur.idx, nextIdx).join("\n");
}


    // --- SECTION TOTAL COST (robust, section-scoped) ---
    let section_total_cost: number | null = null;
    const sectionLines = section.split(/\r?\n/);

    // 1) Prefer a line that starts with "Current Charges"
    let ccIdx = sectionLines.findIndex((l) => /^\s*Current\s+Charges\b/i.test(l));
    // 2) Fallback: any line containing "Current Charges"
    if (ccIdx === -1) ccIdx = sectionLines.findIndex((l) => /Current\s+Charges/i.test(l));

    if (ccIdx !== -1) {
      // Take the RIGHTMOST amount on that line (columns can repeat)
      const moneyOnLine = [...sectionLines[ccIdx].matchAll(/\$?\s*([0-9][\d,]*\.\d{2})/g)]
        .map((m) => parseFloat(m[1].replace(/,/g, "")));
      if (moneyOnLine.length) section_total_cost = moneyOnLine[moneyOnLine.length - 1];

      // If nothing on the single line, check a 3-line window (handles wraps)
      if (section_total_cost == null) {
        const joined3 = [sectionLines[ccIdx], sectionLines[ccIdx + 1] ?? "", sectionLines[ccIdx + 2] ?? ""].join(" ");
        const m = joined3.match(/Current\s+Charges[^\$]*\$\s*([0-9][\d,]*\.\d{2})/i);
        if (m) section_total_cost = parseFloat(m[1].replace(/,/g, ""));
      }
    }

    if (section_total_cost == null) {
      // Last resort: only consider amounts AFTER the "Per MCF" line inside this section
      const perIdxInSection = sectionLines.findIndex((l) => /^\s*Per\s+MCF\b/i.test(l));
      const afterPer = sectionLines.slice(perIdxInSection === -1 ? 0 : perIdxInSection).join(" ");
      const amounts = [...afterPer.matchAll(/\$([0-9][\d,]*\.\d{2})/g)]
        .map((m) => parseFloat(m[1].replace(/,/g, "")));
      if (amounts.length) section_total_cost = Math.max(...amounts);
    }

    // --- USAGE MCF (section-scoped) ---
    let usage_mcf: number | null = null;
    {
      const constIdx = section.search(/\bCONSTANT\b/i);
      if (constIdx !== -1) {
        const tail = section.slice(constIdx);
        const tailLines = tail.split(/\r?\n/);
        let k = 1;
        while (k < tailLines.length && /^\s*$/.test(tailLines[k])) k++;
        if (k < tailLines.length) {
          const nums = [...tailLines[k].matchAll(/([0-9]+(?:\.[0-9]+)?)/g)].map((x) => x[1]);
          if (nums.length >= 3) {
            const third = num(nums[2]);
            if (third != null) usage_mcf = normalizeMcf(third);
          }
        }
      }
    }

    items.push({
      service_address,
      meter_no: cur.meter,
      period_start: cur.start,
      period_end: cur.end,
      usage_mcf,
      section_total_cost,
      hints: [
        service_address ? `KGS addr (after Per MCF) → "${service_address}"` : "KGS addr → (none)",
        `KGS meter → ${cur.meter}`,
        `KGS period ${cur.start} → ${cur.end}`,
        section_total_cost != null ? `KGS $ → ${section_total_cost.toFixed(2)}` : "KGS $ → (none)",
        usage_mcf != null ? `KGS MCF (3rd num after CONSTANT) → ${usage_mcf}` : "KGS MCF → (none)",
      ],
    });
  }

  const topTotalMatch = page2.match(/Total\s+Current\s+Charges\s*\$?\s*([0-9,]+\.\d{2})/i);
  const topTotal = topTotalMatch ? Number(topTotalMatch[1].replace(/,/g, "")) : null;

  return {
    vendor: "kgs",
    period: {},
    usage_kwh: null,
    total_cost: topTotal,
    demand_cost: null,
    service_address: null,
    meter_no: null,
    items: dedupeAndMerge(postProcessItems(items)),
    hints: [`KGS sections parsed: ${items.length}`],
  };
}


/* ---------------- WoodRiver (Gas Supply) ---------------- */
function parseWoodRiver(text: string): Parsed {
  const hints: string[] = [];
  const items: Item[] = [];

  let period_start: string | null = null;
  let period_end: string | null = null;
  const pm = text.match(/Production\s+Month\s*:\s*([A-Za-z]+)\s+(\d{4})/i);
  if (pm) {
    const MONTHS = [
      "JANUARY",
      "FEBRUARY",
      "MARCH",
      "APRIL",
      "MAY",
      "JUNE",
      "JULY",
      "AUGUST",
      "SEPTEMBER",
      "OCTOBER",
      "NOVEMBER",
      "DECEMBER",
    ];
    const mIdx = MONTHS.indexOf(pm[1].toUpperCase());
    const y = Number(pm[2]);
    if (mIdx >= 0) {
      const start = new Date(Date.UTC(y, mIdx, 1));
      const end = new Date(Date.UTC(y, mIdx + 1, 0));
      const pad = (n: number) => String(n).padStart(2, "0");
      period_start = `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}-01`;
      period_end = `${end.getUTCFullYear()}-${pad(end.getUTCMonth() + 1)}-${pad(end.getUTCDate())}`;
    }
  }

  const lines = text.split(/\r?\n/);
  const N = lines.length;
  const findIn = (re: RegExp, from: number, to: number): number => {
    for (let i = from; i < to; i++) if (re.test(lines[i])) return i;
    return -1;
  };
  const lastMoneyOn = (s: string): number | null => {
    const ms = [...s.matchAll(/\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d{2}))/g)];
    return ms.length ? Number(ms[ms.length - 1][1].replace(/,/g, "")) : null;
  };

  for (let i = 0; i < N; i++) {
    if (!/^\s*Service\s+Address\s*:/i.test(lines[i])) continue;

    const afterSvc = (lines[i].split(":")[1] ?? "");
    const cut = afterSvc.match(/\b(Acct\/?\s*Meter|Pipeline|Utility)\b/i);
    const addrTail = cut ? afterSvc.slice(0, cut.index) : afterSvc;
    const service_address = cleanAddressRaw(addrTail);

    const nextService = (() => {
      for (let k = i + 1; k < N; k++) if (/^\s*Service\s+Address\s*:/i.test(lines[k])) return k;
      return -1;
    })();
    const subIdx = findIn(/^\s*Sub-Total\s*:/i, i, nextService !== -1 ? nextService : N);
    const blockEnd = subIdx !== -1 ? subIdx : nextService !== -1 ? nextService : N;

    let meter_no: string | null = null;
    {
      const acctSame = lines[i].match(/Acct\/?\s*Meter\s*:?\s*(.+)$/i);
      let acctTail = acctSame ? acctSame[1] : null;
      if (!acctTail) {
        const acctIdx = findIn(/Acct\/?\s*Meter\s*:?/i, i, blockEnd + 1);
        if (acctIdx !== -1) acctTail = lines[acctIdx].match(/Acct\/?\s*Meter\s*:?\s*(.+)$/i)?.[1] ?? "";
      }
      if (acctTail) {
        const rightSide = (acctTail.split("/").pop() || acctTail).trim();
        const m = rightSide.match(/[A-Za-z0-9]{5,}$/);
        meter_no = m ? m[0].toUpperCase() : null;
      }
    }

    let usage_mmbtu: number | null = null;
    let section_total_cost: number | null = null;
    {
      const fIdx = findIn(/Fixed\s*\(FOM\)/i, i, blockEnd + 1);
      if (fIdx !== -1) {
        const nums = [...lines[fIdx].matchAll(/([0-9]+(?:\.[0-9]+)?)/g)].map((m) => m[1]);
        if (nums.length) usage_mmbtu = Number(nums[0]);
        section_total_cost = lastMoneyOn(lines[fIdx]);
      }
      if (section_total_cost == null && subIdx !== -1) {
        section_total_cost = lastMoneyOn(lines[subIdx]);
      }
    }

    items.push({
      service_address,
      meter_no,
      period_start,
      period_end,
      usage_mmbtu,
      section_total_cost,
      hints: [],
    });

    if (blockEnd > i) i = blockEnd === nextService ? blockEnd - 1 : blockEnd;
  }

  return {
    vendor: "woodriver",
    period: {},
    usage_kwh: null,
    total_cost: null,
    demand_cost: null,
    service_address: null,
    meter_no: null,
    items: dedupeAndMerge(postProcessItems(items)),
    hints: [],
  };
}

/* ---------------- Dispatcher ---------------- */
function parseAuto(text: string): Parsed {
  const t = text || "";

  const isWoodRiver =
    /Wood\s*River/i.test(t) ||
    /WoodRiver\s+Energy/i.test(t) ||
    (/\bService\s+Address\s*:/i.test(t) && /Acct\/?\s*Meter\s*:?/i.test(t) && /Fixed\s*\(FOM\)/i.test(t));
  const isEvergy = /Evergy/i.test(t) || /Service location:/i.test(t) || /Total\s+to\s+be\s+drafted/i.test(t);
  const isKgs = /Kansas\s+Gas\s+Service/i.test(t) || /A Division of ONE Gas/i.test(t) || /\bMCF\b/i.test(t);

  if (isWoodRiver && !isEvergy && !isKgs) return parseWoodRiver(t);
  if (isKgs && !isEvergy && !isWoodRiver) return parseKgs(t);
  if (isEvergy && !isKgs && !isWoodRiver) return parseEvergy(t);

  const w = parseWoodRiver(t);
  const k = parseKgs(t);
  const e = parseEvergy(t);

  const wScore = (w.items?.length || 0) + (/\bProduction\s+Month\b/i.test(t) ? 1 : 0);
  const kScore = (k.total_cost ? 1 : 0) + (k.items?.length || 0);
  const eScore = (e.total_cost ? 1 : 0) + (e.items?.length || 0);

  if (wScore >= kScore && wScore >= eScore) return w;
  if (kScore >= eScore) return k;
  return e;
}

const PARSER_QA_MODE = false;
const MAX_BATCH_FILES = 20;

// ---------- Supabase REST fetch helper ----------
async function getFromSupabase(path: string) {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}${path}`;
  const headers = {
    apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
    Accept: "application/json",
  };
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text();
    console.error("[supabase REST]", res.status, res.statusText, { url, text });
    throw new Error(`Supabase REST ${res.status}: ${text}`);
  }
  return res.json();
}


/* ---------------- UI (multi-file) ---------------- */
export default function OcrTestPage() {
  const { loading } = useAuthGate(true);

  const [fileInfos, setFileInfos] = useState<Array<{ name: string; size: number }>>([]);
  const [batchWarning, setBatchWarning] = useState<string | null>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [approved, setApproved] = useState<Record<number, boolean>>({});
  const [edits, setEdits] = useState<Record<number, ReturnType<typeof toEditable>>>({});
  const [posting, setPosting] = useState(false);

  const [orgId, setOrgId] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from("memberships")
        .select("org_id")
        .eq("profile_id", user.id)
        .single();
      if (!error && data) setOrgId(data.org_id);
    })();
  }, []);

  // Load org buildings
  const [orgBuildings, setOrgBuildings] = useState<
    Array<{
      id: string;
      name: string | null;
      address: string | null;
      city: string | null;
      state: string | null;
      postal_code: string | null;
    }>
  >([]);
  useEffect(() => {
    (async () => {
      if (!orgId) return;
      const { data, error } = await supabase
        .from("buildings")
        .select("id,name,address,city,state,postal_code")
        .eq("org_id", orgId);
      if (!error && data) setOrgBuildings(data as any);
    })();
  }, [orgId]);

  // Load meters
  const [orgMeters, setOrgMeters] = useState<
    Array<{ id: string; label: string | null; building_id: string; utility: "electric" | "gas" }>
  >([]);
  useEffect(() => {
    (async () => {
      if (!orgId) return;
      const { data, error } = await supabase
        .from("meters")
        .select("id,label,building_id,utility,buildings!inner(org_id)")
        .eq("buildings.org_id", orgId);
      if (!error && data) {
        const rows = (data as any[]).map((r) => ({
          id: r.id,
          label: r.label ?? null,
          building_id: r.building_id,
          utility: r.utility,
        }));
        setOrgMeters(rows);
      }
    })();
  }, [orgId]);

// Load alternate addresses (if present) — no join; filter by this org's building IDs
const [altAddresses, setAltAddresses] = useState<Array<{ building_id: string; address: string }>>([]);
useEffect(() => {
  (async () => {
    if (!orgBuildings.length) return; // wait until buildings are loaded

    // Collect this org's building IDs
    const buildingIds = orgBuildings.map(b => b.id);

    // Chunk the IN() to be safe for large orgs
    const chunkSize = 100;
    const chunks: string[][] = [];
    for (let i = 0; i < buildingIds.length; i += chunkSize) {
      chunks.push(buildingIds.slice(i, i + chunkSize));
    }

    const all: Array<{ building_id: string; address: string }> = [];
    for (const ids of chunks) {
      const { data, error } = await supabase
        .from("building_alt_addresses")
        .select("building_id,address")
        .in("building_id", ids);

      if (error) {
        console.error("Error loading building_alt_addresses", error);
        continue; // or throw if you prefer
      }
      if (Array.isArray(data)) {
        all.push(...data.map(r => ({ building_id: r.building_id, address: r.address ?? "" })));
      }
    }

    setAltAddresses(all);
  })();
}, [orgBuildings]);



  const buildingLabel = useCallback(
    (b: { name: string | null; address: string | null; city: string | null; state: string | null }) => {
      const parts = [];
      if (b.name) parts.push(b.name);
      const addr = [b.address, b.city, b.state].filter(Boolean).join(", ");
      if (addr) parts.push(addr);
      return parts.join(" • ");
    },
    []
  );

  const addressIndex = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of orgBuildings) {
      const line1 = (b.address ?? "").toString();
      const norm = uspsNormalizeAddress(line1);
      const key = addrMatchKey(line1);
      if (norm) map.set(norm, b.id);
      if (key) map.set(key, b.id);
      const full = uspsNormalizeAddress([b.address, b.city, b.state].filter(Boolean).join(" "));
      if (full) map.set(full, b.id);
    }
    for (const a of altAddresses) {
      const norm = uspsNormalizeAddress(a.address ?? "");
      const key = addrMatchKey(a.address ?? "");
      if (norm) map.set(norm, a.building_id);
      if (key) map.set(key, a.building_id);
    }
    return map;
  }, [orgBuildings, altAddresses]);

  const meterIndex = useMemo(() => {
    const map = new Map<
      string,
      { meterId: string; buildingId: string; utility: "electric" | "gas" }
    >();
    for (const m of orgMeters) {
      const norm = normalizeMeter(m.label ?? "");
      if (norm) map.set(norm, { meterId: m.id, buildingId: m.building_id, utility: m.utility });
    }
    return map;
  }, [orgMeters]);

  /* ------ Manual match state ------ */
  const [manualMatch, setManualMatch] = useState<Record<number, string | null>>({});
  useEffect(() => {
    const init: Record<number, string | null> = {};
    (parsed?.items ?? []).forEach((_it, idx) => (init[idx] = null));
    setManualMatch(init);
  }, [parsed?.items?.length]);

  /* ------ File handlers ------ */
  const handleFile = useCallback(async (f: File) => {
    setErr(null);
    setBusy(true);
    try {
      const text = await extractPdfText(f);
      const out = parseAuto(text);
      const itemsWithSource = out.items.map((it) => ({ ...it, __sourceFile: f.name, __vendor: out.vendor }));
      const agg: Parsed = {
        vendor: out.vendor,
        period: {},
        usage_kwh: null,
        total_cost: null,
        demand_cost: null,
        service_address: null,
        meter_no: null,
        items: itemsWithSource,
        hints: out.hints ?? [],
      };
      setParsed(agg);
      setFileInfos([{ name: f.name, size: f.size }]);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const handleFiles = useCallback(async (filesList: FileList) => {
    const files = Array.from(filesList);
    const capped = files.slice(0, MAX_BATCH_FILES);
    setBatchWarning(
      files.length > MAX_BATCH_FILES
        ? `Selected ${files.length}. Processing first ${MAX_BATCH_FILES} files.`
        : null
    );

    setErr(null);
    setBusy(true);

    const aggregatedItems: Item[] = [];
    const aggregatedHints: string[] = [];
    const infos: Array<{ name: string; size: number }> = [];

    try {
      for (const f of capped) {
        infos.push({ name: f.name, size: f.size });
        const text = await extractPdfText(f);
        const out = parseAuto(text);
        const itemsWithMeta = out.items.map((it) => ({
          ...it,
          __sourceFile: f.name,
          __vendor: out.vendor,
        }));
        aggregatedItems.push(...itemsWithMeta);
        if (out.hints?.length) aggregatedHints.push(...out.hints.map((h) => `[${f.name}] ${h}`));
      }

      const allRows = postProcessItems(aggregatedItems);

      setParsed({
        vendor: "unknown",
        period: {},
        usage_kwh: null,
        total_cost: null,
        demand_cost: null,
        service_address: null,
        meter_no: null,
        items: allRows,
        hints: aggregatedHints,
      });
      setFileInfos(infos);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!parsed?.items?.length) {
      setApproved({});
      setEdits({});
      return;
    }
    const nextApproved: Record<number, boolean> = {};
    const nextEdits: Record<number, ReturnType<typeof toEditable>> = {};
    parsed.items.forEach((it, idx) => {
      const conf = confidenceForItem(it);
      const good =
        conf >= 7 &&
        (it.meter_no?.trim()?.length ?? 0) > 0 &&
        isValidDateish(it.period_start) &&
        isValidDateish(it.period_end) &&
        (it.usage_kwh != null || it.usage_mcf != null || it.usage_mmbtu != null) &&
        (it.total_cost != null || it.section_total_cost != null);
      nextApproved[idx] = !!good;

      const ed = toEditable(it);
      const vend = (it.__vendor ?? parsed.vendor) as Parsed["vendor"];
      ed.provider = vendorToProvider(vend) ?? "";
      nextEdits[idx] = ed;
    });

// 👇 Add this log so you see payloads as soon as items are staged
  console.log("Staged parsed items for", parsed.vendor, parsed.items);

    setApproved(nextApproved);
    setEdits(nextEdits);
  }, [parsed]);

  const staged = useMemo(() => {
  if (!parsed?.items?.length) return [];
  return parsed.items.map((it, idx) => {
    const edit = edits[idx] ?? toEditable(it);
    const vend = (it.__vendor ?? parsed.vendor) as Parsed["vendor"];

    const meterNorm = normalizeMeter(edit.meter);
    const byMeter = meterNorm ? meterIndex.get(meterNorm) ?? null : null;

    const addrNorm = uspsNormalizeAddress(edit.address);
    const key = addrMatchKey(edit.address);
    const byAddr =
      (addrNorm && addressIndex.get(addrNorm)) ||
      (key && addressIndex.get(key)) ||
      null;

    const autoMatchBuildingId = byMeter?.buildingId ?? byAddr ?? null;
    const autoMatchVia: "meter" | "address" | "none" = byMeter
      ? "meter"
      : byAddr
      ? "address"
      : "none";

    return {
      idx,
      conf: confidenceForItem(it),
      vendor: vend,
      sourceFile: it.__sourceFile ?? "—",
      edit,
      raw: it,
      addrNorm,
      autoMatchBuildingId,
      autoMatchVia,
      meterHit: byMeter,
    };
  });
}, [parsed, edits, meterIndex, addressIndex]);

  useEffect(() => {
    if (!staged.length) return;
    setApproved((prev) => {
      let changed = false;
      const next = { ...prev };
      staged.forEach((row) => {
        if (row.autoMatchVia === "meter" && !next[row.idx]) {
          next[row.idx] = true;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [staged]);

const matchViaMeter = staged.filter((row) => row.autoMatchVia === "meter").length;
const matchViaAddress = staged.filter((row) => row.autoMatchVia === "address").length;
const unmatched = staged.filter((row) => row.autoMatchVia === "none").length;

  function setEdit(idx: number, patch: Partial<ReturnType<typeof toEditable>>) {
    setEdits((prev) => ({ ...prev, [idx]: { ...(prev[idx] ?? toEditable(parsed!.items[idx])), ...patch } }));
  }

  const approvedCount = Object.values(approved).filter(Boolean).length;
  const needsReview = (parsed?.items?.length ?? 0) - approvedCount;

 async function handleIngest() {
  if (PARSER_QA_MODE) {
    console.log("[parser-qa] ingest blocked", {
      reason: "PARSER_QA_MODE",
      approvedCount,
      parsedItems: parsed?.items?.length ?? 0,
    });
    alert("Ingest is temporarily disabled while Evergy parser QA is in progress.");
    return;
  }
  if (!orgId) throw new Error("Missing orgId (no membership found)");
  if (!parsed?.items?.length) throw new Error("Nothing to ingest yet");

  const toYmd = (d: string) =>
    /^\d{2}-\d{2}-\d{2}$/.test(d)
      ? (() => {
          const [mm, dd, yy] = d.split("-");
          return `20${yy}-${mm}-${dd}`;
        })()
      : String(d).slice(0, 10);

  const billKey = (
    meterLabel: string | null | undefined,
    startYmd: string,
    endYmd: string
  ) =>
    `${(meterLabel ?? "").replace(/\s+/g, "").toUpperCase()}│${startYmd}│${endYmd}`;
  const seenKeys = new Set<string>();
  const skippedUnmatched: Array<{ idx: number; meter: string; address: string }> = [];

  const buckets = new Map<Parsed["vendor"], any[]>();
  Object.entries(approved)
    .filter(([, ok]) => !!ok)
    .map(([k]) => Number(k))
    .forEach((idx) => {
      const row = staged[idx];
      const vend = row?.vendor ?? "unknown";
      const e = edits[idx] ?? toEditable(parsed!.items[idx]);

      const chosenId =
        manualMatch[idx] && manualMatch[idx] !== "NULL"
          ? manualMatch[idx]
          : null;
      const autoId = row?.autoMatchBuildingId ?? null;
      const buildingId = chosenId || autoId || null;
      if (!buildingId) {
        skippedUnmatched.push({
          idx,
          meter: String(e.meter || ""),
          address: String(e.address || ""),
        });
        return;
      }

      const startYmd = toYmd(String(e.start || ""));
      const endYmd = toYmd(String(e.end || ""));
      const k = billKey(e.meter, startYmd, endYmd);
      if (seenKeys.has(k)) return;
      seenKeys.add(k);

      const payload = {
        buildingId,
        addressNormalized: row?.addrNorm || null,
        service_address: e.address || null,
        meter_no: e.meter || null,
        match_via: row?.autoMatchVia || "none",
        utility_provider: e.provider || vendorToProvider(vend) || null,
        period_start: startYmd,
        period_end: endYmd,
        total_cost: e.total ?? e.sectionTotal ?? null,
        demand_cost: e.demand ?? null,
        demand_charge_usd: e.demand ?? row.raw?.demand_cost ?? null,
        actual_demand_kw: row.raw?.actual_demand_kw ?? null,
        adjusted_demand_kw: row.raw?.adjusted_demand_kw ?? null,
        summer_peak_kw: row.raw?.summer_peak_kw ?? null,
        ratchet_kw: row.raw?.ratchet_kw ?? null,
        billing_demand_kw: row.raw?.billing_demand_kw ?? null,
        tariff_min_kw: row.raw?.tariff_min_kw ?? null,
        usage_kwh: e.kwh ?? null,
        usage_mcf: e.mcf ?? null,
        usage_mmbtu: e.mmbtu ?? null,
      };

      if (!buckets.has(vend)) buckets.set(vend, []);
      buckets.get(vend)!.push(payload);
    });

  if (!buckets.size) {
    if (skippedUnmatched.length) {
      const sample = skippedUnmatched
        .slice(0, 5)
        .map((x) => `#${x.idx} meter=${x.meter || "(none)"} address=${x.address || "(none)"}`)
        .join("\n");
      alert(
        `No matched approved items to ingest.\n\n` +
          `Skipped ${skippedUnmatched.length} approved item(s) with no building match.` +
          (sample ? `\n\nExamples:\n${sample}` : "")
      );
    } else {
      alert("No approved items to ingest.");
    }
    return;
  }

  setPosting(true);

  // ✅ NEW: accumulators for summary
  let totalInserted = 0;
  let totalUpdated = 0;

  try {
    for (const [vendor, items] of buckets) {
      const utility = vendorToUtility(vendor);

      console.log("Ingest payload items for", vendor, items);

      const res = await apiFetch("/api/ingest-bills", {
        method: "POST",
        body: JSON.stringify({
          orgId,
          utility,
          billUploadId: null,
          items,
          autoCreateMeter: true,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Ingest failed for ${vendor}: ${res.status} ${text}`);
      }

      // ✅ NEW: parse JSON and count updated vs new using notes[]
      let body: any = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }

      const resultArray: Array<{ notes?: string[] }> =
        (body && (body.results || body.data)) || [];

      if (Array.isArray(resultArray) && resultArray.length) {
        for (const r of resultArray) {
          const notes = r?.notes ?? [];
          const wasUpdated = notes.some((n) =>
            n.toLowerCase().includes("updated existing bill")
          );
          if (wasUpdated) {
            totalUpdated++;
          } else {
            totalInserted++;
          }
        }
      } else {
        // Fallback: if API doesn’t return structured results, assume all were new
        totalInserted += items.length;
      }
    }

    // ✅ NEW: friendly summary alert
    alert(
      `Ingest complete:
` +
        `??? ${totalInserted} new bill${totalInserted === 1 ? "" : "s"}
` +
        `??? ${totalUpdated} updated bill${totalUpdated === 1 ? "" : "s"}` +
        (skippedUnmatched.length
          ? `
??? ${skippedUnmatched.length} skipped (no building match)`
          : "")
    );
  } catch (e: any) {
    console.error(e);
    alert(e?.message || String(e));
  } finally {
    setPosting(false);
  }
}


  /* ---------------- Render ---------------- */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              OCR Bill Ingest
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Upload Evergy, Kansas Gas Service, or WoodRiver bills, match them
              to buildings and meters, and ingest them straight into your
              dashboard.
            </p>
          </div>

          {parsed && (
            <div className="flex flex-wrap gap-2 text-xs">
              
              <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                {parsed.items.length} item
                {parsed.items.length === 1 ? "" : "s"}
              </span>
              <span
  className={
    "inline-flex items-center rounded-full px-3 py-1 text-slate-700 text-xs font-medium " +
    (approvedCount === parsed.items.length
      ? "bg-emerald-100 text-emerald-700" // all approved → green
      : approvedCount > 0
      ? "bg-amber-100 text-amber-700" // some approved → amber
      : "bg-rose-100 text-rose-700" // none approved → red
    )
  }
>
  {approvedCount} auto-approved
</span>

            </div>
          )}
        </header>

        {/* Upload panel */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex-1">
              <label
                htmlFor="pdf-input"
                className="block text-xs font-medium text-slate-700"
              >
                Upload bill PDFs
              </label>
              <input
                id="pdf-input"
                type="file"
                accept="application/pdf"
                multiple
                className="mt-1 block w-full text-xs text-slate-700 file:mr-4 file:rounded-md file:border-0 file:bg-emerald-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-emerald-700 hover:file:bg-emerald-100"
                onChange={async (e) => {
                  const fl = e.target.files;
                  if (fl && fl.length > 0) {
                    await handleFiles(fl);
                  }
                }}
              />
              {busy && (
                <p className="mt-1 text-[11px] text-slate-500">
                  Parsing PDFs… this runs in your browser, so large batches can
                  take a moment.
                </p>
              )}
            </div>

            <div className="text-xs text-slate-500 sm:text-right">
              <p>
                Supports Evergy electric, Kansas Gas Service, and WoodRiver
                Energy PDFs.
              </p>
              <p>We&apos;ll pre-match by address and meter; you can override.</p>
            </div>
          </div>

          {err && (
            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {err}
            </div>
          )}

          {fileInfos.length > 0 && (
            <div className="mt-3 text-xs text-slate-600">
              <span className="font-medium">Files:</span>{" "}
              {fileInfos.map((f) => f.name).join(", ")} ({fileInfos.length})
            </div>
          )}

          {batchWarning && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {batchWarning}
            </div>
          )}
        </section>

  {/* Summary + Ingest */}
{parsed && (
  <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 space-y-4">
    {/* Top summary */}
    <div className="flex flex-wrap items-center gap-4 text-sm text-slate-700">
      <div>
        <span className="font-semibold">Detected vendor:</span>{" "}
        {parsed.vendor === "unknown" ? "Unknown" : parsed.vendor}
      </div>

      <div>
        <span className="font-semibold">Items:</span>{" "}
        {parsed.items.length}
      </div>

      <div
        className={
          "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium " +
          (approvedCount === parsed.items.length
            ? "bg-emerald-100 text-emerald-700"
            : approvedCount > 0
            ? "bg-amber-100 text-amber-700"
            : "bg-rose-100 text-rose-700")
        }
      >
        Auto-approved: {approvedCount} / {parsed.items.length}
      </div>
    </div>

    {/* Match breakdown */}
    <div className="text-sm text-slate-700 space-y-1">
      <p>
        <span className="font-semibold">Matched via meter:</span>{" "}
        {matchViaMeter}
      </p>
      <p>
        <span className="font-semibold">Matched via address:</span>{" "}
        {matchViaAddress}
      </p>
      <p>
        <span className="font-semibold">Unmatched:</span>{" "}
        {unmatched}
      </p>
    </div>

    {/* Ingest button */}
    <div>
      <button
        type="button"
        onClick={handleIngest}
        disabled={PARSER_QA_MODE || posting || !approvedCount}
        className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-emerald-700 disabled:bg-emerald-300 disabled:cursor-not-allowed"
      >
        {PARSER_QA_MODE
          ? "Ingest disabled (parser QA)"
          : posting
          ? "Ingesting…"
          : `Ingest ${approvedCount} approved`}
      </button>

      {needsReview > 0 && (
        <p className="mt-2 text-xs text-amber-700">
          {needsReview} item{needsReview === 1 ? "" : "s"} need review before ingest.
        </p>
      )}
    </div>
  </section>
)}


        {/* Review queue */}
        {parsed?.items?.length ? (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-sm font-semibold text-slate-900">
                Review & match bills
              </h2>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!parsed?.items?.length) return;
                    const all: Record<number, boolean> = {};
                    parsed.items.forEach((_it, i) => (all[i] = true));
                    setApproved(all);
                  }}
                  className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Approve all
                </button>
                <button
                  type="button"
                  onClick={() => setApproved({})}
                  className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Clear all
                </button>
                <span className="text-xs text-slate-600">
                  <span className="font-semibold">Approved:</span>{" "}
                  {approvedCount} / {parsed.items.length}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              {staged.map((row) => {
                const autoId = row.autoMatchBuildingId;
                const autoVia = row.autoMatchVia;
                const selected = manualMatch[row.idx] ?? null;
                const chosenId = selected || autoId || null;

                const chosenBuilding = chosenId
                  ? orgBuildings.find((b) => b.id === chosenId) ?? null
                  : null;
                const autoBuilding = autoId
                  ? orgBuildings.find((b) => b.id === autoId) ?? null
                  : null;

                const pillClasses =
                  autoVia === "none"
                    ? "bg-rose-50 text-rose-700 border border-rose-200"
                    : row.conf >= 7
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-amber-50 text-amber-800 border border-amber-200";

                const usage =
                  row.edit.kwh ?? row.edit.mcf ?? row.edit.mmbtu ?? "—";
                const money =
                  row.edit.total ?? row.edit.sectionTotal ?? "—";
                const demand =
                  row.edit.demand ??
                  (row as any).edit?.demand_cost ??
                  row.raw?.demand_cost ??
                  "—";

                return (
                  <div
                    key={row.idx}
                    className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    {/* Line 1: approve + context */}
                    <div className="flex flex-wrap items-center gap-3">
                      <input
                        type="checkbox"
                        checked={!!approved[row.idx]}
                        onChange={(e) =>
                          setApproved((prev) => ({
                            ...prev,
                            [row.idx]: e.target.checked,
                          }))
                        }
                        title="Approve for ingest"
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                      />
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${pillClasses}`}
                        title={
                          autoVia === "none"
                            ? "No automatic meter/address match"
                            : `Matched via ${autoVia}`
                        }
                      >
                        {autoVia === "none"
                          ? "no match"
                          : `matched via ${autoVia}`}
                      </span>

                      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
                        <span>{row.sourceFile}</span>
                        <span className="text-slate-400">•</span>
                        <span>
                          {row.edit.provider ||
                            vendorToProvider(row.vendor) ||
                            row.vendor.toUpperCase()}
                        </span>
                        {chosenBuilding ? (
                          <>
                            <span className="text-slate-400">•</span>
                            <span>{buildingLabel(chosenBuilding)}</span>
                          </>
                        ) : autoBuilding ? (
                          <>
                            <span className="text-slate-400">•</span>
                            <span>{buildingLabel(autoBuilding)}</span>
                          </>
                        ) : null}
                      </div>

                      <div
                        className="ml-auto inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] text-slate-700"
                        title="Heuristic signal; higher is better"
                      >
                        conf {row.conf}
                      </div>
                    </div>

                    {/* Line 2: quick glance */}
	                    <div className="text-xs text-slate-700">
                      <span className="font-semibold">
                        {row.edit.start || "—"} → {row.edit.end || "—"}
                      </span>{" "}
                      ·{" "}
                      <span className="font-semibold">
                        {row.edit.meter || "no meter"}
                      </span>{" "}
                      ·{" "}
                      <span className="font-semibold">{usage}</span> usage ·{" "}
                      <span className="font-semibold">{money}</span> total ·
                      {" "}
                      demand{" "}
	                      <span className="font-semibold">{demand}</span>
	                    </div>

	                    <pre className="overflow-x-auto rounded-lg bg-slate-900/95 p-2 text-[10px] leading-4 text-emerald-200">
{`existing:
  usage_kwh=${row.raw?.usage_kwh ?? "null"}
  demand_cost=${row.raw?.demand_cost ?? "null"}
  section_total_cost=${row.raw?.section_total_cost ?? "null"}
new:
  actual_demand_kw=${row.raw?.actual_demand_kw ?? "null"}
  adjusted_demand_kw=${row.raw?.adjusted_demand_kw ?? "null"}
  summer_peak_kw=${row.raw?.summer_peak_kw ?? "null"}
  ratchet_kw=${row.raw?.ratchet_kw ?? "null"}
  billing_demand_kw=${row.raw?.billing_demand_kw ?? "null"}
  tariff_min_kw=${row.raw?.tariff_min_kw ?? "null"}`}
	                    </pre>

	                    {/* Line 3: manual building match */}
                    <div className="grid max-w-3xl gap-3">
                      <label className="text-[11px] font-medium text-slate-700">
                        Manual building match
                        <select
                          value={manualMatch[row.idx] ?? ""}
                          onChange={(e) =>
                            setManualMatch((prev) => ({
                              ...prev,
                              [row.idx]: e.target.value || null,
                            }))
                          }
                          className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        >
                          <option value="">(none)</option>
                          {orgBuildings.map((b) => (
                            <option key={b.id} value={b.id}>
                              {buildingLabel(b)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p className="text-[11px] text-slate-500">
                        <span className="font-semibold">Chosen:</span>{" "}
                        {chosenBuilding ? (
                          buildingLabel(chosenBuilding)
                        ) : (
                          <i>none</i>
                        )}
                        {!chosenBuilding && autoBuilding ? (
                          <>
                            {" "}
                            (will use{" "}
                            <span className="font-semibold">
                              {buildingLabel(autoBuilding)}
                            </span>{" "}
                            if left blank)
                          </>
                        ) : null}
                      </p>
                    </div>

                    {/* Editable fields */}
                    <div className="grid gap-3">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <label className="text-[11px] font-medium text-slate-700">
                          Address
                          <input
                            value={row.edit.address}
                            onChange={(e) =>
                              setEdit(row.idx, {
                                address: e.target.value,
                              })
                            }
                            className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        </label>

                        <label className="text-[11px] font-medium text-slate-700">
                          Meter
                          <input
                            value={row.edit.meter}
                            onChange={(e) =>
                              setEdit(row.idx, { meter: e.target.value })
                            }
                            className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        </label>

                        <label className="text-[11px] font-medium text-slate-700">
                          Provider
                          <input
                            value={row.edit.provider ?? ""}
                            onChange={(e) =>
                              setEdit(row.idx, {
                                provider: e.target.value,
                              })
                            }
                            placeholder="Evergy, Kansas Gas Service…"
                            className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* Ingest controls */}
        {parsed?.items?.length ? (
          <section className="border-t border-slate-200 bg-slate-50/80 pt-3">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleIngest}
                disabled={PARSER_QA_MODE || posting || !approvedCount}
                className="inline-flex items-center rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-200"
              >
                {PARSER_QA_MODE
          ? "Ingest disabled (parser QA)"
          : posting
          ? "Ingesting…"
          : `Ingest ${approvedCount} approved`}
              </button>
              {needsReview > 0 && (
                <span className="text-xs text-amber-700">
                  {needsReview} item
                  {needsReview === 1 ? "" : "s"} need review before ingest.
                </span>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
