import { UsagePoint } from "./types";

/** Convert MCF gas to MMBtu using heat content (defaults 1.036 MMBtu/MCF) */
export function mcfToMmbtu(mcf: number, heatContent = 1.036): number {
  return Number((mcf * heatContent).toFixed(3));
}

/** Try to normalize to Portfolio Manager's expected units per meter type. */
export function normalizeForMeterType(point: UsagePoint, meterType: "electric" | "gas"): UsagePoint {
  if (meterType === "electric") {
    // Prefer kWh
    if (point.unit !== "kWh") {
      // If you ever pull back MMBtu from PM for electric, convert here (optional).
      return { ...point, unit: "kWh" }; // assume already kWh upstream for now
    }
    return point;
  }
  // GAS: PM often expects MMBtu; we’ll convert MCF if needed and keep both values available upstream.
  if (point.unit === "MCF") {
    const mmbtu = mcfToMmbtu(point.usage);
    return { ...point, usage: mmbtu, unit: "MMBtu" };
  }
  return point;
}

/** Utility to format date to YYYY-MM-DD safely */
export function asDate(d: string | Date): string {
  const x = typeof d === "string" ? new Date(d) : d;
  const iso = x.toISOString().slice(0,10);
  return iso;
}
