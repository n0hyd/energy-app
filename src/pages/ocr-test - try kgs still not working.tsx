// src/pages/ocr-test.tsx
import { useCallback, useMemo, useState, useEffect } from "react";
import * as pdfjsLib from "pdfjs-dist/build/pdf.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
import { supabase } from "@/lib/supabaseClient";
import { useAuthGate } from "@/hooks/useAuthGate";

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

/* ---------- Partial match key (house # + first 5 of first non-directional word) ---------- */
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
  };
}

/* ---------------- PDF text extraction ---------------- */
async function extractPdfText(file: File): Promise<string> {
  const data = await file.arrayBuffer();
  const task = pdfjsLib.getDocument({ data });
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

  return pageTexts.map((t, i) => `--- PAGE ${i + 1} ---\n${t}`).join("\n");
}

/* ---------------- Evergy (Electric) Parser ---------------- */
function parseEvergy(text: string): Parsed {
  const hints: string[] = [];
  const items: Item[] = [];

  const page1 = text.match(/--- PAGE 1 ---([\s\S]*?)(?=--- PAGE 2 ---|$)/i)?.[1] || "";
  const page2 = text.match(/--- PAGE 2 ---([\s\S]*?)(?=--- PAGE 3 ---|$)/i)?.[1] || "";

  const svc = page1.match(/Service\s+location:\s*(.+)$/im) || text.match(/Service\s+location:\s*(.+)$/im);
  const service_address = svc ? cleanAddressRaw(svc[1]) : null;
  if (service_address) hints.push(`Evergy addr → "${service_address}"`);

  const per = text.match(/Billing\s+period:\s*(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/i);
  const period_start = per ? per[1] : null;
  const period_end = per ? per[2] : null;
  if (period_start && period_end) hints.push(`Evergy period ${period_start} → ${period_end}`);

  let total_cost: number | null = null;
  const normalized = text.replace(/[\uE000-\uF8FF]/g, "$").replace(/[ \t]+/g, " ");
  let totalCostMatch =
    normalized.match(/Total\s+(?:to\s+be\s+drafted|due\s+by)[\s\S]{0,120}?\$?\s*([\d][\d,]*\.\d{2})/i) ||
    normalized.match(/Total\s+to\s+be\s+drafted[\s\S]{0,120}?\$?\s*([\d][\d,]*\.\d{2})/i) ||
    normalized.match(/Total\s+due\s+by[\s\S]{0,120}?\$?\s*([\d][\d,]*\.\d{2})/i);
  if (totalCostMatch) total_cost = parseFloat(totalCostMatch[1].replace(/,/g, ""));

  let meter_no: string | null = null;
  {
    const m = page2.match(/\bMeter\b[^\n]*?:\s*([A-Za-z0-9\-]+)/i);
    meter_no = m ? m[1] : null;
  }
  if (meter_no) hints.push(`Evergy meter (p2) → ${meter_no}`);

  let demand_cost: number | null = null;
  const dIdx = page2.search(/\bDemand\b/i);
  const bmIdx = page2.search(/Billing\s+Multiplier/i);
  if (dIdx !== -1 && bmIdx !== -1 && bmIdx > dIdx) {
    const between = page2.slice(dIdx, bmIdx);
    const money = between.match(/([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d{2}))/);
    if (money?.[1]) demand_cost = num(money[1]);
  }
  if (demand_cost == null) {
    const alt = page2.match(/\bDemand\b[^\$]{0,30}\$?\s*([0-9,]+\.\d{2})/i);
    if (alt?.[1]) demand_cost = num(alt[1]);
  }
  if (demand_cost != null) hints.push(`Evergy demand $ (p2) → ${demand_cost}`);

  const kwh2 = page2.match(/\bEnergy\s+use\s+kWh\b[^\d]*([\d,]+(?:\.\d+)?)/i);
  const usage_kwh = kwh2 ? num(kwh2[1]) : null;
  if (usage_kwh != null) hints.push(`Evergy kWh (p2) → ${usage_kwh}`);

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
  // Normalize odd currency glyphs to plain "$" so regex is stable.
const normalized = pageText.replace(/[\uFF04\uFE69\uFDFC\uF0A4]/g, "$");
const lines = normalized.split(/\r?\n/);

  const page2 = text.match(/--- PAGE 2 ---([\s\S]*?)(?=--- PAGE 3 ---|$)/i)?.[1] || "";
  
  type MeterRow = { idx: number; meter: string; start: string; end: string };
  const meterRows: MeterRow[] = [];
  for (let i = 0; i < lines.length; i++) {
    const row = lines[i];
    const m = row.match(/([A-Z0-9]{8,14})\s+(\d{2}-\d{2}-\d{2})\s+(\d{2}-\d{2}-\d{2})/i);
    if (m) meterRows.push({ idx: i, meter: m[1], start: m[2], end: m[3] });
  }

  const getMoney = (s: string): number | null => {
    const m = s.match(/([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d{2}))/);
    return m ? num(m[1]) : null;
  };
  const normAddr = (s?: string | null) => (s ? cleanAddressRaw(s) : null);

  for (let i = 0; i < meterRows.length; i++) {
    const cur = meterRows[i];
    const nextIdx = i + 1 < meterRows.length ? meterRows[i + 1].idx : lines.length;

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

let section_total_cost: number | null = null;

for (let j = cur.idx; j < nextIdx; j++) {
  if (/Current\s+Charges/i.test(lines[j])) {
    // Include this line + next two (accounts for wrap/justification)
    const neighborhood = [lines[j], lines[j + 1] ?? "", lines[j + 2] ?? ""]
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    // Require a currency symbol immediately before the number
    // (now all odd glyphs were normalized to "$" in step A).
    const moneyMatches = [...neighborhood.matchAll(
      /\$(\d{1,3}(?:,\d{3})*\.\d{2})/g
    )];

    if (moneyMatches.length) {
      const lastAmt = moneyMatches[moneyMatches.length - 1][1];
      section_total_cost = parseFloat(lastAmt.replace(/,/g, ""));
    }
    break; // we found the Current Charges line, no need to continue
  }
}


    let usage_mcf: number | null = null;
    for (let j = cur.idx; j < nextIdx; j++) {
      if (/\bCONSTANT\b/i.test(lines[j])) {
        let k = j + 1;
        while (k < nextIdx && /^\s*$/.test(lines[k])) k++;
        if (k < nextIdx) {
          const nums = [...lines[k].matchAll(/([0-9]+(?:\.[0-9]+)?)/g)].map((x) => x[1]);
          if (nums.length >= 3) {
            const third = num(nums[2]);
            if (third != null) usage_mcf = normalizeMcf(third);
          }
        }
        break;
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

  const pageTotal = page2.match(/Total\s+Current\s+Charges\s*\$?\s*([0-9,]+\.\d{2})/i);
  const topTotal = pageTotal ? num(pageTotal[1]) : null;

  if (topTotal != null) hints.push(`KGS page total → ${topTotal}`);

  return {
    vendor: "kgs",
    period: {},
    usage_kwh: null,
    total_cost: topTotal,
    demand_cost: null,
    service_address: null,
    meter_no: null,
    items: dedupeAndMerge(postProcessItems(items)),
    hints: [...hints, `KGS sections parsed: ${items.length}`],
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
      hints.push(`WoodRiver production month → ${pm[1]} ${y} (${period_start} → ${period_end})`);
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
    return ms.length ? num(ms[ms.length - 1][1]) : null;
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
        if (acctIdx !== -1) {
          acctTail = lines[acctIdx].match(/Acct\/?\s*Meter\s*:?\s*(.+)$/i)?.[1] ?? "";
        }
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
        if (nums.length) usage_mmbtu = num(nums[0]);
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
      hints: [
        `WoodRiver addr → "${service_address}"`,
        meter_no ? `WoodRiver meter (after "/") → ${meter_no}` : "WoodRiver meter → (none)",
        usage_mmbtu != null ? `WoodRiver MMBtu (Fixed FOM) → ${usage_mmbtu}` : "WoodRiver MMBtu → (none)",
        section_total_cost != null ? `WoodRiver $ → ${section_total_cost}` : "WoodRiver $ → (none)",
      ],
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
    hints: [...hints, `WoodRiver sections parsed: ${items.length}`],
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

/* ---------------- UI (multi-file) ---------------- */
export default function OcrTestPage() {
  const { loading } = useAuthGate(true);

  const [fileInfos, setFileInfos] = useState<Array<{ name: string; size: number }>>([]);
  const [batchWarning, setBatchWarning] = useState<string | null>(null);
  const [pdfText, setPdfText] = useState<string>("");
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

  // Load org buildings — add `name` so we can show "Stone Creek Elementary" in the manual picker
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

  // Build a friendly label for selects
  const buildingLabel = useCallback((b: { name: string | null; address: string | null; city: string | null; state: string | null }) => {
    const parts = [];
    if (b.name) parts.push(b.name);
    const addr = [b.address, b.city, b.state].filter(Boolean).join(", ");
    if (addr) parts.push(addr);
    return parts.join(" • ");
  }, []);

  // Fast lookup for auto-matching
  const buildingIndex = useMemo(() => {
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
    return map;
  }, [orgBuildings]);

  // Manual overrides for building selection per row
  const [manualMatch, setManualMatch] = useState<Record<number, string | null>>({});
  useEffect(() => {
    // reset manual matches when the parsed set changes
    const init: Record<number, string | null> = {};
    (parsed?.items ?? []).forEach((_it, idx) => {
      init[idx] = null; // don't pre-fill; force explicit choice when needed
    });
    setManualMatch(init);
  }, [parsed?.items?.length]);

  // optional single-file helper (kept for quick tests)
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

  // MULTI-FILE (cap 12) — keep every row; no cross-file dedupe/merge
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

  const handleParseText = useCallback(() => {
    setErr(null);
    setBusy(true);
    try {
      const out = parseAuto(pdfText || "");
      const itemsWithSource = out.items.map((it) => ({ ...it, __sourceFile: "(pasted)", __vendor: out.vendor }));
      setParsed({
        vendor: out.vendor,
        period: {},
        usage_kwh: null,
        total_cost: null,
        demand_cost: null,
        service_address: null,
        meter_no: null,
        items: itemsWithSource,
        hints: out.hints ?? [],
      });
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }, [pdfText]);

  // recompute approvals/edits when parse changes
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
      nextEdits[idx] = toEditable(it);
    });
    setApproved(nextApproved);
    setEdits(nextEdits);
  }, [parsed]);

  const staged = useMemo(() => {
    if (!parsed?.items?.length) return [];
    return parsed.items.map((it, idx) => {
      const edit = edits[idx] ?? toEditable(it);
      const addrNorm = uspsNormalizeAddress(edit.address);
      const key = addrMatchKey(edit.address);
      const matchBuildingId =
        (addrNorm && buildingIndex.get(addrNorm)) || (key && buildingIndex.get(key)) || null;
      return {
        idx,
        conf: confidenceForItem(it),
        vendor: (it.__vendor ?? parsed.vendor) as Parsed["vendor"],
        sourceFile: it.__sourceFile ?? "—",
        edit,
        raw: it,
        addrNorm,
        matchBuildingId,
      };
    });
  }, [parsed, edits, buildingIndex]);

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
        const vend = staged[idx]?.vendor ?? "unknown";
        const e = edits[idx] ?? toEditable(parsed!.items[idx]);

        // ⬇️ NEW: manual building override FIRST
        const chosenId = (manualMatch[idx] && manualMatch[idx] !== "NULL") ? manualMatch[idx] : null;

        const normAddr = uspsNormalizeAddress(e.address || "");
        const autoByAddr =
          (normAddr && buildingIndex.get(normAddr)) ||
          (addrMatchKey(e.address || "") && buildingIndex.get(addrMatchKey(e.address || ""))) ||
          null;

        const buildingId = chosenId || autoByAddr || null;

        // --- de-dupe check BEFORE pushing to buckets ---
const startYmd = toYmd(String(e.start || ""));
const endYmd   = toYmd(String(e.end  || ""));
const k = billKey(e.meter, startYmd, endYmd);
if (seenKeys.has(k)) {
  // already queued this exact bill in this client run — skip it
  return;
}
seenKeys.add(k);

// proceed to build the payload and push
const payload = {
  buildingId,
  addressNormalized: normAddr || null,
  service_address: e.address || null,
  meter_no: e.meter || null,
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

    const vendorToUtility = (v: Parsed["vendor"]): "electric" | "gas" => (v === "evergy" ? "electric" : "gas");

    setPosting(true);
    try {
      for (const [vendor, items] of buckets) {
        const utility = vendorToUtility(vendor);
        const res = await fetch("/api/ingest-bills", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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

  if (loading) return <p>Loading…</p>;

  return (
    <div style={{ padding: 20, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, marginBottom: 12 }}>
        OCR Test (Multi-PDF, Electric + Gas) — with Review & Ingest
      </h1>

      {/* Multi-file input (cap 12) */}
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
        <button
          onClick={handleParseText}
          disabled={busy}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #ccc",
            background: busy ? "#f3f3f3" : "white",
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "Parsing…" : "Parse text input only"}
        </button>
        {err && <span style={{ color: "crimson" }}>{err}</span>}
      </div>

      {/* Selected files summary */}
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

      {/* Manual text paste stays for debugging */}
      <textarea
        value={pdfText}
        onChange={(e) => setPdfText(e.target.value)}
        placeholder="Paste PDF text here (if PDF parsing isn't set up yet)…"
        style={{
          width: "100%",
          height: 180,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 12,
          padding: 10,
          borderRadius: 8,
          border: "1px solid #ddd",
          marginBottom: 12,
          whiteSpace: "pre",
          overflow: "auto",
        }}
      />

      {parsed && (
        <div style={{ display: "grid, gap: 12" as any }}>
          {/* Top-level summary */}
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: 12,
              background: "#fafafa",
              marginBottom: 12,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Batch Summary</div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <div>Items: {parsed.items.length}</div>
              <div>
                Vendors in batch:{" "}
                {[...new Set(parsed.items.map((i) => i.__vendor ?? parsed.vendor))].join(", ") || "—"}
              </div>
            </div>
          </div>

          {/* Review table */}
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: 12,
              overflow: "auto",
            }}
          >
            <div
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}
            >
              <div style={{ fontWeight: 600 }}>Items</div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>
                <strong>{approvedCount}</strong> ready • <strong>{needsReview}</strong> need review
              </div>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 1380 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: "6px 4px" }}>
                    <input
                      type="checkbox"
                      checked={approvedCount === parsed.items.length && parsed.items.length > 0}
                      onChange={(e) => {
                        const val = e.target.checked;
                        const next: Record<number, boolean> = {};
                        parsed.items.forEach((_, i) => (next[i] = val));
                        setApproved(next);
                      }}
                      title="Approve all"
                    />
                  </th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: "6px 4px" }}>#</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: "6px 4px" }}>File</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: "6px 4px" }}>Vendor</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: "6px 4px" }}>Conf</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: "6px 4px" }}>Address</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: "6px 4px" }}>Norm</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: "6px 4px" }}>Match</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: "6px 4px" }}>Meter</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #eee", padding: "6px 4px" }}>Period</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #eee", padding: "6px 4px" }}>kWh</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #eee", padding: "6px 4px" }}>MCF</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #eee", padding: "6px 4px" }}>MMBtu</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #eee", padding: "6px 4px" }}>Section $</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #eee", padding: "6px 4px" }}>Total $</th>
                  <th style={{ textAlign: "right", borderBottom: "1px solid #eee", padding: "6px 4px" }}>Demand $</th>
                </tr>
              </thead>
              <tbody>
                {staged.map((r) => {
                  const e = r.edit;
                  const badConf = r.conf < 7;
                  const autoMatched = !!r.matchBuildingId;
                  const matchBadge = autoMatched
                    ? { bg: "#e8f5e9", text: "Matched", title: r.matchBuildingId! }
                    : { bg: "#fff3e0", text: "No match", title: "No building match" };
                  return (
                    <tr key={r.idx} style={{ background: badConf ? "#fff9f0" : undefined }}>
                      <td style={{ padding: "6px 4px" }}>
                        <input
                          type="checkbox"
                          checked={!!approved[r.idx]}
                          onChange={(ev) => setApproved((prev) => ({ ...prev, [r.idx]: ev.target.checked }))}
                          title={badConf ? "Low confidence—double-check before approving" : "Approve this item"}
                        />
                      </td>
                      <td style={{ padding: "6px 4px" }}>{r.idx + 1}</td>
                      <td
                        style={{
                          padding: "6px 4px",
                          maxWidth: 220,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {r.sourceFile}
                      </td>
                      <td style={{ padding: "6px 4px" }}>{r.vendor}</td>
                      <td style={{ padding: "6px 4px" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 6px",
                            borderRadius: 999,
                            fontSize: 12,
                            background: r.conf >= 9 ? "#e8f5e9" : r.conf >= 7 ? "#f1f8e9" : "#fff3e0",
                            border: "1px solid #e5e7eb",
                          }}
                          title={`Confidence = ${r.conf}/10`}
                        >
                          {r.conf}/10
                        </span>
                      </td>
                      <td style={{ padding: "6px 4px", minWidth: 220 }}>
                        <input
                          value={e.address}
                          onChange={(ev) => setEdit(r.idx, { address: ev.target.value })}
                          style={{ width: "100%", padding: 6, borderRadius: 6, border: "1px solid #ddd" }}
                        />
                      </td>
                      <td
                        style={{
                          padding: "6px 4px",
                          minWidth: 200,
                          fontFamily: "ui-monospace, monospace",
                          fontSize: 12,
                        }}
                      >
                        {r.addrNorm || "—"}
                      </td>
                      <td style={{ padding: "6px 4px", minWidth: 260 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span
                            title={matchBadge.title}
                            style={{
                              display: "inline-block",
                              padding: "2px 6px",
                              borderRadius: 999,
                              border: "1px solid #e5e7eb",
                              background: matchBadge.bg,
                              fontSize: 12,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {matchBadge.text}
                          </span>
                          {/* NEW: Manual building chooser */}
                          <select
                            value={manualMatch[r.idx] ?? "NULL"}
                            onChange={(ev) =>
                              setManualMatch((prev) => ({ ...prev, [r.idx]: ev.target.value === "NULL" ? null : ev.target.value }))
                            }
                            style={{
                              flex: 1,
                              minWidth: 160,
                              padding: 6,
                              borderRadius: 6,
                              border: "1px solid #ddd",
                              background: "#fff",
                            }}
                            title="Pick building when no street address is present"
                          >
                            <option value="NULL">— Choose building (optional) —</option>
                            {orgBuildings.map((b) => (
                              <option key={b.id} value={b.id}>
                                {buildingLabel(b)}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td style={{ padding: "6px 4px", minWidth: 130 }}>
                        <input
                          value={e.meter}
                          onChange={(ev) => setEdit(r.idx, { meter: ev.target.value })}
                          style={{ width: "100%", padding: 6, borderRadius: 6, border: "1px solid #ddd" }}
                        />
                      </td>
                      <td style={{ padding: "6px 4px", minWidth: 240 }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <input
                            placeholder="Start (MM-DD-YY or YYYY-MM-DD)"
                            value={e.start}
                            onChange={(ev) => setEdit(r.idx, { start: ev.target.value })}
                            style={{ flex: 1, padding: 6, borderRadius: 6, border: "1px solid #ddd" }}
                          />
                          <input
                            placeholder="End"
                            value={e.end}
                            onChange={(ev) => setEdit(r.idx, { end: ev.target.value })}
                            style={{ flex: 1, padding: 6, borderRadius: 6, border: "1px solid #ddd" }}
                          />
                        </div>
                      </td>
                      <td style={{ padding: "6px 4px", textAlign: "right" }}>
                        <input
                          inputMode="decimal"
                          value={e.kwh ?? ""}
                          onChange={(ev) =>
                            setEdit(r.idx, { kwh: ev.target.value === "" ? null : Number(ev.target.value) })
                          }
                          style={{
                            width: 120,
                            padding: 6,
                            borderRadius: 6,
                            border: "1px solid #ddd",
                            textAlign: "right",
                          }}
                        />
                      </td>
                      <td style={{ padding: "6px 4px", textAlign: "right" }}>
                        <input
                          inputMode="decimal"
                          value={e.mcf ?? ""}
                          onChange={(ev) =>
                            setEdit(r.idx, { mcf: ev.target.value === "" ? null : Number(ev.target.value) })
                          }
                          style={{
                            width: 100,
                            padding: 6,
                            borderRadius: 6,
                            border: "1px solid #ddd",
                            textAlign: "right",
                          }}
                        />
                      </td>
                      <td style={{ padding: "6px 4px", textAlign: "right" }}>
                        <input
                          inputMode="decimal"
                          value={e.mmbtu ?? ""}
                          onChange={(ev) =>
                            setEdit(r.idx, { mmbtu: ev.target.value === "" ? null : Number(ev.target.value) })
                          }
                          style={{
                            width: 100,
                            padding: 6,
                            borderRadius: 6,
                            border: "1px solid #ddd",
                            textAlign: "right",
                          }}
                        />
                      </td>
                      <td style={{ padding: "6px 4px", textAlign: "right" }}>
                        <input
                          inputMode="decimal"
                          value={e.sectionTotal ?? ""}
                          onChange={(ev) =>
                            setEdit(r.idx, {
                              sectionTotal: ev.target.value === "" ? null : Number(ev.target.value),
                            })
                          }
                          style={{
                            width: 110,
                            padding: 6,
                            borderRadius: 6,
                            border: "1px solid #ddd",
                            textAlign: "right",
                          }}
                        />
                      </td>
                      <td style={{ padding: "6px 4px", textAlign: "right" }}>
                        <input
                          inputMode="decimal"
                          value={e.total ?? ""}
                          onChange={(ev) =>
                            setEdit(r.idx, { total: ev.target.value === "" ? null : Number(ev.target.value) })
                          }
                          style={{
                            width: 110,
                            padding: 6,
                            borderRadius: 6,
                            border: "1px solid #ddd",
                            textAlign: "right",
                          }}
                        />
                      </td>
                      <td style={{ padding: "6px 4px", textAlign: "right" }}>
                        <input
                          inputMode="decimal"
                          value={e.demand ?? ""}
                          onChange={(ev) =>
                            setEdit(r.idx, { demand: ev.target.value === "" ? null : Number(ev.target.value) })
                          }
                          style={{
                            width: 110,
                            padding: 6,
                            borderRadius: 6,
                            border: "1px solid #ddd",
                            textAlign: "right",
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.8 }}>
                Tip: rows shaded light orange have <b>low confidence</b>—fix fields or leave unchecked.
              </div>
              <button
                onClick={handleIngest}
                disabled={posting || approvedCount === 0}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #ccc",
                  background: approvedCount === 0 ? "#f3f3f3" : "white",
                  cursor: approvedCount === 0 ? "not-allowed" : "pointer",
                  fontWeight: 600,
                }}
                title={
                  approvedCount === 0
                    ? "No approved rows"
                    : "Send approved rows to /api/ingest-bills (grouped by vendor)"
                }
              >
                {posting ? "Ingesting…" : `Ingest ${approvedCount} approved`}
              </button>
            </div>
          </div>

          {/* Debug JSON */}
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: 12,
              background: "#fcfcfc",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Debug JSON</div>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                margin: 0,
                fontSize: 12,
                lineHeight: 1.45,
                maxHeight: 360,
                overflow: "auto",
              }}
            >
{JSON.stringify(parsed, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
