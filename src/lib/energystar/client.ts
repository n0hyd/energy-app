import { ES_BASE, ES_MAX_RETRIES, ES_TIMEOUT_MS, getEsAuthHeader } from "./config";
import { esAuthHeader } from "./config";

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export async function esFetch(path: string, init: RequestInit & { retry?: number } = {}) {
  const url = path.startsWith("http") ? path : `${ES_BASE}${path}`;
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", esAuthHeader());

  // PM WS often wants XML; if you switch to JSON endpoints, change accordingly.
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/xml");
  if (!headers.has("Accept")) headers.set("Accept", "application/xml");

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ES_TIMEOUT_MS);

  const maxRetries = ES_MAX_RETRIES;
  let attempt = 0;
  let lastErr: any;

  while (attempt <= maxRetries) {
    try {
      const res = await fetch(url, { ...init, headers, signal: controller.signal });
      clearTimeout(t);
      return res;
    } catch (err: any) {
      lastErr = err;
      if (attempt === maxRetries) break;
      await sleep(500 * Math.pow(2, attempt)); // simple backoff
      attempt++;
    }
  }
  throw lastErr;
}
