import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";
import { XMLParser } from "fast-xml-parser";
import { createHash } from "crypto";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "100mb",
    },
  },
};

type Database = any;

type IngestBody = {
  orgId?: string;
  buildingId?: string | null;
  sourceUtility?: string | null;
  sourceFilename?: string | null;
  xml?: string | null;
  dryRun?: boolean;
  skipAnalyticsRefresh?: boolean;
};

type StreamRole = "consumption" | "export" | "demand" | "other";

type ParsedReadingType = {
  readingTypeIdUrn: string | null;
  readingTypeRef: string | null;
  uom: number | null;
  powerOfTenMultiplier: number;
  intervalLength: number | null;
  kind: number | null;
  commodity: number | null;
  flowDirection: number | null;
  accumulationBehaviour: number | null;
};

type ParsedInterval = {
  sourceMeterIdentifier: string | null;
  sourceUsagePointId: string | null;
  sourceUsagePointRef: string | null;
  sourceUsagePointIdUrn: string | null;
  sourceMeterReadingIdUrn: string | null;
  sourceReadingTypeIdUrn: string | null;
  intervalStartUtc: string;
  durationSeconds: number;
  valueRaw: number;
  valueNormalized: number;
  valueWh: number | null;
  valueKwh: number | null;
  streamRole: StreamRole;
  readingTypeRef: string | null;
  readingTypeUom: number | null;
  readingTypePowerOfTenMultiplier: number;
  readingTypeIntervalLength: number | null;
  readingTypeKind: number | null;
  readingTypeCommodity: number | null;
  readingTypeFlowDirection: number | null;
  readingTypeAccumulationBehaviour: number | null;
  sourceReadingRef: string | null;
  streamId: string;
  isDuplicate: boolean;
  canonicalStreamId: string;
  duplicateReason: string | null;
};

type EntryShape = {
  id: string | null;
  title: string | null;
  links: Array<{ rel: string | null; href: string | null }>;
  content: Record<string, unknown> | null;
};

const isoDate = (d: Date) => d.toISOString();

function toArray<T>(v: T | T[] | null | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
}

function asString(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

function asNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function asInteger(v: unknown): number | null {
  const n = asNumber(v);
  if (n == null) return null;
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function normMeter(s: string | null | undefined): string {
  return String(s ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function normAddress(s: string | null | undefined): string {
  const tokenMap: Record<string, string> = {
    STREET: "ST",
    ST: "ST",
    AVENUE: "AVE",
    AVE: "AVE",
    ROAD: "RD",
    RD: "RD",
    DRIVE: "DR",
    DR: "DR",
    BOULEVARD: "BLVD",
    BLVD: "BLVD",
    LANE: "LN",
    LN: "LN",
    COURT: "CT",
    CT: "CT",
    CIRCLE: "CIR",
    CIR: "CIR",
    PLACE: "PL",
    PL: "PL",
    TERRACE: "TER",
    TER: "TER",
    PARKWAY: "PKWY",
    PKWY: "PKWY",
    HIGHWAY: "HWY",
    HWY: "HWY",
    NORTH: "N",
    N: "N",
    SOUTH: "S",
    S: "S",
    EAST: "E",
    E: "E",
    WEST: "W",
    W: "W",
    NORTHEAST: "NE",
    NE: "NE",
    NORTHWEST: "NW",
    NW: "NW",
    SOUTHEAST: "SE",
    SE: "SE",
    SOUTHWEST: "SW",
    SW: "SW",
  };

  const raw = String(s ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, " ")
    .replace(/\s+/g, " ");
  const tokens = raw
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((t) => tokenMap[t] ?? t);
  return tokens.join(" ");
}

const INGEST_ADDRESS_ALIASES = new Map<string, string>([
  ["925 E MADISON AVE FTBLL", "801 E MADISON"],
  ["830 RIDGECREST RD CONCE", "830 RIDGECREST RD"],
]);

function extractAddressFromFilename(filename: string | null | undefined): string | null {
  const raw = String(filename ?? "").trim();
  if (!raw) return null;
  const base = raw.replace(/\.[^.]+$/, "");

  // Primary pattern: *_Usage_{address}_YYYY-MM-DD_YYYY-MM-DD (allow trailing suffix like " (1)")
  const strict = base.match(/_Usage_(.+?)_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}(?:\D.*)?$/i);
  if (strict?.[1]) return strict[1].replace(/_/g, " ").trim();

  // Fallback: find first date pair and treat text between `_Usage_` and first date as address.
  const usageIdx = base.toLowerCase().indexOf("_usage_");
  if (usageIdx >= 0) {
    const afterUsage = base.slice(usageIdx + "_usage_".length);
    const dates = afterUsage.match(/(\d{4}-\d{2}-\d{2})/g);
    if (dates && dates.length >= 2) {
      const firstDatePos = afterUsage.indexOf(dates[0]);
      if (firstDatePos > 0) {
        const candidate = afterUsage.slice(0, firstDatePos).replace(/[_\s-]+$/, "");
        if (candidate.trim()) return candidate.replace(/_/g, " ").trim();
      }
    }
  }

  return null;
}

function firstHouseNumber(addressNorm: string): string | null {
  const first = addressNorm.split(" ").find(Boolean) ?? "";
  return /^\d+$/.test(first) ? first : null;
}

function tokenSet(addressNorm: string): Set<string> {
  return new Set(addressNorm.split(" ").filter((t) => t.length > 1));
}

function jaccardScore(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  Array.from(a).forEach((t) => {
    if (b.has(t)) inter += 1;
  });
  const union = new Set<string>([...Array.from(a), ...Array.from(b)]).size;
  return union ? inter / union : 0;
}

function normalizeRef(ref: string | null | undefined): string {
  return String(ref ?? "")
    .trim()
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/\/+$/, "");
}

function lastPathToken(ref: string | null | undefined): string | null {
  const n = normalizeRef(ref);
  if (!n) return null;
  const parts = n.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}

function usagePointRefFromMeterReadingUp(ref: string | null | undefined): string | null {
  const n = normalizeRef(ref);
  if (!n) return null;
  return n.replace(/\/meterreading$/i, "");
}

function meterReadingRefFromIntervalBlockUp(ref: string | null | undefined): string | null {
  const n = normalizeRef(ref);
  if (!n) return null;
  return n.replace(/\/intervalblock$/i, "");
}

function pullLinks(entry: Record<string, unknown>): Array<{ rel: string | null; href: string | null }> {
  const raw = toArray(entry.link as unknown);
  return raw.map((x) => {
    const o = asObject(x);
    if (!o) return { rel: null, href: null };
    return {
      rel: asString(o.rel ?? o["@_rel"]),
      href: asString(o.href ?? o["@_href"]),
    };
  });
}

function extractEntries(doc: Record<string, unknown>): EntryShape[] {
  const feed = asObject(doc.feed);
  if (!feed) return [];
  const entries = toArray(feed.entry as unknown);
  return entries
    .map((e) => asObject(e))
    .filter((e): e is Record<string, unknown> => !!e)
    .map((e) => {
      const contentRaw = asObject(e.content);
      const content = contentRaw ? asObject(contentRaw["#text"]) ?? contentRaw : null;
      return {
        id: asString(e.id),
        title: asString(e.title),
        links: pullLinks(e),
        content,
      };
    });
}

function pickContentNode(content: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  if (!content) return null;
  const direct = asObject(content[key]);
  if (direct) return direct;
  for (const [k, v] of Object.entries(content)) {
    if (k.toLowerCase() === key.toLowerCase()) {
      const o = asObject(v);
      if (o) return o;
    }
  }
  return null;
}

function isMeterReadingEntry(entry: EntryShape): boolean {
  const title = (entry.title ?? "").toLowerCase();
  if (title.includes("meter reading")) return true;
  return entry.links.some((l) => {
    const href = (l.href ?? "").toLowerCase();
    const rel = (l.rel ?? "").toLowerCase();
    return rel === "self" && href.includes("/meterreading/") && !href.includes("/intervalblock/");
  });
}

function pickIdentifierValues(node: Record<string, unknown> | null): string[] {
  if (!node) return [];
  const values = new Set<string>();

  const directMrid = asString(node.mRID);
  if (directMrid) values.add(directMrid);

  const sdp = asObject(node.serviceDeliveryPoint);
  const sdpName = asString(sdp?.name);
  if (sdpName) values.add(sdpName);

  for (const [k, v] of Object.entries(node)) {
    const key = k.toLowerCase();
    if (key === "mrid" || key === "name") {
      const sv = asString(v);
      if (sv) values.add(sv);
    }
    if (key === "servicedeliverypoint") {
      const so = asObject(v);
      const sv = asString(so?.name);
      if (sv) values.add(sv);
    }
  }

  return Array.from(values);
}

function parseEpochToIso(startRaw: number): string | null {
  if (!Number.isFinite(startRaw)) return null;
  const ms = startRaw > 10_000_000_000 ? startRaw : startRaw * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return isoDate(d);
}

const tzDateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();
const tzDateFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getTimeZoneDateTimeFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = tzDateTimeFormatterCache.get(timeZone);
  if (cached) return cached;
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  tzDateTimeFormatterCache.set(timeZone, fmt);
  return fmt;
}

function getTimeZoneDateFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = tzDateFormatterCache.get(timeZone);
  if (cached) return cached;
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  tzDateFormatterCache.set(timeZone, fmt);
  return fmt;
}

