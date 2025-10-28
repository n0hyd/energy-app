// Keep your existing ES_BASE export as-is if you have it.
// If you don't have one yet, this is safe:
export const ES_BASE =
  process.env.ENERGYSTAR_BASE_URL ||
  process.env.PM_BASE_URL ||
  "https://portfoliomanager.energystar.gov/wstest";

// NEW: lazy creds getter (runs only when called from server/API)
export function getPmCreds() {
  const isServer = typeof window === "undefined";

  // Read either naming convention
  // prefer PM_* if non-empty; otherwise fall back to ENERGYSTAR_*
const username =
  process.env.PM_USERNAME?.trim() || process.env.ENERGYSTAR_USERNAME?.trim();
const password =
  process.env.PM_PASSWORD?.trim() || process.env.ENERGYSTAR_PASSWORD?.trim();

if (!username || !password) {
  throw new Error(
    "Missing PM_USERNAME/PM_PASSWORD (or ENERGYSTAR_USERNAME/ENERGYSTAR_PASSWORD)"
  );
}

return "Basic " + Buffer.from(`${username}:${password}`).toString("base64");

  if (!username || !password) {
    // Helpful debug once (server console)
    if (isServer) {
      console.error("[pm] Missing creds. Presence flags:", {
        ENERGYSTAR_USERNAME: !!process.env.ENERGYSTAR_USERNAME,
        PM_USERNAME: !!process.env.PM_USERNAME,
        ENERGYSTAR_PASSWORD: !!process.env.ENERGYSTAR_PASSWORD,
        PM_PASSWORD: !!process.env.PM_PASSWORD,
      });
    }
    throw new Error(
      "PM credentials missing. Set ENERGYSTAR_USERNAME/ENERGYSTAR_PASSWORD or PM_USERNAME/PM_PASSWORD on the SERVER."
    );
  }
  return { username, password };
}

// If you expose an auth header helper, make it call the getter:
export function esAuthHeader() {
  const { username, password } = getPmCreds();
  const token = Buffer.from(`${username}:${password}`).toString("base64");
  return `Basic ${token}`;
}
