
// /src/pages/buildings/index.tsx
import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient"; // ✅ singleton client



type Building = {
  id: string;
  name: string;
  address: string | null;
  created_at: string;
  org_id: string; // <-- added
};

type MeterPreviewRow = {
  meter_id: string;
  meter_label: string | null;
  meter_number: string | null;
  utility: string | null;
  provider: string | null;
  pm_meter_id: string | null;
  building_id: string;
  building_name: string;
  pm_property_id: string | null;
fuel?: string | null;   // add
  unit?: string | null;   // add  
pmPreview?: {
    propertyId?: string;
    createPath?: string;
    createUrl?: string;
    xmlBody: string;
    inferred: { fuel: string; unit: string; meterName: string };
  } | null;
};



export default function BuildingsPage() {
  const [loading, setLoading] = useState(true);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [rlsDenied, setRlsDenied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const redirected = useRef(false);
const [bulkPreview, setBulkPreview] = useState<null | { matched: number; updates: any[]; debug?: any }>(null);

// PM sync preview state (must live inside the component)
const [meterPreview, setMeterPreview] = useState<MeterPreviewRow[]>([]);
const [busyId, setBusyId] = useState<string | null>(null);

// NEW: track bulk create progress
const [bulkCreating, setBulkCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 1) Ensure user is signed in (client-side)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!redirected.current) {
          redirected.current = true;
          window.location.href = "/auth/sign-in?redirect=/buildings";
        }
        return;
      }

      // 2) Load buildings (now including org_id + address)
      const { data, error } = await supabase
        .from("buildings")
        .select("id,name,address,created_at,org_id")
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (error) {
        const denied =
          error.code === "42501" ||
          /row-level security|permission denied/i.test(error.message || "");
        if (denied) setRlsDenied(true);
        else console.error("Error loading buildings:", error);
        setBuildings([]);
      } else {
        setBuildings(data ?? []);
        // Prefer org_id from first building if available
        if ((data ?? []).length > 0 && data![0].org_id) {
          setOrgId(data![0].org_id);
        }
      }

      // 3) If no buildings (so no org_id yet), fall back to memberships
      if ((!data || data.length === 0) && !cancelled) {
        const { data: memberships, error: mErr } = await supabase
          .from("memberships")
          .select("org_id")
          .order("created_at", { ascending: true })
          .limit(1);
        if (!mErr && memberships && memberships.length > 0) {
          setOrgId(memberships[0].org_id);
        }
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleExport = () => {
    if (!orgId) {
      alert("We couldn’t determine your organization. Create or select an org first.");
      return;
    }
    try {
      setExporting(true);
      const url = `/api/pm/export-properties-template?orgId=${encodeURIComponent(orgId)}`;
      // Navigate to trigger a file download
      window.location.href = url;
      // Small delay to re-enable after navigation returns (best-effort)
      setTimeout(() => setExporting(false), 1500);
    } catch (e) {
      console.error(e);
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold">Buildings</h1>
        <p className="text-gray-500 mt-2">Loading…</p>
      </div>
    );
  }

  if (rlsDenied) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Buildings</h1>
        <p className="text-red-600">
          You’re signed in, but don’t have access to any buildings for this organization.
          Ensure a <code>memberships</code> row links your <code>profiles(id)</code> (which must equal <code>auth.users(id)</code>)
          to the org used by rows in <code>buildings.org_id</code>.
        </p>
        <Link className="btn" href="/orgs/new">Create or switch organization</Link>
      </div>
    );
  }