function getFormatPart(parts: Intl.DateTimeFormatPart[], type: string): number {
  const raw = parts.find((p) => p.type === type)?.value ?? "";
  return Number(raw);
}

function safeTimeZone(raw: string | null | undefined): string {
  const candidate = String(raw ?? "").trim();
  if (!candidate) return "America/Chicago";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return "America/Chicago";
  }
}

function getTimeZoneOffsetMsAtInstant(instantMs: number, timeZone: string): number {
  const parts = getTimeZoneDateTimeFormatter(timeZone).formatToParts(new Date(instantMs));
  const year = getFormatPart(parts, "year");
  const month = getFormatPart(parts, "month");
  const day = getFormatPart(parts, "day");
  const hour = getFormatPart(parts, "hour");
  const minute = getFormatPart(parts, "minute");
  const second = getFormatPart(parts, "second");
  const localAsUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  return localAsUtcMs - instantMs;
}

function localWallTimeToUtcIso(
  wall: { year: number; month: number; day: number; hour: number; minute: number; second: number },
  timeZone: string
): string {
  const wallUtcMs = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  let guessMs = wallUtcMs;
  for (let i = 0; i < 5; i += 1) {
    const offsetMs = getTimeZoneOffsetMsAtInstant(guessMs, timeZone);
    const nextGuessMs = wallUtcMs - offsetMs;
    if (Math.abs(nextGuessMs - guessMs) < 1000) {
      guessMs = nextGuessMs;
      break;
    }
    guessMs = nextGuessMs;
  }
  return new Date(guessMs).toISOString();
}

function reinterpretIsoAsLocalWallTime(isoTs: string, timeZone: string): string {
  const d = new Date(isoTs);
  if (Number.isNaN(d.getTime())) return isoTs;
  return localWallTimeToUtcIso(
    {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      hour: d.getUTCHours(),
      minute: d.getUTCMinutes(),
      second: d.getUTCSeconds(),
    },
    timeZone
  );
}

function classifyStreamRole(rt: ParsedReadingType | null): StreamRole {
  if (!rt) return "other";
  if (rt.kind === 12 && rt.uom === 72 && rt.flowDirection === 1) return "consumption";
  if (rt.kind === 12 && rt.uom === 72 && rt.flowDirection === 19) return "export";
  if (rt.uom === 38 || rt.kind === 37) return "demand";
  return "other";
}

function readingTypeSignature(iv: ParsedInterval): string {
  return [
    iv.readingTypeUom ?? "",
    iv.readingTypePowerOfTenMultiplier ?? 0,
    iv.readingTypeIntervalLength ?? "",
    iv.readingTypeKind ?? "",
    iv.readingTypeCommodity ?? "",
    iv.readingTypeFlowDirection ?? "",
    iv.readingTypeAccumulationBehaviour ?? "",
  ].join("|");
}

