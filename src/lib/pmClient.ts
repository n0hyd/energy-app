export type PmCreds = { baseUrl: string; username: string; password: string };

export async function pmRequest(
  creds: PmCreds,
  path: string,
  method: string,
  xmlBody?: string
) {
  const url = `${creds.baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
  const headers: Record<string, string> = {
    Accept: "application/xml",
    Authorization: "Basic " + Buffer.from(`${creds.username}:${creds.password}`).toString("base64"),
  };
  if (xmlBody) headers["Content-Type"] = "application/xml";

  const res = await fetch(url, { method, headers, body: xmlBody });
  const text = await res.text();
  if (!res.ok) {
    // include the body (PM often sends a human-readable validation error)
    throw new Error(`PM ${method} ${path} failed: ${res.status} ${res.statusText}\n${text}`);
  }
  return text;
}

export function escapeXml(s: string) {
  return (s || "").replace(/[<>&'"]/g, (c) => ({ "<":"&lt;","&":"&amp;",">":"&gt;","'":"&apos;",'"':"&quot;" }[c]!));
}