return (
  <div className="p-6 space-y-6">
    {/* ===== Buildings header/actions ===== */}
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-semibold">Buildings</h1>
      <div className="flex flex-wrap items-center gap-2">
        <Link className="btn" href="/buildings/new">Add Building</Link>
        <button
          className="btn"
          disabled={!orgId || exporting}
          onClick={handleExport}
          title={!orgId ? "No organization detected yet" : "Download Portfolio Manager import template"}
        >
          {exporting ? "Preparing…" : "Export PM Template"}
        </button>
      </div>
    </div>

    {/* ===== Buildings list ===== */}
    {buildings.length === 0 ? (
      <div className="rounded-md border p-4 text-sm">
        No buildings yet. Click <span className="font-medium">Add Building</span> to create one.
      </div>
    ) : (
      <table className="min-w-full border-separate border-spacing-y-1">
        <thead>
          <tr>
            <th className="text-left px-2 py-1">Name</th>
            <th className="text-left px-2 py-1">Address</th>
            <th className="text-left px-2 py-1">Created</th>
          </tr>
        </thead>
        <tbody>
          {buildings.map((b) => (
            <tr key={b.id} className="bg-base-200">
              <td className="px-2 py-1">
                <Link href={`/buildings/${b.id}`} className="link font-medium">
                  {b.name}
                </Link>
              </td>
              <td className="px-2 py-1">{b.address || "—"}</td>
              <td className="px-2 py-1">
                <time dateTime={b.created_at}>
                  {new Date(b.created_at).toLocaleDateString()}
                </time>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}

    {/* ===== PM sync tools (toolbar) ===== */}
    <div className="pt-4 border-t mt-2">
      <h2 className="text-xl font-semibold mb-2">Portfolio Manager Meters</h2>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Sync Meters (Dry Run) */}
        <button
  type="button"
  className="btn"
  disabled={!orgId}
  onClick={async () => {
    if (!orgId) return;
    try {
      const url = `/api/pm/sync-meters?orgId=${encodeURIComponent(orgId)}&dry=1`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });

      // Hard fail on HTTP error
      if (!resp.ok) {
        alert(`Dry run failed (HTTP ${resp.status})`);
        return;
      }

      const json = await resp.json().catch(() => ({} as any));
      // accept multiple shapes: {rows:[]}, {preview:[]}, {data:[]}, [] 
      const rows =
        (Array.isArray(json) ? json : null) ??
        (Array.isArray(json?.rows) ? json.rows : null) ??
        (Array.isArray(json?.preview) ? json.preview : null) ??
        (Array.isArray(json?.data) ? json.data : null);

      if (!rows) {
        console.log("Dry run response (unexpected shape):", json);
        alert("Dry run returned no preview rows.");
        setMeterPreview([]); // or null depending on your render logic
        return;
      }

      setMeterPreview(rows);
    } catch (e: any) {
      alert(e?.message || "Dry run crashed.");
    }
  }}
>
  Sync Meters (Dry Run)
</button>


        {/* Create All on PM (Real) */}
        <button
          className="btn"
          disabled={!orgId || bulkCreating}
          title={!orgId ? "No organization detected yet" : "Create meters on ENERGY STAR Portfolio Manager"}
          onClick={async () => {
            if (!orgId) return;
            const confirmMsg =
              meterPreview.length > 0
                ? `Create ${meterPreview.length} meter${meterPreview.length === 1 ? "" : "s"} on PM?`
                : "Create all eligible meters on PM?";
            if (!window.confirm(confirmMsg)) return;

            setBulkCreating(true);
            try {
              const url = `/api/pm/sync-meters?orgId=${encodeURIComponent(orgId)}`;
              const resp = await fetch(url, { method: "POST" });
              const json = await resp.json().catch(() => ({}));

              if (!resp.ok || json.ok === false) {
                const msg = json?.error || `Bulk create failed (${resp.status})`;
                alert(
                  msg +
                    (Array.isArray(json?.errors) && json.errors.length
                      ? `\n\nDetails:\n${json.errors
                          .map((e: any) => `${e.meter_id}: ${e.error}`)
                          .join("\n")}`
                      : "")
                );
                return;
              }

              const made = typeof json?.count === "number" ? json.count : 0;
              alert(`Created ${made} meter${made === 1 ? "" : "s"} on PM.`);

              // Refresh preview after creation
              try {
                const dryUrl = `/api/pm/sync-meters?orgId=${encodeURIComponent(orgId)}&dry=1`;
                const dryResp = await fetch(dryUrl, { method: "POST" });
                const dryJson = await dryResp.json().catch(() => ({}));
                if (dryResp.ok && dryJson?.ok && Array.isArray(dryJson.preview)) {
                  setMeterPreview(dryJson.preview);
                }
              } catch { /* ignore */ }
            } catch (e: any) {
              alert(e?.message || "Bulk create crashed.");
            } finally {
              setBulkCreating(false);
            }
          }}
        >
          {bulkCreating ? "Creating…" : "Create All on PM"}
        </button>
      </div>

<pre className="text-xs opacity-60 max-h-40 overflow-auto">
  {JSON.stringify(meterPreview?.slice(0,3), null, 2)}
</pre>

      {/* PM preview table */}
      <div className="mt-4 w-full">
        {meterPreview.length === 0 ? (
          <div className="text-sm opacity-70">No meters pending. Run the dry run to preview.</div>
        ) : (
          <table className="min-w-full border-separate border-spacing-y-1">
            <thead>
              <tr>
                <th className="text-left px-2 py-1">Meter</th>
                <th className="text-left px-2 py-1">Fuel</th>
                <th className="text-left px-2 py-1">Building</th>
                <th className="text-left px-2 py-1">PM Property ID</th>
                <th className="text-right px-2 py-1">Actions</th>
              </tr>
            </thead>
         <tbody>
  {meterPreview.map((row) => {
    const displayFuel =
      row.fuel ?? row.utility ?? row?.pmPreview?.inferred?.fuel ?? null;
    const inferred = !row.fuel && !!row?.pmPreview?.inferred?.fuel;

    return (
      <tr key={row.meter_id} className="bg-base-200">
        <td className="px-2 py-1">
          <div className="font-medium">{row.meter_label || row.meter_id}</div>
          {row.meter_number ? (
            <div className="text-xs opacity-70">#{row.meter_number}</div>
          ) : null}
        </td>

        <td className="px-2 py-1">
  <div className="font-medium">
    {row.fuel ?? <span className="opacity-50">—</span>}
  </div>
  {inferred ? (
    <div className="text-xs badge badge-ghost mt-1">inferred</div>
  ) : null}
  {row.unit ? (
    <div className="text-xs opacity-70 mt-0.5">{row.unit}</div>
  ) : null}
</td>


        <td className="px-2 py-1">
          <div className="font-medium">{row.building_name}</div>
          <div className="text-xs opacity-70">{row.building_id}</div>
        </td>

        <td className="px-2 py-1">{row.pm_property_id || "-"}</td>
        <td className="px-2 py-1 text-right">
          <div className="flex items-center justify-end gap-2">
            {/* (button stays; see #2 below) */}

                      <button
                        className="btn btn-sm"
                        disabled={!orgId || busyId === row.meter_id || !row.pm_property_id || bulkCreating}
                        onClick={async () => {
                          if (!orgId) return;
                          setBusyId(row.meter_id);
                          try {
                            const url = `/api/pm/create-meter?orgId=${encodeURIComponent(
                              orgId
                            )}&pmPropertyId=${encodeURIComponent(String(row.pm_property_id))}`;
                            
 const fuelToSend =
  row.fuel ?? row.utility ?? row?.pmPreview?.inferred?.fuel ?? null;

const resp = await fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    meter_id: row.meter_id,
    meter_label: row.meter_label,
    fuel: fuelToSend,
  }),
});

                            const json = await resp.json().catch(() => ({}));
                            if (!resp.ok || json.ok === false) {
                              alert(json?.error || `Create failed (${resp.status})`);
                            } else {
                              setMeterPreview((prev) =>
                                prev.filter((m) => m.meter_id !== row.meter_id)
                              );
                            }
                          } catch (e: any) {
                            alert(e?.message || "Create crashed.");
                          } finally {
                            setBusyId(null);
                          }
                        }}
                      >
                        {busyId === row.meter_id ? "Creating..." : "Create on PM"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
})}
            </tbody>
          </table>
        )}
      </div>
    </div>
  </div>
);
}
