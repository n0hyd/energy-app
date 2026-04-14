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
    periods: Array<{ start: string|null; end: string|null }>;
    kwh: Array<number | null>;                    // from "Energy use kWh" row
    demandCost: Array<number | null>;             // from Charges "Demand ..." $
  };

  function parseMulti(): EvergyCols | null {
  const block = findCurrentChargesBlock();
  if (!block) return null;

  const lines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const num = (s: string) => parseFloat(s.replace(/,/g, ""));

  // ---- Rate codes (robust): optional colon; ignore "(See Definitions)"
  const rateTail =
    (page2 + "\n" + page3).match(/Rate\s*code(?:\s*\([^\)]+\))?\s*:?\s*([^\n]+)/i)?.[1]?.trim() || "";
  let rateCodes = [...rateTail.matchAll(/\b[A-Z0-9]{3,}\b/g)].map(m => m[0]);

  // ---- Meter(s): use only the part of the line BEFORE "Rate code"
  // This avoids accidentally treating the rate token (e.g., WSEIS) as a meter.
  const meterLineRaw = lines.find(l => /\bMeter\b/i.test(l)) || "";
  const meterLeft = meterLineRaw.split(/\bRate\s*code\b/i)[0] || meterLineRaw;
  const meterTokensInGrid = meterLeft
    .split(/\s+/)
    .map(t => t.replace(/[^\w-]/g, ""))     // strip glyphs/colons
    .filter(Boolean)
    .filter(tok => /^[0-9][0-9\-]{5,}$/.test(tok)); // numeric/hyphen tokens only

  // ---- kWh (robust): normalize glyphs; require "Energy use" + "kWh" on same line; pick largest number on that line
