export const ES_BASE =
  process.env.ENERGYSTAR_BASE_URL ||
  process.env.PM_BASE_URL ||
  "https://portfoliomanager.energystar.gov/wstest";

export const ES_TIMEOUT_MS = Number.parseInt(
  process.env.ENERGYSTAR_TIMEOUT_MS || "30000",
  10
);

export const ES_MAX_RETRIES = Number.parseInt(
  process.env.ENERGYSTAR_MAX_RETRIES || "2",
  10
);

export function getPmCreds() {
  const username =
    process.env.PM_USERNAME?.trim() || process.env.ENERGYSTAR_USERNAME?.trim();
  const password =
    process.env.PM_PASSWORD?.trim() || process.env.ENERGYSTAR_PASSWORD?.trim();

  if (!username || !password) {
    throw new Error(
      "Missing PM_USERNAME/PM_PASSWORD (or ENERGYSTAR_USERNAME/ENERGYSTAR_PASSWORD)"
    );
  }

  return { username, password };
}

export function esAuthHeader() {
  const { username, password } = getPmCreds();
  const token = Buffer.from(`${username}:${password}`).toString("base64");
  return `Basic ${token}`;
}
