import React from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type BuildingRow = Record<string, unknown>;
type EditableValuesById = Record<string, Record<string, string>>;
type SavingById = Record<string, boolean>;
type ErrorById = Record<string, string | null>;
type SuccessById = Record<string, string | null>;
type FieldType = "number" | "boolean" | "string" | "unknown";
const HEAT_TYPE_OPTIONS = ["gas", "electric", "other"] as const;
const HVAC_PRIMARY_OPTIONS = [
  { label: "Rooftop Units (RTU)", value: "RTU" },
  { label: "Rooftop Units with Dedicated Outdoor Air System", value: "RTU_DOAS" },
  { label: "Central Air Handler with VAV Distribution", value: "AHU_VAV" },
  { label: "VAV System with Chilled Water Plant", value: "VAV_CHILLED_WATER" },
  { label: "Unit Ventilator System", value: "UNIT_VENTILATOR" },
  { label: "Fan Coil Units with Central Plant", value: "FAN_COIL_PLANT" },
  { label: "Variable Refrigerant Flow System", value: "VRF" },
  { label: "Water Source Heat Pump Loop", value: "WATER_SOURCE_HEAT_PUMP" },
  { label: "Ground Source Heat Pump (Geothermal)", value: "GROUND_SOURCE_HEAT_PUMP" },
  { label: "DOAS with Radiant or Chilled Beam System", value: "DOAS_RADIANT" },
] as const;
const HVAC_DISTRIBUTION_OPTIONS = [
  { label: "Variable Air Volume (VAV)", value: "VAV" },
  { label: "Constant Air Volume (CAV)", value: "CAV" },
  { label: "Hydronic Water Distribution", value: "HYDRONIC" },
  { label: "Direct Refrigerant Distribution", value: "REFRIGERANT" },
  { label: "Radiant Heating or Cooling Distribution", value: "RADIANT" },
  { label: "Air and Water Hybrid Distribution", value: "AIR_WATER" },
  { label: "Dedicated Outdoor Air Ventilation Distribution", value: "DOAS" },
  { label: "Unit Ventilator Classroom Distribution", value: "UNIT_VENT" },
  { label: "Fan Coil Distribution", value: "FAN_COIL" },
  { label: "Heat Pump Zone Distribution", value: "HEAT_PUMP_ZONE" },
] as const;

function toInputValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function detectTypeForColumn(rows: BuildingRow[], key: string): FieldType {
  for (const row of rows) {
    const value = row[key];
    if (typeof value === "number") return "number";
    if (typeof value === "boolean") return "boolean";
    if (typeof value === "string") return "string";
  }
  return "unknown";
}

