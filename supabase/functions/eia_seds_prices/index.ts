// supabase/functions/eia_seds_prices/index.ts
// Fetch SEDS annual commercial GAS price ($/MCF) for a given US state, preview or upsert.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

type SedsDatum = {
  period: string;     // e.g., "2024"
  value: number;      // price
  geography: string;  // e.g., "KS"
};

type SedsResp = { data: SedsDatum[] };

const EIA_API_KEY = Deno.env.get("EIA_API_KEY");  // add in Supabase project settings

// Build EIA v2 SEDS query for Commercial Natural Gas price ($/MCF), annual, latest row
function sedsUrl(state: string) {
  // Notes:
  // - frequency: annual
  // - facets: sectorId=COM (Commercial), energySourceId=NG (Natural Gas), geography=<state 2-letter>
  // - data: price
  // - sort by period desc, return 1 row
  const base = "https://api.eia.gov/v2/seds/data";
  const params = new URLSearchParams({
    api_key: EIA_API_KEY ?? "",
    frequency: "annual",
    "data[0]": "price",
    "facets[sectorId][0]": "COM",
    "facets[energySourceId][0]": "NG",
    "facets[geography][0]": state.toUpperCase(),
    "sort[0][column]": "period",
    "sort[0][direction]": "desc",
    "offset": "0",
    "length": "1",
  });
  return `${base}?${params.toString()}`;
}

async function upsertPrice(
  supabaseServiceRoleKey: string,
  state: string,
  price: number,
) {
  const url = Deno.env.get("SUPABASE_URL");
  if (!url) throw new Error("Missing SUPABASE_URL");
  const table = `${url}/rest/v1/eia_state_prices`;

  const res = await fetch(`${table}?on_conflict=state,utility`, {
    method: "POST",
    headers: {
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify([{
      state: state.toUpperCase(),
      utility: "gas",
      unit: "mcf",
      price_per_unit: price,
      last_updated: new Date().toISOString(),
    }]),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Upsert failed (${res.status}): ${txt}`);
  }
}

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const dryRun = (url.searchParams.get("dryRun") ?? "false").toLowerCase() === "true";
    const state = (url.searchParams.get("state") ?? "").toUpperCase().trim();

    if (!EIA_API_KEY) {
      return new Response(JSON.stringify({ error: "Missing EIA_API_KEY" }), { status: 500 });
    }
    if (!state || state.length !== 2) {
      return new Response(JSON.stringify({ error: "Provide ?state=KS (2-letter)" }), { status: 400 });
    }

    // 1) Fetch latest SEDS annual commercial GAS price for the state
    const seds = sedsUrl(state);
    const resp = await fetch(seds);
    if (!resp.ok) {
      const txt = await resp.text();
      return new Response(JSON.stringify({ error: "EIA fetch failed", status: resp.status, body: txt, seds }), { status: 502 });
    }
    const json = (await resp.json()) as SedsResp;
    const row = json.data?.[0];
    if (!row || typeof row.value !== "number") {
      return new Response(JSON.stringify({ error: "No data row returned", seds, json }), { status: 404 });
    }

    // EIA value is already Dollars per thousand cubic feet for this series
    const year = row.period;
    const price = row.value;

    // 2) Dry run preview?
    if (dryRun) {
      return new Response(JSON.stringify({
        preview: true,
        state,
        year,
        price_per_unit: price,
        unit: "mcf",
        utility: "gas",
        eia_query: seds,
      }), { headers: { "Content-Type": "application/json" } });
    }

    // 3) Upsert
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }), { status: 500 });
    }
    await upsertPrice(SERVICE_ROLE_KEY, state, price);

    return new Response(JSON.stringify({
      ok: true, state, year, price_per_unit: price, unit: "mcf", utility: "gas",
    }), { headers: { "Content-Type": "application/json" } });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message ?? String(err) }), { status: 500 });
  }
});