function computeSeriesHash(points: Array<{ startUtc: string; valueRaw: number }>): string {
  const canonical = points
    .slice()
    .sort((a, b) => a.startUtc.localeCompare(b.startUtc))
    .map((p) => `${p.startUtc},${p.valueRaw}`)
    .join("|");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function monthStartInTimeZone(isoTs: string, timeZone: string): string | null {
  const d = new Date(isoTs);
  if (Number.isNaN(d.getTime())) return null;
  const parts = getTimeZoneDateFormatter(timeZone).formatToParts(d);
  const year = getFormatPart(parts, "year");
  const month = getFormatPart(parts, "month");
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function isWeekdayInTimeZone(isoTs: string, timeZone: string): boolean {
  const d = new Date(isoTs);
  if (Number.isNaN(d.getTime())) return false;
  const parts = getTimeZoneDateFormatter(timeZone).formatToParts(d);
  const year = getFormatPart(parts, "year");
  const month = getFormatPart(parts, "month");
  const day = getFormatPart(parts, "day");
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return false;
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return dow >= 1 && dow <= 5;
}

function extractParsedIntervals(xml: string): {
  intervals: ParsedInterval[];
  sourceIdentifiersSeen: string[];
  parseErrors: string[];
  debug: {
    usagePointRefKeys: string[];
    usagePointIdKeys: string[];
    meterReadingToUsageRef: Array<{ meterReadingRef: string; usageRef: string | null }>;
    meterReadingToReadingTypeRef: Array<{ meterReadingRef: string; readingTypeRef: string | null }>;
    readingTypeRefKeys: string[];
    intervalBlockMeterReadingRefs: string[];
  };
} {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    removeNSPrefix: true,
    trimValues: true,
    parseTagValue: false,
  });
  const parsed = parser.parse(xml) as Record<string, unknown>;
  const entries = extractEntries(parsed);

  const usagePointIdUrnByRef = new Map<string, string | null>();
  const usagePointIdentifiersByRef = new Map<string, string[]>();
  const usagePointIdentifiersById = new Map<string, string[]>();
  const meterReadingUpByRef = new Map<string, string | null>();
  const meterReadingIdUrnByRef = new Map<string, string | null>();
  const meterReadingReadingTypeRefByRef = new Map<string, string | null>();
  const readingTypeByRef = new Map<string, ParsedReadingType>();
  const intervalBlocks: Array<{
    meterReadingRef: string | null;
    rows: Array<{ start: number; duration: number; valueRaw: number }>;
  }> = [];
  const parseErrors: string[] = [];

  for (const entry of entries) {
    const entryIdUrn = asString(entry.id);
    const entryRef = normalizeRef(entry.id);
    const usagePoint = pickContentNode(entry.content, "UsagePoint");
    const readingType = pickContentNode(entry.content, "ReadingType");
    const meterReading = pickContentNode(entry.content, "MeterReading");
    const intervalBlock = pickContentNode(entry.content, "IntervalBlock");
    const meterReadingEntry = Boolean(meterReading) || isMeterReadingEntry(entry);

    if (usagePoint) {
      const ids: string[] = [];
      const title = entry.title;
      const idTail = lastPathToken(entry.id);
      const selfHref = entry.links.find((l) => (l.rel ?? "").toLowerCase() === "self")?.href ?? null;
      const selfRef = normalizeRef(selfHref);
      const selfTail = lastPathToken(selfHref);
      ids.push(...pickIdentifierValues(usagePoint));
      if (title) ids.push(title);
      if (idTail) ids.push(idTail);
      if (selfTail) ids.push(selfTail);

      const uniqueIds = Array.from(new Set(ids));
      if (uniqueIds.length) {
        if (entryRef) usagePointIdentifiersByRef.set(entryRef, uniqueIds);
        if (selfRef) usagePointIdentifiersByRef.set(selfRef, uniqueIds);
        const keyTail = selfTail ?? idTail;
        if (keyTail) usagePointIdentifiersById.set(keyTail, uniqueIds);
      }
      if (entryRef) usagePointIdUrnByRef.set(entryRef, entryIdUrn);
      if (selfRef) usagePointIdUrnByRef.set(selfRef, entryIdUrn);
      continue;
    }

    if (readingType) {
      const selfHref = entry.links.find((l) => (l.rel ?? "").toLowerCase() === "self")?.href ?? null;
      const selfRef = normalizeRef(selfHref);
      const parsedReadingType: ParsedReadingType = {
        readingTypeIdUrn: entryIdUrn,
        readingTypeRef: selfRef || entryRef || null,
        uom: asInteger(readingType.uom),
        powerOfTenMultiplier: asInteger(readingType.powerOfTenMultiplier) ?? 0,
        intervalLength: asInteger(readingType.intervalLength),
        kind: asInteger(readingType.kind),
        commodity: asInteger(readingType.commodity),
        flowDirection: asInteger(readingType.flowDirection),
        accumulationBehaviour: asInteger(readingType.accumulationBehaviour),
      };
      if (entryRef) readingTypeByRef.set(entryRef, parsedReadingType);
      if (selfRef) readingTypeByRef.set(selfRef, parsedReadingType);
      continue;
    }

    if (meterReadingEntry) {
      const up = entry.links.find((l) => (l.rel ?? "").toLowerCase() === "up")?.href ?? null;
      const selfHref = entry.links.find((l) => (l.rel ?? "").toLowerCase() === "self")?.href ?? null;
      const rt =
        entry.links.find((l) => {
          const rel = (l.rel ?? "").toLowerCase();
          const href = (l.href ?? "").toLowerCase();
          return rel === "related" && href.includes("/readingtype/");
        })?.href ?? null;
      const selfRef = normalizeRef(selfHref);
      const usagePointRef = usagePointRefFromMeterReadingUp(up);
      const readingTypeRef = normalizeRef(rt);
      if (entryRef) meterReadingUpByRef.set(entryRef, usagePointRef);
      if (selfRef) meterReadingUpByRef.set(selfRef, usagePointRef);
      if (entryRef) meterReadingIdUrnByRef.set(entryRef, entryIdUrn);
      if (selfRef) meterReadingIdUrnByRef.set(selfRef, entryIdUrn);
      if (entryRef) meterReadingReadingTypeRefByRef.set(entryRef, readingTypeRef || null);
      if (selfRef) meterReadingReadingTypeRefByRef.set(selfRef, readingTypeRef || null);
      continue;
    }

    if (intervalBlock) {
      const up = entry.links.find((l) => (l.rel ?? "").toLowerCase() === "up")?.href ?? null;
      const readingsRaw = toArray(intervalBlock.IntervalReading as unknown);
      const rows: Array<{ start: number; duration: number; valueRaw: number }> = [];

      for (const rr of readingsRaw) {
        const ro = asObject(rr);
        if (!ro) continue;
        const tp = asObject(ro.timePeriod);
        const start = asNumber(tp?.start);
        const dur = asNumber(tp?.duration);
        const valueRaw = asInteger(ro.value);
        if (start == null || dur == null || valueRaw == null) {
          parseErrors.push("Dropped interval row with missing start/duration/value");
          continue;
        }
        if (dur <= 0 || valueRaw < 0) {
          parseErrors.push("Dropped interval row with invalid duration/value");
          continue;
        }
        rows.push({ start, duration: Math.trunc(dur), valueRaw });
      }

      intervalBlocks.push({
        meterReadingRef: meterReadingRefFromIntervalBlockUp(up),
        rows,
      });
    }
  }

  const intervals: ParsedInterval[] = [];
  const sourceIdentifiersSeen = new Set<string>();

  for (const block of intervalBlocks) {
    const usageRef = block.meterReadingRef ? meterReadingUpByRef.get(block.meterReadingRef) ?? null : null;
    const usagePointIdUrn = usageRef ? usagePointIdUrnByRef.get(usageRef) ?? null : null;
    const meterReadingIdUrn = block.meterReadingRef
      ? meterReadingIdUrnByRef.get(block.meterReadingRef) ?? null
      : null;
    const readingTypeRef = block.meterReadingRef
      ? meterReadingReadingTypeRefByRef.get(block.meterReadingRef) ?? null
      : null;
    const readingType = readingTypeRef ? readingTypeByRef.get(readingTypeRef) ?? null : null;
    const usagePointId = lastPathToken(usageRef);
    const idsByRef = usageRef ? usagePointIdentifiersByRef.get(usageRef) ?? [] : [];
    const idsById = usagePointId ? usagePointIdentifiersById.get(usagePointId) ?? [] : [];
    const ids = idsByRef.length ? idsByRef : idsById;
    const sourceId = ids.length ? ids[0] : null;
    if (sourceId) sourceIdentifiersSeen.add(sourceId);

    for (const r of block.rows) {
      const startIso = parseEpochToIso(r.start);
      if (!startIso) continue;
      const multiplier = readingType?.powerOfTenMultiplier ?? 0;
      const valueNormalized = r.valueRaw * Math.pow(10, multiplier);
      const valueWh = readingType?.uom === 72 ? valueNormalized : null;
      const valueKwh = valueWh == null ? null : valueWh / 1000.0;
      const streamRole = classifyStreamRole(readingType);
      const streamId = meterReadingIdUrn || block.meterReadingRef || usagePointIdUrn || usagePointId || "unknown_stream";
      intervals.push({
        sourceMeterIdentifier: sourceId,
        sourceUsagePointId: usagePointId,
        sourceUsagePointRef: usageRef,
        sourceUsagePointIdUrn: usagePointIdUrn,
        sourceMeterReadingIdUrn: meterReadingIdUrn,
        sourceReadingTypeIdUrn: readingType?.readingTypeIdUrn ?? null,
        intervalStartUtc: startIso,
        durationSeconds: r.duration,
        valueRaw: r.valueRaw,
        valueNormalized,
        valueWh,
        valueKwh,
        streamRole,
        readingTypeRef: readingTypeRef,
        readingTypeUom: readingType?.uom ?? null,
        readingTypePowerOfTenMultiplier: multiplier,
        readingTypeIntervalLength: readingType?.intervalLength ?? null,
        readingTypeKind: readingType?.kind ?? null,
        readingTypeCommodity: readingType?.commodity ?? null,
        readingTypeFlowDirection: readingType?.flowDirection ?? null,
        readingTypeAccumulationBehaviour: readingType?.accumulationBehaviour ?? null,
        sourceReadingRef: block.meterReadingRef,
        streamId,
        isDuplicate: false,
        canonicalStreamId: streamId,
        duplicateReason: null,
      });
    }
  }

  return {
    intervals,
    sourceIdentifiersSeen: Array.from(sourceIdentifiersSeen),
    parseErrors,
    debug: {
      usagePointRefKeys: Array.from(usagePointIdentifiersByRef.keys()).slice(0, 20),
      usagePointIdKeys: Array.from(usagePointIdentifiersById.keys()).slice(0, 20),
      meterReadingToUsageRef: Array.from(meterReadingUpByRef.entries())
        .slice(0, 20)
        .map(([meterReadingRef, usageRef]) => ({ meterReadingRef, usageRef })),
      meterReadingToReadingTypeRef: Array.from(meterReadingReadingTypeRefByRef.entries())
        .slice(0, 20)
        .map(([meterReadingRef, readingTypeRef]) => ({ meterReadingRef, readingTypeRef })),
      readingTypeRefKeys: Array.from(readingTypeByRef.keys()).slice(0, 20),
      intervalBlockMeterReadingRefs: intervalBlocks
        .map((b) => b.meterReadingRef)
        .filter((v): v is string => Boolean(v))
        .slice(0, 20),
    },
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const sessionSb = createPagesServerClient<Database>({ req, res });

  const {
    data: { user },
    error: authErr,
  } = await sessionSb.auth.getUser();
  if (authErr || !user) {
    return res.status(401).json({ ok: false, error: "Auth session missing" });
  }

  const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) as IngestBody;
  const orgId = body?.orgId ?? null;
  const buildingId = body?.buildingId ?? null;
  const sourceUtility = (body?.sourceUtility ?? "evergy").toLowerCase();
  const sourceFilename = body?.sourceFilename ?? "green-button.xml";
  const xml = body?.xml ?? null;
  const dryRun = Boolean(body?.dryRun || req.query.dry === "1" || req.query.dry === "true");
  const skipAnalyticsRefresh = Boolean(body?.skipAnalyticsRefresh);

  if (!orgId || !xml) {
    return res.status(400).json({ ok: false, error: "orgId and xml are required" });
  }

  const userOrg = (user.user_metadata as { org_id?: string } | undefined)?.org_id ?? null;
  if (userOrg && userOrg !== orgId) {
    return res.status(403).json({ ok: false, error: "orgId does not match current user org" });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  let importId: string | null = null;

  try {
    const { intervals, sourceIdentifiersSeen, parseErrors, debug } = extractParsedIntervals(xml);
    const streamMetaById = new Map<
      string,
      {
        readingTypeSig: string;
        intervalCount: number;
        seriesHash: string;
      }
    >();
    const streamPointsById = new Map<string, Array<{ startUtc: string; valueRaw: number }>>();
    for (const iv of intervals) {
      if (!streamPointsById.has(iv.streamId)) {
        streamPointsById.set(iv.streamId, []);
      }
      streamPointsById.get(iv.streamId)?.push({ startUtc: iv.intervalStartUtc, valueRaw: iv.valueRaw });
    }
    for (const [streamId, points] of streamPointsById.entries()) {
      const first = intervals.find((iv) => iv.streamId === streamId);
      if (!first) continue;
      streamMetaById.set(streamId, {
        readingTypeSig: readingTypeSignature(first),
        intervalCount: points.length,
        seriesHash: computeSeriesHash(points),
      });
    }
    const duplicateGroups = new Map<string, string[]>();
    for (const [streamId, meta] of streamMetaById.entries()) {
      const key = `${meta.readingTypeSig}::${meta.seriesHash}::${meta.intervalCount}`;
      if (!duplicateGroups.has(key)) duplicateGroups.set(key, []);
      duplicateGroups.get(key)?.push(streamId);
    }
    let duplicateStreamsCount = 0;
    let duplicateIntervalsCount = 0;
    const duplicateGroupSamples: Array<{
      canonicalStreamId: string;
      duplicateStreamIds: string[];
      intervalCount: number;
      seriesHash: string;
      readingTypeSignature: string;
    }> = [];
    for (const streamIds of duplicateGroups.values()) {
      if (streamIds.length < 2) continue;
      const canonicalStreamId = streamIds.slice().sort((a, b) => a.localeCompare(b))[0];
      const streamIdSet = new Set(streamIds);
      const canonicalMeta = streamMetaById.get(canonicalStreamId);
      for (const iv of intervals) {
        if (!streamIdSet.has(iv.streamId)) continue;
        iv.canonicalStreamId = canonicalStreamId;
        if (iv.streamId !== canonicalStreamId) {
          iv.isDuplicate = true;
          iv.duplicateReason = "identical_interval_series";
          duplicateIntervalsCount += 1;
        }
      }
      duplicateStreamsCount += streamIds.length - 1;
      if (canonicalMeta && duplicateGroupSamples.length < 20) {
        duplicateGroupSamples.push({
          canonicalStreamId,
          duplicateStreamIds: streamIds.filter((id) => id !== canonicalStreamId),
          intervalCount: canonicalMeta.intervalCount,
          seriesHash: canonicalMeta.seriesHash,
          readingTypeSignature: canonicalMeta.readingTypeSig,
        });
      }
    }
    const sourceUsagePointIds = Array.from(
      new Set(intervals.map((iv) => iv.sourceUsagePointId).filter((v): v is string => Boolean(v)))
    );
    if (!intervals.length) {
      return res.status(400).json({
        ok: false,
        error: "No interval data found in XML",
        parseErrors: parseErrors.slice(0, 20),
      });
    }

    let resolvedBuildingId: string | null = null;
    let resolvedBuildingAddress: string | null = null;
    let resolvedBuildingRow: Record<string, unknown> | null = null;
    let buildingMatchMethod: "explicit_building_id" | "filename_exact" | "filename_contains" | "filename_fuzzy" | null =
      null;
    const parsedAddress = extractAddressFromFilename(sourceFilename);
    const parsedAddressAliased =
      parsedAddress && INGEST_ADDRESS_ALIASES.has(normAddress(parsedAddress))
        ? INGEST_ADDRESS_ALIASES.get(normAddress(parsedAddress)) ?? parsedAddress
        : parsedAddress;
    if (buildingId) {
      const { data: b, error: bErr } = await supabaseAdmin
        .from("buildings")
        .select("*")
        .eq("id", buildingId)
        .eq("org_id", orgId)
        .maybeSingle();
      if (bErr || !b?.id) {
        return res.status(400).json({ ok: false, error: "buildingId not found for orgId" });
      }
      resolvedBuildingId = b.id as string;
      resolvedBuildingAddress = (b.address as string | null) ?? null;
      resolvedBuildingRow = (b as Record<string, unknown>) ?? null;
      buildingMatchMethod = "explicit_building_id";
    } else {
      if (!parsedAddressAliased) {
        return res.status(400).json({
          ok: false,
          error: "Could not parse building address from filename; pass buildingId or use *_Usage_{address}_YYYY-MM-DD_YYYY-MM-DD.xml",
        });
      }
      const { data: bRows, error: bErr } = await supabaseAdmin
        .from("buildings")
        .select("*")
        .eq("org_id", orgId);
      if (bErr) throw bErr;

      const target = normAddress(parsedAddressAliased);
      const targetHouse = firstHouseNumber(target);
      const targetTokens = tokenSet(target);
      const exact = (bRows ?? []).filter((b: any) => normAddress(b.address) === target);
      if (exact.length === 1) {
        resolvedBuildingId = exact[0].id as string;
        resolvedBuildingAddress = (exact[0].address as string | null) ?? null;
        resolvedBuildingRow = (exact[0] as Record<string, unknown>) ?? null;
        buildingMatchMethod = "filename_exact";
      } else if (exact.length > 1) {
        return res.status(400).json({
          ok: false,
          error: "Address parsed from filename matched multiple buildings",
          parsedAddress: parsedAddressAliased,
          matches: exact.map((x: any) => ({ id: x.id, name: x.name, address: x.address })).slice(0, 10),
        });
      } else {
        const contains = (bRows ?? []).filter((b: any) => {
          const bNorm = normAddress(b.address);
          return bNorm.includes(target) || target.includes(bNorm);
        });
        if (contains.length === 1) {
          resolvedBuildingId = contains[0].id as string;
          resolvedBuildingAddress = (contains[0].address as string | null) ?? null;
          resolvedBuildingRow = (contains[0] as Record<string, unknown>) ?? null;
          buildingMatchMethod = "filename_contains";
        } else if (contains.length > 1) {
          return res.status(400).json({
            ok: false,
            error: "Parsed filename address produced multiple partial matches",
            parsedAddress: parsedAddressAliased,
            matches: contains.map((x: any) => ({ id: x.id, name: x.name, address: x.address })).slice(0, 10),
          });
        } else {
          const scored = (bRows ?? [])
            .map((b: any) => {
              const bNorm = normAddress(b.address);
              const bHouse = firstHouseNumber(bNorm);
              const bTokens = tokenSet(bNorm);
              const score = jaccardScore(targetTokens, bTokens);
              const sameHouse = targetHouse && bHouse && targetHouse === bHouse;
              return { ...b, score, sameHouse };
            })
            .filter((x: any) => x.sameHouse && x.score >= 0.55)
            .sort((a: any, b: any) => b.score - a.score);

          if (scored.length === 1 || (scored.length > 1 && scored[0].score > scored[1].score)) {
            resolvedBuildingId = scored[0].id as string;
            resolvedBuildingAddress = (scored[0].address as string | null) ?? null;
            resolvedBuildingRow = (scored[0] as Record<string, unknown>) ?? null;
            buildingMatchMethod = "filename_fuzzy";
          } else {
            return res.status(400).json({
              ok: false,
              error: "No building address match for parsed filename address",
              parsedAddress: parsedAddressAliased,
            });
          }
        }
      }
    }

    const checksum = createHash("sha256").update(xml, "utf8").digest("hex");

    if (!dryRun) {
      const { data: existing, error: exErr } = await supabaseAdmin
        .from("green_button_imports")
        .select("id,status")
        .eq("org_id", orgId)
        .eq("file_checksum_sha256", checksum)
        .maybeSingle();
      if (exErr) throw exErr;

      if (existing?.id && existing.status === "loaded") {
        return res.status(200).json({
          ok: true,
          duplicate: true,
          importId: existing.id,
          message: "File checksum already loaded for this org",
        });
      }

      if (existing?.id) {
        importId = existing.id;
      } else {
        const { data: ins, error: insErr } = await supabaseAdmin
          .from("green_button_imports")
          .insert({
            org_id: orgId,
            building_id: resolvedBuildingId,
            uploaded_by: user.id,
            source_utility: sourceUtility,
            source_filename: sourceFilename,
            file_checksum_sha256: checksum,
            source_meter_identifier: sourceIdentifiersSeen[0] ?? null,
            source_usage_point_id: sourceUsagePointIds[0] ?? null,
            status: "uploaded",
          })
          .select("id")
          .single();
        if (insErr) throw insErr;
        importId = ins.id as string;
      }
    }

    const rowsToInsert: Array<Record<string, unknown>> = [];
    const loadShapeMonthStarts = new Set<string>();
    let loadShapeExpectedWeekdayIntervals = 0;
    const buildingTimeZone = safeTimeZone(
      ((resolvedBuildingRow as any)?.timezone ??
        (resolvedBuildingRow as any)?.time_zone ??
        (resolvedBuildingRow as any)?.tz ??
        null) as string | null
    );
    const reinterpretEvergyEpochAsLocalWall = sourceUtility === "evergy";

    let parsedCount = 0;
    const rejectedCount = parseErrors.length;
    let unmatchedCount = 0;
    let matchedCount = 0;

    for (const iv of intervals) {
      parsedCount += 1;
      if (!resolvedBuildingId) {
        unmatchedCount += 1;
        continue;
      }

      matchedCount += 1;
      const intervalStartUtc = reinterpretEvergyEpochAsLocalWall
        ? reinterpretIsoAsLocalWallTime(iv.intervalStartUtc, buildingTimeZone)
        : iv.intervalStartUtc;
      if (!importId || dryRun) continue;
      rowsToInsert.push({
        org_id: orgId,
        building_id: resolvedBuildingId,
        import_id: importId,
        interval_start_utc: intervalStartUtc,
        duration_seconds: iv.durationSeconds,
        value_raw: iv.valueRaw,
        value_normalized: iv.valueNormalized,
        value_wh: iv.valueWh,
        value_kwh: iv.valueKwh,
        stream_role: iv.streamRole,
        usage_point_id_urn: iv.sourceUsagePointIdUrn ?? "",
        meter_reading_id_urn: iv.sourceMeterReadingIdUrn ?? "",
        reading_type_id_urn: iv.sourceReadingTypeIdUrn ?? "",
        reading_type_ref: iv.readingTypeRef ?? "",
        reading_type_uom: iv.readingTypeUom,
        reading_type_power_of_ten_multiplier: iv.readingTypePowerOfTenMultiplier,
        reading_type_interval_length: iv.readingTypeIntervalLength,
        reading_type_kind: iv.readingTypeKind,
        reading_type_commodity: iv.readingTypeCommodity,
        reading_type_flow_direction: iv.readingTypeFlowDirection,
        reading_type_accumulation_behaviour: iv.readingTypeAccumulationBehaviour,
        is_duplicate: iv.isDuplicate,
        canonical_stream_id: iv.canonicalStreamId,
        duplicate_reason: iv.duplicateReason,
        source_meter_identifier: iv.sourceMeterIdentifier,
        source_reading_ref: iv.sourceReadingRef ?? "",
        source_usage_point_id: iv.sourceUsagePointId ?? "",
      });

      if (
        !iv.isDuplicate &&
        iv.valueWh != null &&
        (iv.streamRole === "consumption" || iv.streamRole === "other")
      ) {
        const monthStart = monthStartInTimeZone(intervalStartUtc, buildingTimeZone);
        if (monthStart) loadShapeMonthStarts.add(monthStart);
        if (isWeekdayInTimeZone(intervalStartUtc, buildingTimeZone)) loadShapeExpectedWeekdayIntervals += 1;
      }
    }

    let insertedCount = 0;
    let dedupedCount = 0;

    if (!dryRun && importId && rowsToInsert.length) {
      for (let i = 0; i < rowsToInsert.length; i += 500) {
        const rawBatch = rowsToInsert.slice(i, i + 500);
        const batchByConflictKey = new Map<string, Record<string, unknown>>();
        for (const row of rawBatch) {
          const key = [
            String(row.building_id ?? ""),
            String(row.source_usage_point_id ?? ""),
            String(row.source_reading_ref ?? ""),
            String(row.interval_start_utc ?? ""),
            String(row.duration_seconds ?? ""),
          ].join("|");
          // Keep the last row encountered for a duplicate conflict key within the same upsert statement.
          batchByConflictKey.set(key, row);
        }
        const batch = Array.from(batchByConflictKey.values());
        const { data, error } = await supabaseAdmin
          .from("green_button_intervals")
          .upsert(batch, {
            onConflict: "building_id,source_usage_point_id,source_reading_ref,interval_start_utc,duration_seconds",
          })
          .select("id");
        if (error) throw error;
        insertedCount += (data ?? []).length;
      }
      dedupedCount = Math.max(0, matchedCount - insertedCount);
    }

    let retentionResult: unknown = null;
    let monthlyPeakRefreshResult: unknown = null;
    let monthlyEnergyRefreshResult: unknown = null;
    let monthlyTopPeaksRefreshResult: unknown = null;
    let startupIntensityRefreshResult: unknown = null;
    let peakTimingRefreshResult: unknown = null;
    let afterHoursRefreshResult: unknown = null;
    let afterHoursPctRefreshResult: unknown = null;
    let loadShapeRefreshResult: unknown = null;
    let weekendOpsRefreshResult: unknown = null;
    let refreshWarningsForResponse: string[] = [];
    let refreshFailuresForResponse: Array<{
      mv: string;
      message: string;
      code: string | null;
      details: string | null;
      hint: string | null;
    }> = [];

    if (!dryRun && importId) {
      const status = "parsed";
      const baseErrorSummary = {
        parseErrors: parseErrors.slice(0, 50),
        building_match_mode: buildingMatchMethod,
        parsed_address: parsedAddressAliased,
        resolved_building_id: resolvedBuildingId,
      };
      const { error: updErr } = await supabaseAdmin
        .from("green_button_imports")
        .update({
          status,
          building_id: resolvedBuildingId,
          source_meter_identifier: sourceIdentifiersSeen[0] ?? null,
          source_usage_point_id: sourceUsagePointIds[0] ?? null,
          interval_count_parsed: parsedCount,
          interval_count_inserted: insertedCount,
          interval_count_deduped: dedupedCount,
          interval_count_rejected: rejectedCount,
          interval_count_unmatched_meter: unmatchedCount,
          error_summary: baseErrorSummary,
          updated_at: isoDate(new Date()),
        })
        .eq("id", importId);
      if (updErr) throw updErr;

      // Retention pruning is disabled for now to preserve full history.
      retentionResult = { skipped: true, reason: "pruning_disabled" };

      if (skipAnalyticsRefresh) {
        monthlyPeakRefreshResult = { skipped: true };
        monthlyEnergyRefreshResult = { skipped: true };
        monthlyTopPeaksRefreshResult = { skipped: true };
        startupIntensityRefreshResult = { skipped: true };
        peakTimingRefreshResult = { skipped: true };
        afterHoursRefreshResult = { skipped: true };
        afterHoursPctRefreshResult = { skipped: true };
        loadShapeRefreshResult = { skipped: true };
        weekendOpsRefreshResult = { skipped: true };
      } else {
        const refreshWarnings: string[] = [];
        const refreshFailures: Array<{
          mv: string;
          message: string;
          code: string | null;
          details: string | null;
          hint: string | null;
        }> = [];

        const { data: refreshData, error: refreshErr } = await supabaseAdmin.rpc(
          "refresh_green_button_monthly_peak_cache",
          {
            p_org_id: orgId,
            p_building_id: resolvedBuildingId,
          }
        );
        if (refreshErr) {
          refreshWarnings.push(`monthly_peak_cache: ${refreshErr.message}`);
          refreshFailures.push({
            mv: "green_button_monthly_peak_cache",
            message: refreshErr.message,
            code: (refreshErr as any)?.code ?? null,
            details: (refreshErr as any)?.details ?? null,
            hint: (refreshErr as any)?.hint ?? null,
          });
          monthlyPeakRefreshResult = { ok: false, error: refreshErr.message };
        } else {
          monthlyPeakRefreshResult = refreshData ?? null;
        }

        const { data: monthlyEnergyRefreshData, error: monthlyEnergyRefreshErr } = await supabaseAdmin.rpc(
          "refresh_green_button_monthly_energy_mv"
        );
        if (monthlyEnergyRefreshErr) {
          refreshWarnings.push(`monthly_energy_mv: ${monthlyEnergyRefreshErr.message}`);
          refreshFailures.push({
            mv: "green_button_monthly_energy_mv",
            message: monthlyEnergyRefreshErr.message,
            code: (monthlyEnergyRefreshErr as any)?.code ?? null,
            details: (monthlyEnergyRefreshErr as any)?.details ?? null,
            hint: (monthlyEnergyRefreshErr as any)?.hint ?? null,
          });
          monthlyEnergyRefreshResult = { ok: false, error: monthlyEnergyRefreshErr.message };
        } else {
          monthlyEnergyRefreshResult = monthlyEnergyRefreshData ?? null;
        }

        const { data: monthlyTopPeaksRefreshData, error: monthlyTopPeaksRefreshErr } =
          await supabaseAdmin.rpc("refresh_green_button_monthly_top_peaks_mv");
        if (monthlyTopPeaksRefreshErr) {
          refreshWarnings.push(`monthly_top_peaks_mv: ${monthlyTopPeaksRefreshErr.message}`);
          refreshFailures.push({
            mv: "green_button_monthly_top_peaks_mv",
            message: monthlyTopPeaksRefreshErr.message,
            code: (monthlyTopPeaksRefreshErr as any)?.code ?? null,
            details: (monthlyTopPeaksRefreshErr as any)?.details ?? null,
            hint: (monthlyTopPeaksRefreshErr as any)?.hint ?? null,
          });
          monthlyTopPeaksRefreshResult = { ok: false, error: monthlyTopPeaksRefreshErr.message };
        } else {
          monthlyTopPeaksRefreshResult = monthlyTopPeaksRefreshData ?? null;
        }

        const { data: startupRefreshData, error: startupRefreshErr } = await supabaseAdmin.rpc(
          "refresh_green_button_startup_intensity_monthly_mv"
        );
        if (startupRefreshErr) {
          refreshWarnings.push(`startup_intensity_mv: ${startupRefreshErr.message}`);
          refreshFailures.push({
            mv: "green_button_startup_intensity_monthly_mv",
            message: startupRefreshErr.message,
            code: (startupRefreshErr as any)?.code ?? null,
            details: (startupRefreshErr as any)?.details ?? null,
            hint: (startupRefreshErr as any)?.hint ?? null,
          });
          startupIntensityRefreshResult = { ok: false, error: startupRefreshErr.message };
        } else {
          startupIntensityRefreshResult = startupRefreshData ?? null;
        }

        const { data: peakTimingRefreshData, error: peakTimingRefreshErr } = await supabaseAdmin.rpc(
          "refresh_green_button_peak_timing_monthly_mv"
        );
        if (peakTimingRefreshErr) {
          refreshWarnings.push(`peak_timing_mv: ${peakTimingRefreshErr.message}`);
          refreshFailures.push({
            mv: "green_button_peak_timing_monthly_mv",
            message: peakTimingRefreshErr.message,
            code: (peakTimingRefreshErr as any)?.code ?? null,
            details: (peakTimingRefreshErr as any)?.details ?? null,
            hint: (peakTimingRefreshErr as any)?.hint ?? null,
          });
          peakTimingRefreshResult = { ok: false, error: peakTimingRefreshErr.message };
        } else {
          peakTimingRefreshResult = peakTimingRefreshData ?? null;
        }

        const { data: afterHoursRefreshData, error: afterHoursRefreshErr } = await supabaseAdmin.rpc(
          "refresh_green_button_after_hours_load_monthly_mv"
        );
        if (afterHoursRefreshErr) {
          refreshWarnings.push(`after_hours_mv: ${afterHoursRefreshErr.message}`);
          refreshFailures.push({
            mv: "green_button_after_hours_load_monthly_mv",
            message: afterHoursRefreshErr.message,
            code: (afterHoursRefreshErr as any)?.code ?? null,
            details: (afterHoursRefreshErr as any)?.details ?? null,
            hint: (afterHoursRefreshErr as any)?.hint ?? null,
          });
          afterHoursRefreshResult = { ok: false, error: afterHoursRefreshErr.message };
        } else {
          afterHoursRefreshResult = afterHoursRefreshData ?? null;
        }

        const { data: afterHoursPctRefreshData, error: afterHoursPctRefreshErr } =
          await supabaseAdmin.rpc("refresh_green_button_after_hours_pct_monthly_mv");
        if (afterHoursPctRefreshErr) {
          refreshWarnings.push(`after_hours_pct_mv: ${afterHoursPctRefreshErr.message}`);
          refreshFailures.push({
            mv: "green_button_after_hours_pct_monthly_mv",
            message: afterHoursPctRefreshErr.message,
            code: (afterHoursPctRefreshErr as any)?.code ?? null,
            details: (afterHoursPctRefreshErr as any)?.details ?? null,
            hint: (afterHoursPctRefreshErr as any)?.hint ?? null,
          });
          afterHoursPctRefreshResult = { ok: false, error: afterHoursPctRefreshErr.message };
        } else {
          afterHoursPctRefreshResult = afterHoursPctRefreshData ?? null;
        }

        const { data: loadShapeRefreshData, error: loadShapeRefreshErr } = await supabaseAdmin.rpc(
          "refresh_green_button_load_shape_monthly_cache_scoped",
          {
            p_org_id: orgId,
            p_building_id: resolvedBuildingId,
            p_month_starts: Array.from(loadShapeMonthStarts),
            p_expected_weekday_intervals: loadShapeExpectedWeekdayIntervals,
          }
        );
        if (loadShapeRefreshErr) {
          refreshWarnings.push(`load_shape_cache: ${loadShapeRefreshErr.message}`);
          refreshFailures.push({
            mv: "green_button_load_shape_monthly_cache",
            message: loadShapeRefreshErr.message,
            code: (loadShapeRefreshErr as any)?.code ?? null,
            details: (loadShapeRefreshErr as any)?.details ?? null,
            hint: (loadShapeRefreshErr as any)?.hint ?? null,
          });
          loadShapeRefreshResult = { ok: false, error: loadShapeRefreshErr.message };
        } else {
          loadShapeRefreshResult = loadShapeRefreshData ?? null;
          const loadShapeCheck = (loadShapeRefreshData ?? null) as
            | { verified?: boolean; rows_for_scope?: number; months_checked?: string[]; retry_used?: boolean }
            | null;
          if (loadShapeCheck && loadShapeCheck.verified === false) {
            const verifyMessage =
              "Scoped load-shape cache refresh completed but no load-shape rows were present for ingested building/months";
            refreshWarnings.push(`load_shape_cache_verify: ${verifyMessage}`);
            refreshFailures.push({
              mv: "green_button_load_shape_monthly_cache",
              message: verifyMessage,
              code: null,
              details: JSON.stringify({
                building_id: resolvedBuildingId,
                month_starts: Array.from(loadShapeMonthStarts),
                month_starts_checked: loadShapeCheck.months_checked ?? [],
                expected_weekday_intervals: loadShapeExpectedWeekdayIntervals,
                rows_for_scope: loadShapeCheck.rows_for_scope ?? 0,
              }),
              hint: "Check cache refresh filters and timezone basis against ingested interval timestamps.",
            });
          }
        }

        const { data: weekendOpsRefreshData, error: weekendOpsRefreshErr } = await supabaseAdmin.rpc(
          "refresh_green_button_weekend_ops_monthly_mv"
        );
        if (weekendOpsRefreshErr) {
          refreshWarnings.push(`weekend_ops_mv: ${weekendOpsRefreshErr.message}`);
          refreshFailures.push({
            mv: "green_button_weekend_ops_monthly_mv",
            message: weekendOpsRefreshErr.message,
            code: (weekendOpsRefreshErr as any)?.code ?? null,
            details: (weekendOpsRefreshErr as any)?.details ?? null,
            hint: (weekendOpsRefreshErr as any)?.hint ?? null,
          });
          weekendOpsRefreshResult = { ok: false, error: weekendOpsRefreshErr.message };
        } else {
          weekendOpsRefreshResult = weekendOpsRefreshData ?? null;
        }

        if (refreshWarnings.length) {
          console.error("[green-button-ingest] analytics refresh failures", {
            orgId,
            importId,
            warnings: refreshWarnings,
            failures: refreshFailures,
          });

          await supabaseAdmin
            .from("green_button_imports")
            .update({
              status: "loaded",
              error_summary: {
                ...baseErrorSummary,
                refresh_failures: refreshFailures,
              },
              updated_at: isoDate(new Date()),
            })
            .eq("id", importId);
        }

        refreshWarningsForResponse = refreshWarnings;
        refreshFailuresForResponse = refreshFailures;
      }

      const { error: loadedErr } = await supabaseAdmin
        .from("green_button_imports")
        .update({
          status: "loaded",
          updated_at: isoDate(new Date()),
        })
        .eq("id", importId);
      if (loadedErr) throw loadedErr;
    }

    return res.status(200).json({
      ok: true,
      dryRun,
      importId,
      counts: {
        parsed: parsedCount,
        matched: matchedCount,
        unmatched_meter: unmatchedCount,
        ambiguous_meter_matches: 0,
        duplicate_streams: duplicateStreamsCount,
        duplicate_intervals: duplicateIntervalsCount,
        rejected: rejectedCount,
        inserted: insertedCount,
        deduped: dedupedCount,
      },
      buildingMatch: {
        buildingId: resolvedBuildingId,
        method: buildingMatchMethod,
        parsedAddress: parsedAddressAliased,
        resolvedAddress: resolvedBuildingAddress,
      },
      sourceIdentifiersSeen: sourceIdentifiersSeen.slice(0, 20),
      sourceUsagePointIds: sourceUsagePointIds.slice(0, 20),
      retention: retentionResult,
      monthlyPeakRefresh: monthlyPeakRefreshResult,
      monthlyEnergyRefresh: monthlyEnergyRefreshResult,
      monthlyTopPeaksRefresh: monthlyTopPeaksRefreshResult,
      startupIntensityRefresh: startupIntensityRefreshResult,
      peakTimingRefresh: peakTimingRefreshResult,
      afterHoursRefresh: afterHoursRefreshResult,
      afterHoursPctRefresh: afterHoursPctRefreshResult,
      loadShapeRefresh: loadShapeRefreshResult,
      weekendOpsRefresh: weekendOpsRefreshResult,
      refreshWarnings: refreshWarningsForResponse,
      refreshFailures: refreshFailuresForResponse,
      debug: {
        ...debug,
        buildingTimeZone,
        reinterpretEvergyEpochAsLocalWall,
        duplicateGroupSamples,
      },
    });
  } catch (e: any) {
    console.error("[green-button-ingest] error", e);
    if (!dryRun && importId) {
      await supabaseAdmin
        .from("green_button_imports")
        .update({
          status: "failed",
          error_summary: {
            ingest_exception: {
              message: e?.message ?? "Ingest failed",
              code: e?.code ?? null,
              details: e?.details ?? null,
              hint: e?.hint ?? null,
            },
          },
          updated_at: isoDate(new Date()),
        })
        .eq("id", importId);
    }
    return res.status(500).json({
      ok: false,
      error: e?.message ?? "Ingest failed",
    });
  }
}
