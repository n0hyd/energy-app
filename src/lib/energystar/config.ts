export const ES_BASE = process.env.ENERGYSTAR_BASE_URL || "https://portfoliomanager.energystar.gov/ws";

export function getEsAuthHeader() {
  const u = process.env.ENERGYSTAR_USERNAME;
  const p = process.env.ENERGYSTAR_PASSWORD;
  if (!u || !p) throw new Error("ENERGYSTAR_USERNAME / ENERGYSTAR_PASSWORD are not set");
  return "Basic " + Buffer.from(`${u}:${p}`).toString("base64");
}

export const ES_TIMEOUT_MS = parseInt(process.env.ENERGYSTAR_TIMEOUT_MS || "20000", 10);
export const ES_MAX_RETRIES = parseInt(process.env.ENERGYSTAR_MAX_RETRIES || "3", 10);
