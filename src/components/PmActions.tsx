// components/PmActions.tsx
import { useState } from "react";

export default function PmActions({ buildingId }: { buildingId: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function call(path: string, init?: RequestInit) {
    setBusy(path);
    setMsg(null);
    try {
      const res = await fetch(path, init);
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || res.statusText);
      setMsg(JSON.stringify(json));
    } catch (e: any) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex gap-2 items-center">
      <button
        className="px-3 py-2 rounded border"
        disabled={!!busy}
        onClick={() => call(`/api/pm/create-property?buildingId=${buildingId}`)}
      >
        {busy ? "Working..." : "Create in ENERGY STAR"}
      </button>

      <button
        className="px-3 py-2 rounded border"
        disabled={!!busy}
        onClick={() => call(`/api/pm/create-meter`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ buildingId, type: "electric", units: "kWh" }),
        })}
      >
        {busy ? "Working..." : "Add Electric Meter (kWh)"}
      </button>

      <button
        className="px-3 py-2 rounded border"
        disabled={!!busy}
        onClick={() => call(`/api/pm/create-meter`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ buildingId, type: "gas", units: "MCF" }),
        })}
      >
        {busy ? "Working..." : "Add Gas Meter (MCF)"}
      </button>

      {msg && <pre className="text-xs bg-slate-50 p-2 rounded">{msg}</pre>}
    </div>
  );
}