function normalizeForDb(raw: string, type: FieldType, key: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  if (key === "hvac_primary") {
    const allowed = new Set(HVAC_PRIMARY_OPTIONS.map((o) => o.value));
    return allowed.has(trimmed) ? trimmed : null;
  }

  if (key === "hvac_distribution_type") {
    const allowed = new Set(HVAC_DISTRIBUTION_OPTIONS.map((o) => o.value));
    return allowed.has(trimmed) ? trimmed : null;
  }

  if (key === "heat_type") {
    const normalized = trimmed.toLowerCase();
    return HEAT_TYPE_OPTIONS.includes(normalized as (typeof HEAT_TYPE_OPTIONS)[number])
      ? normalized
      : "other";
  }

  if (type === "number") {
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : trimmed;
  }

  if (type === "boolean") {
    const lower = trimmed.toLowerCase();
    if (lower === "true" || lower === "1" || lower === "yes") return true;
    if (lower === "false" || lower === "0" || lower === "no") return false;
    return trimmed;
  }

  return raw;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export default function BulkUpdateBuildingsPage() {
  const [rows, setRows] = React.useState<BuildingRow[]>([]);
  const [valuesById, setValuesById] = React.useState<EditableValuesById>({});
  const [fieldTypes, setFieldTypes] = React.useState<Record<string, FieldType>>({});
  const [loading, setLoading] = React.useState(true);
  const [pageError, setPageError] = React.useState<string | null>(null);
  const [savingById, setSavingById] = React.useState<SavingById>({});
  const [errorById, setErrorById] = React.useState<ErrorById>({});
  const [successById, setSuccessById] = React.useState<SuccessById>({});

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      setPageError(null);

      const { data, error } = await supabase
        .from("buildings")
        .select("*")
        .order("name", { ascending: true });

      if (error) {
        setPageError(error.message);
        setLoading(false);
        return;
      }

      const fetchedRows = (data ?? []) as BuildingRow[];
      setRows(fetchedRows);

      const editable: EditableValuesById = {};
      for (const row of fetchedRows) {
        const id = String(row.id ?? "");
        if (!id) continue;
        editable[id] = {};
        for (const [key, value] of Object.entries(row)) {
          editable[id][key] = toInputValue(value);
        }
      }
      setValuesById(editable);

      if (fetchedRows.length > 0) {
        const typeMap: Record<string, FieldType> = {};
        for (const key of Object.keys(fetchedRows[0])) {
          typeMap[key] = detectTypeForColumn(fetchedRows, key);
        }
        setFieldTypes(typeMap);
      } else {
        setFieldTypes({});
      }

      setLoading(false);
    })();
  }, []);

  const orderedKeys = React.useMemo(() => {
    if (!rows.length) return [] as string[];
    return Object.keys(rows[0]);
  }, [rows]);

  const editableKeys = React.useMemo(
    () => orderedKeys.filter((k) => k !== "id"),
    [orderedKeys]
  );

  const onFieldChange = (id: string, key: string, value: string) => {
    setValuesById((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ?? {}),
        [key]: value,
      },
    }));
    setSuccessById((prev) => ({ ...prev, [id]: null }));
  };

  const getChangedPayload = (row: BuildingRow): Record<string, unknown> => {
    const id = String(row.id ?? "");
    const current = valuesById[id] ?? {};
    const payload: Record<string, unknown> = {};

    for (const key of editableKeys) {
      const normalized = normalizeForDb(current[key] ?? "", fieldTypes[key] ?? "unknown", key);
      if (!valuesEqual(normalized, row[key])) {
        payload[key] = normalized;
      }
    }
    return payload;
  };

  const saveRow = async (row: BuildingRow) => {
    const id = String(row.id ?? "");
    if (!id) return;

    const changedPayload = getChangedPayload(row);
    if (Object.keys(changedPayload).length === 0) {
      setSuccessById((prev) => ({ ...prev, [id]: "No changes to save." }));
      setErrorById((prev) => ({ ...prev, [id]: null }));
      return;
    }

    setSavingById((prev) => ({ ...prev, [id]: true }));
    setErrorById((prev) => ({ ...prev, [id]: null }));
    setSuccessById((prev) => ({ ...prev, [id]: null }));

    const { error } = await supabase
      .from("buildings")
      .update(changedPayload)
      .eq("id", id);

    if (error) {
      setSavingById((prev) => ({ ...prev, [id]: false }));
      setErrorById((prev) => ({ ...prev, [id]: error.message }));
      return;
    }

    const updatedRow = { ...row, ...changedPayload };
    setRows((prev) => prev.map((r) => (String(r.id ?? "") === id ? updatedRow : r)));
    setSavingById((prev) => ({ ...prev, [id]: false }));
    setSuccessById((prev) => ({ ...prev, [id]: "Saved." }));
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Bulk Update Buildings</h1>
            <p className="mt-1 text-sm text-gray-600">
              Edit any building field, then save per building row.
            </p>
          </div>
          <Link
            href="/admin"
            className="inline-flex px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          >
            Back to Admin
          </Link>
        </div>

        {loading && <div className="text-sm text-gray-600">Loading buildings...</div>}
        {pageError && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{pageError}</div>}
        {!loading && !pageError && rows.length === 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
            No building rows found.
          </div>
        )}

        {!loading && !pageError && rows.length > 0 && (
          <div className="space-y-4">
            {rows.map((row) => {
              const id = String(row.id ?? "");
              const changedCount = Object.keys(getChangedPayload(row)).length;
              const isSaving = Boolean(savingById[id]);

              return (
                <section key={id} className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">
                        {String((valuesById[id]?.name ?? row.name ?? "Unnamed Building") || "Unnamed Building")}
                      </h2>
                      <p className="text-xs text-gray-500">ID: {id}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-600">
                        {changedCount} field{changedCount === 1 ? "" : "s"} changed
                      </span>
                      <button
                        type="button"
                        onClick={() => void saveRow(row)}
                        disabled={isSaving}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {isSaving ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>

                  {errorById[id] && (
                    <p className="mb-3 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
                      {errorById[id]}
                    </p>
                  )}
                  {successById[id] && !errorById[id] && (
                    <p className="mb-3 rounded border border-green-200 bg-green-50 px-2 py-1 text-xs text-green-700">
                      {successById[id]}
                    </p>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {editableKeys.map((key) => (
                      <label key={`${id}-${key}`} className="block">
                        <span className="mb-1 block text-xs font-medium text-gray-700">{key}</span>
                        {key === "hvac_primary" ? (
                          <select
                            value={valuesById[id]?.[key] ?? ""}
                            onChange={(e) => onFieldChange(id, key, e.target.value)}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                          >
                            <option value="">Select primary HVAC type</option>
                            {HVAC_PRIMARY_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        ) : key === "hvac_distribution_type" ? (
                          <select
                            value={valuesById[id]?.[key] ?? ""}
                            onChange={(e) => onFieldChange(id, key, e.target.value)}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                          >
                            <option value="">Select HVAC distribution type</option>
                            {HVAC_DISTRIBUTION_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        ) : key === "heat_type" ? (
                          <select
                            value={valuesById[id]?.[key] ?? ""}
                            onChange={(e) => onFieldChange(id, key, e.target.value)}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                          >
                            <option value="">Select heat type</option>
                            <option value="gas">gas</option>
                            <option value="electric">electric</option>
                            <option value="other">other</option>
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={valuesById[id]?.[key] ?? ""}
                            onChange={(e) => onFieldChange(id, key, e.target.value)}
                            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                          />
                        )}
                      </label>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
