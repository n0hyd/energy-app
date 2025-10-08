import { esFetch } from "./client";
import { normalizeForMeterType, asDate, mcfToMmbtu } from "./map";
import type { UploadRequest, EsResponse, UsagePoint, DownloadRequest } from "./types";

/**
 * Upload a batch of usage points to a PM meter.
 * NOTE: PM Web Services are XML-based. This function builds a minimal XML payload stub.
 * Replace the payload builder with the exact PM schema you choose (meter readings create).
 */
export async function uploadUsage(req: UploadRequest): Promise<EsResponse> {
  const { meter, points, dryRun } = req;

  // Convert each point to the unit PM expects per meter type
  const normalized: UsagePoint[] = points.map(p => normalizeForMeterType(p, meter.meterType));

  // Build minimal XML payload (you will adjust to PM schema)
  const itemsXML = normalized.map(p => {
    const start = asDate(p.period_start);
    const end = asDate(p.period_end);
    // Example skeleton; replace element names to match PM requirements:
    return `
      <meterReading>
        <startDate>${start}</startDate>
        <endDate>${end}</endDate>
        <value unit="${p.unit}">${p.usage}</value>
      </meterReading>`;
  }).join("");

  const payload = `<?xml version="1.0" encoding="UTF-8"?>
  <meterReadings>
    <meterId>${meter.pmMeterId}</meterId>
    ${itemsXML}
  </meterReadings>`.trim();

  if (dryRun) {
    return { ok: true, status: 200, data: { meter, payloadPreview: payload } };
  }

  // Example endpoint path — adjust to the exact PM endpoint
  const res = await esFetch(`/meter/${meter.pmMeterId}/consumption`, {
    method: "POST",
    body: payload,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    return { ok: false, status: res.status, error: errText };
  }
  const text = await res.text();
  return { ok: true, status: res.status, data: text };
}

/**
 * Download usage from PM for a meter and date range.
 * You will parse the XML response and map into your local shapes.
 */
export async function downloadUsage(req: DownloadRequest): Promise<EsResponse<{ points: UsagePoint[] }>> {
  const { meter, start, end, dryRun } = req;
  if (dryRun) {
    return {
      ok: true,
      status: 200,
      data: {
        points: [
          { period_start: start, period_end: end, usage: 1000, unit: meter.meterType === "electric" ? "kWh" : "MMBtu" }
        ]
      }
    };
  }

  // Example endpoint path — adjust to the exact PM endpoint
  const res = await esFetch(`/meter/${meter.pmMeterId}/consumption?startDate=${asDate(start)}&endDate=${asDate(end)}`, {
    method: "GET",
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    return { ok: false, status: res.status, error: errText };
  }

  const xml = await res.text();
  // TODO: parse XML; for now, return empty set to wire the flow
  return { ok: true, status: 200, data: { points: [] } };
}

/** Helpers you can import elsewhere */
export const energyHelpers = { mcfToMmbtu, asDate, normalizeForMeterType };