let kwhVals: number[] = [];
{
  // Normalize private-use and odd spacing; collapse k•W•h -> kWh
  const normLines = lines.map(l => l
    .replace(/[\u00A0\u2000-\u200B\uE000-\uF8FF]/g, " ")
    .replace(/k\W*w\W*h/gi, "kWh")
    .replace(/[ \t]+/g, " ")
    .trim()
  );

  // Find the exact line with both "Energy use" and "kWh"
  const kwhIdx = normLines.findIndex(l => /Energy\s+use\b.*\bkWh\b/i.test(l));
  if (kwhIdx >= 0) {
    const nums = [...lines[kwhIdx].matchAll(/([0-9][\d,]*(?:\.\d+)?)/g)].map(m => num(m[1]));
    if (nums.length) {
      const biggest = Math.max(...nums);
      kwhVals = [biggest];
    }
  }

  // Secondary: allow "Energy use" followed by a number soon after (still avoids grabbing Charges)
  if (kwhVals.length === 0) {
    const m = block
      .replace(/[\u00A0\u2000-\u200B\uE000-\uF8FF]/g, " ")
      .match(/Energy\s+use[\s\S]{0,80}?([0-9][\d,]*(?:\.\d+)?)/i);
    if (m) kwhVals = [num(m[1])];
  }

  // Fallback: compute from Present/Previous/Multiplier
  if (kwhVals.length === 0) {
    const pres = block.match(/Present\s+meter\s+read[^\n]*?([0-9][0-9,]*(?:\.\d+)?)/i);
    const prev = block.match(/Previous\s+meter\s+read[^\n]*?([0-9][0-9,]*(?:\.\d+)?)/i);
    const mult = block.match(/Billing\s+multiplier[^\n]*?([0-9][0-9,]*(?:\.\d+)?)/i);
    if (pres && prev) {
      kwhVals = [Math.max(0, (num(pres[1]) - num(prev[1])) * (mult ? num(mult[1]) : 1))];
    }
  }
}


  // ---- Column count: prefer rate codes, else meters/kWh counts
  const N = Math.max(rateCodes.length || 0, meterTokensInGrid.length || 0, kwhVals.length || 0, 1);
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
      if (m?.[1]) { found = m[1].replace(/[^\w-]/g, ""); break; }
    }
    meters = Array(N).fill(found || "");
  } else {
    while (meters.length < N) meters.push("");
    if (meters.length > N) meters = meters.slice(-N);
  }

  // ---- Periods: try in-grid; else banner on p1/p2
  const perLine = lines.find(l => /\bBilling\s+period\b/i.test(l)) || "";
  const inGridPairs = [...perLine.matchAll(/(\d{1,2}\/\d{1,2}\/\d{2,4})\s*[–—-]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/g)];
  const bannerPer =
    page1.match(/\bBilling\s+period\s*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s*[–—-]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i) ||
    page2.match(/\bBilling\s+period\s*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s*[–—-]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  const periods = Array.from({ length: N }, () => ({ start: null as string | null, end: null as string | null }));
  if (inGridPairs.length) {
    const lastN = inGridPairs.slice(-N);
    for (let i = 0; i < N; i++) {
      const p = lastN[i - (N - lastN.length)] || null;
      if (p) periods[i] = { start: p[1], end: p[2] };
    }
  } else if (bannerPer) {
    for (let i = 0; i < N; i++) periods[i] = { start: bannerPer[1], end: bannerPer[2] };
  }

  // ---- kWh aligned to N
  const kwh = Array.from({ length: N }, (_, i) => kwhVals[i] ?? null);

  // ---- Demand $: from Charges line that STARTS with "Demand" (ignore any kW lines)
  const chargesIdx = lines.findIndex(l => /^Charges\b/i.test(l));
  const chargesLines = chargesIdx >= 0 ? lines.slice(chargesIdx) : lines;
  const demandRow = chargesLines.find(l => /^Demand\b/i.test(l) && !/\bk\W*w\b/i.test(l));
  const demandNums = demandRow ? [...demandRow.matchAll(/([0-9][\d,]*\.\d{2})/g)].map(m => num(m[1])) : [];
  const demandCost = Array.from({ length: N }, () => null as number | null);
  if (demandNums.length) demandCost[0] = demandNums[0];

  hints.push(
    `evergy: N=${N} rates=[${rateCodes.join(", ")}] meters=[${meters.join("|")}] kwh=[${kwh.map(v => v ?? "null").join("|")}]`
  );

  return { rateCodes, meters, periods, kwh, demandCost };
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
    const i = pickIndex(cols);
    meter_no    = cols.meters[i] || null;
    usage_kwh   = cols.kwh[i] ?? null;
    demand_cost = cols.demandCost[i] ?? null;

    if (cols.periods[i]) {
      period_start = cols.periods[i].start;
      period_end   = cols.periods[i].end;
    }

    hints.push(`evergy: pick idx=${i} rate=${cols.rateCodes[i]} meter=${meter_no ?? "?"} kWh=${usage_kwh ?? "?"} demand$=${demand_cost ?? "null"}`);
  }

  // Last-resort period from banner if still missing
  if (!period_start || !period_end) {
    const perBanner =
      page1.match(/\bBilling\s+period\s*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s*[–—-]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i) ||
      page2.match(/\bBilling\s+period\s*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s*[–—-]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
    if (perBanner) { period_start = perBanner[1]; period_end = perBanner[2]; }
  }

  const electricItem: Item = {
    service_address,
    meter_no,
    period_start,
    period_end,
    usage_kwh,
    section_total_cost: null,
    total_cost,
    demand_cost,
    hints,
  };
  items.push(electricItem);

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
    const capped = files.slice(0, 12);
    setBatchWarning(files.length > 12 ? `Selected ${files.length}. Processing first 12 files.` : null);

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
        (addrNorm && addressIndex.get(addrNorm)) || (key && addressIndex.get(key)) || null;

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

  function setEdit(idx: number, patch: Partial<ReturnType<typeof toEditable>>) {
    setEdits((prev) => ({ ...prev, [idx]: { ...(prev[idx] ?? toEditable(parsed!.items[idx])), ...patch } }));
  }

  const approvedCount = Object.values(approved).filter(Boolean).length;
  const needsReview = (parsed?.items?.length ?? 0) - approvedCount;

  async function handleIngest() {
    if (!orgId) throw new Error("Missing orgId (no membership found)");
    if (!parsed?.items?.length) throw new Error("Nothing to ingest yet");

    const toYmd = (d: string) =>
      /^\d{2}-\d{2}-\d{2}$/.test(d)
        ? (() => {
            const [mm, dd, yy] = d.split("-");
            return `20${yy}-${mm}-${dd}`;
          })()
        : String(d).slice(0, 10);

    const billKey = (meterLabel: string | null | undefined, startYmd: string, endYmd: string) =>
      `${(meterLabel ?? "").replace(/\s+/g, "").toUpperCase()}│${startYmd}│${endYmd}`;
    const seenKeys = new Set<string>();

    const buckets = new Map<Parsed["vendor"], any[]>();
    Object.entries(approved)
      .filter(([, ok]) => !!ok)
      .map(([k]) => Number(k))
      .forEach((idx) => {
        const row = staged[idx];
        const vend = row?.vendor ?? "unknown";
        const e = edits[idx] ?? toEditable(parsed!.items[idx]);

        const chosenId = (manualMatch[idx] && manualMatch[idx] !== "NULL") ? manualMatch[idx] : null;
        const autoId = row?.autoMatchBuildingId ?? null;
        const buildingId = chosenId || autoId || null;

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
          utility_provider: (e.provider || vendorToProvider(vend) || null),
          period_start: startYmd,
          period_end: endYmd,
          total_cost: e.total ?? e.sectionTotal ?? null,
          demand_cost: e.demand ?? null,
          usage_kwh: e.kwh ?? null,
          usage_mcf: e.mcf ?? null,
          usage_mmbtu: e.mmbtu ?? null,
        };

        if (!buckets.has(vend)) buckets.set(vend, []);
        buckets.get(vend)!.push(payload);
      });

    setPosting(true);
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
      }
      alert(`Ingested ${approvedCount} item(s) across ${buckets.size} vendor group(s).`);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || String(e));
    } finally {
      setPosting(false);
    }
  }

  /* ---------------- Render ---------------- */
  if (loading) return <p>Loading…</p>;

  return (
    <div style={{ padding: 20, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, marginBottom: 12 }}>
        OCR Test (Multi-PDF, Electric + Gas) — Review, Match & Ingest
      </h1>

      <div
        style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}
      >
        <input
          id="pdf-input"
          type="file"
          accept="application/pdf"
          multiple
          onChange={async (e) => {
            const fl = e.target.files;
            if (fl && fl.length > 0) {
              await handleFiles(fl);
            }
          }}
        />
        {err && <span style={{ color: "crimson" }}>{err}</span>}
      </div>

      {fileInfos.length > 0 && (
        <div style={{ marginBottom: 10, fontSize: 12, color: "#374151" }}>
          <b>Files:</b> {fileInfos.map((f) => f.name).join(", ")} ({fileInfos.length})
        </div>
      )}
      {batchWarning && (
        <div
          style={{
            marginBottom: 10,
            fontSize: 12,
            color: "#92400e",
            background: "#fff7ed",
            border: "1px solid #fed7aa",
            padding: 8,
            borderRadius: 8,
          }}
        >
          {batchWarning}
        </div>
      )}

      {/* ---------- Summary ---------- */}
      {parsed && (
        <div style={{ display: "grid", gap: 12 } as any}>
          <div style={{ fontSize: 13, color: "#374151" }}>
            <b>Detected vendor:</b> {parsed.vendor} &nbsp;·&nbsp;{" "}
            <b>Items:</b> {parsed.items.length} &nbsp;·&nbsp;{" "}
            <b>Auto-approved:</b> {Object.values(approved).filter(Boolean).length} / {parsed.items.length}
          </div>
        </div>
      )}

      {/* ---------- Review Queue (Tightened) ---------- */}
      {parsed?.items?.length ? (
        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={() => {
                const all: Record<number, boolean> = {};
                parsed.items.forEach((_it, i) => (all[i] = true));
                setApproved(all);
              }}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #ccc", background: "white" }}
            >
              Approve all
            </button>
            <button
              onClick={() => setApproved({})}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #ccc", background: "white" }}
            >
              Clear all
            </button>
            <div style={{ marginLeft: "auto", fontSize: 12, color: "#374151" }}>
              <b>Approved:</b> {approvedCount} / {parsed.items.length}
            </div>
          </div>

          {staged.map((row) => {
            const autoId = row.autoMatchBuildingId;
            const autoVia = row.autoMatchVia;
            const selected = manualMatch[row.idx] ?? null;
            const chosenId = selected || autoId || null;

            const chosenBuilding =
              chosenId ? orgBuildings.find((b) => b.id === chosenId) ?? null : null;
            const autoBuilding =
              autoId ? orgBuildings.find((b) => b.id === autoId) ?? null : null;

            // pill color: red if no match; else green if conf >= 7; else yellow
            const pillSty =
              autoVia === "none"
                ? { bg: "#fef2f2", bd: "#fecaca", fg: "#991b1b" }
                : row.conf >= 7
                ? { bg: "#ecfdf5", bd: "#a7f3d0", fg: "#065f46" }
                : { bg: "#fffbeb", bd: "#fde68a", fg: "#92400e" };

            const usage =
              row.edit.kwh ?? row.edit.mcf ?? row.edit.mmbtu ?? "—";
            const money = row.edit.total ?? row.edit.sectionTotal ?? "—";
	    const demand = row.edit.demand ?? row.edit.demand_cost ?? row.item?.demand_cost ?? "—";

            return (
              <div
                key={row.idx}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  padding: 12,
                  display: "grid",
                  gap: 8,
                }}
              >
                {/* Line 1: approve + matched via + bold context */}
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    type="checkbox"
                    checked={!!approved[row.idx]}
                    onChange={(e) =>
                      setApproved((prev) => ({ ...prev, [row.idx]: e.target.checked }))
                    }
                    title="Approve for ingest"
                  />
                  <span
                    style={{
                      fontSize: 11,
                      background: pillSty.bg,
                      border: `1px solid ${pillSty.bd}`,
                      color: pillSty.fg,
                      padding: "2px 8px",
                      borderRadius: 999,
                    }}
                    title={autoVia === "none" ? "No automatic meter/address match" : `Matched via ${autoVia}`}
                  >
                    {autoVia === "none" ? "no match" : `matched via ${autoVia}`}
                  </span>

                  <div style={{ fontWeight: 700, fontSize: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <span>{row.sourceFile}</span>
                    <span>• {row.edit.provider || (vendorToProvider(row.vendor) ?? row.vendor.toUpperCase())}</span>
                    {chosenBuilding ? (
                      <span>
                        • {buildingLabel(chosenBuilding)}
                      </span>
                    ) : autoBuilding ? (
                      <span>
                        • {buildingLabel(autoBuilding)}
                      </span>
                    ) : null}
                  </div>

                  <div
                    style={{
                      marginLeft: "auto",
                      fontSize: 11,
                      background: "#f3f4f6",
                      padding: "2px 8px",
                      borderRadius: 999,
                    }}
                    title="Heuristic signal; higher is better"
                  >
                    conf {row.conf}
                  </div>
                </div>

                {/* Line 2: matched fields quick glance */}
                <div style={{ fontSize: 12, color: "#374151" }}>
                  <b>
                    {row.edit.start || "—"} → {row.edit.end || "—"}
                  </b>{" "}
                  · <b>{row.edit.meter || "no meter"}</b> · <b>{usage}</b> usage · <b>{money}</b> total · demand <b>{demand}</b>

                </div>

                {/* Line 3: manual building match select */}
                <div style={{ display: "grid", gap: 6, maxWidth: 640 }}>
                  <label style={{ fontSize: 12 }}>
                    Manual building match
                    <select
                      value={manualMatch[row.idx] ?? ""}
                      onChange={(e) =>
                        setManualMatch((prev) => ({
                          ...prev,
                          [row.idx]: e.target.value || null,
                        }))
                      }
                      style={{
                        width: "100%",
                        border: "1px solid #e5e7eb",
                        borderRadius: 8,
                        padding: "6px 8px",
                        fontSize: 13,
                        marginTop: 4,
                      }}
                    >
                      <option value="">(none)</option>
                      {orgBuildings.map((b) => (
                        <option key={b.id} value={b.id}>
                          {buildingLabel(b)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div style={{ fontSize: 12, color: "#374151" }}>
                    <b>Chosen:</b>{" "}
                    {chosenBuilding ? buildingLabel(chosenBuilding) : <i>none</i>}
                    {!chosenBuilding && autoBuilding ? (
                      <>
                        {" "}
                        (will use <b>{buildingLabel(autoBuilding)}</b> if left blank)
                      </>
                    ) : null}
                  </div>
                </div>

                {/* Editable fields (kept) */}
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ display: "grid", gap: 6, gridTemplateColumns: "1fr 220px 220px" }}>
                    <label style={{ fontSize: 12 }}>
                      Address
                      <input
                        value={row.edit.address}
                        onChange={(e) => setEdit(row.idx, { address: e.target.value })}
                        style={{
                          width: "100%",
                          border: "1px solid #e5e7eb",
                          borderRadius: 8,
                          padding: "6px 8px",
                          fontSize: 13,
                          marginTop: 4,
                        }}
                      />
                    </label>

                    <label style={{ fontSize: 12 }}>
                      Meter
                      <input
                        value={row.edit.meter}
                        onChange={(e) => setEdit(row.idx, { meter: e.target.value })}
                        style={{
                          width: "100%",
                          border: "1px solid #e5e7eb",
                          borderRadius: 8,
                          padding: "6px 8px",
                          fontSize: 13,
                          marginTop: 4,
                        }}
                      />
                    </label>

                    <label style={{ fontSize: 12 }}>
                      Provider
                      <input
                        value={row.edit.provider ?? ""}
                        onChange={(e) => setEdit(row.idx, { provider: e.target.value })}
                        placeholder="Evergy, Kansas Gas Service…"
                        style={{
                          width: "100%",
                          border: "1px solid #e5e7eb",
                          borderRadius: 8,
                          padding: "6px 8px",
                          fontSize: 13,
                          marginTop: 4,
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* ---------- Ingest controls ---------- */}
      {parsed?.items?.length ? (
        <div style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => handleIngest()}
            disabled={posting || !approvedCount}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #ccc",
              background: approvedCount ? "#10b981" : "#f3f3f3",
              color: approvedCount ? "white" : "#777",
              cursor: posting || !approvedCount ? "not-allowed" : "pointer",
            }}
          >
            {posting ? "Ingesting…" : `Ingest ${approvedCount} approved`}
          </button>
          {needsReview > 0 && (
            <span style={{ fontSize: 12, color: "#92400e" }}>
              {needsReview} item(s) need review before ingest.
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}
