// src/pages/buildings/[id].tsx
import { useRouter } from "next/router";
import * as React from "react";
import { supabase } from "@/lib/supabaseClient";

/* ---------------- Types ---------------- */
type Building = {
  id: string;
  name: string;
  // Address fields
  address: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  state_code: string | null;
  postal_code: string | null;

  // Core attrs
  square_feet: number | null;
  activity_code: string | null;

  // ENERGY STAR-related
  hours_of_operation: number | null;
  number_of_students: number | null;
  number_of_staff: number | null;
  year_built: number | null;
};

type FormState = {
  // text fields as strings for stable input control
  address: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  state_code: string;
  postal_code: string;

  square_feet: string;          // numeric-as-string in inputs
  activity_code: string;
  hours_of_operation: string;
  number_of_students: string;
  number_of_staff: string;
  year_built: string;
};

/* --------- Bills / Meters Types --------- */
type Meter = {
  id: string;
  building_id: string;
  utility: "electric" | "gas";
  type: string | null;
  label: string | null;
  created_at: string | null;
};

type Bill = {
  id: string;
  bill_upload_id: string | null;
  period_start: string; // ISO date
  period_end: string;   // ISO date
  total_cost: number | null;
  demand_cost: number | null;
  building_id: string;
  meter_id: string;
  created_at: string;
  utility_provider: string | null; // <-- used for grouping
};

type UsageReading = {
  id: string;
  bill_id: string;
  usage_kwh: number | null;
  therms: number | null;
  usage_mcf: number | null;
  usage_mmbtu: number | null;
};

type BillWithUsage = Bill & {
  usage?: UsageReading | null;
  meter?: Meter | null;
  bill_month?: string; // YYYY-MM-01
};

type BillMonth = {
  bill_month: string; // date (YYYY-MM-01)
};

/* --------- Activity Codes (unchanged) --------- */
/**
 * ENERGY STAR Portfolio Manager property types (Education) + common K-12 auxiliaries
 */
const ACTIVITY_CODES: { code: string; label: string }[] = [
{ code: "K-12 School", label: "K-12 School"},
{ code: "Financial Office", label: "Financial Office"},
{ code: "Food Service", label: "Food Service"},  
{ code: "Adult Education", label: "Adult Education"},
{ code: "Ambulatory Surgical Center", label: "Ambulatory Surgical Center"},
{ code: "Aquarium", label: "Aquarium"},
{ code: "Bank Branch", label: "Bank Branch"},
{ code: "Bar/Nightclub", label: "Bar/Nightclub"},
{ code: "Barracks", label: "Barracks"},
{ code: "Bowling Alley", label: "Bowling Alley"},
{ code: "Casino", label: "Casino"},
{ code: "College/University", label: "College/University"},
{ code: "Convenience Store with Gas Station", label: "Convenience Store with Gas Station"},
{ code: "Convenience Store without Gas Station", label: "Convenience Store without Gas Station"},
{ code: "Convention Center", label: "Convention Center"},
{ code: "Courthouse", label: "Courthouse"},
{ code: "Data Center", label: "Data Center"},
{ code: "Distribution Center", label: "Distribution Center"},
{ code: "Drinking Water Treatment & Distribution", label: "Drinking Water Treatment & Distribution"},
{ code: "Enclosed Mall", label: "Enclosed Mall"},
{ code: "Energy/Power Station", label: "Energy/Power Station"},
{ code: "Fast Food Restaurant", label: "Fast Food Restaurant"},
{ code: "Fire Station", label: "Fire Station"},
{ code: "Fitness Center/Health Club/Gym", label: "Fitness Center/Health Club/Gym"},
{ code: "Food Sales", label: "Food Sales"},,
{ code: "Hospital (General Medical & Surgical)", label: "Hospital (General Medical & Surgical)"},
{ code: "Hotel", label: "Hotel"},
{ code: "Ice/Curling Rink", label: "Ice/Curling Rink"},
{ code: "Indoor Arena", label: "Indoor Arena"},
{ code: "Laboratory", label: "Laboratory"},
{ code: "Library", label: "Library"},
{ code: "Lifestyle Center", label: "Lifestyle Center"},
{ code: "Mailing Center/Post Office", label: "Mailing Center/Post Office"},
{ code: "Manufacturing/Industrial Plant", label: "Manufacturing/Industrial Plant"},
{ code: "Medical Office", label: "Medical Office"},
{ code: "Movie Theater", label: "Movie Theater"},
];

/* ---------------- Small UI bits ---------------- */
const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <label className="block text-sm font-medium text-slate-700 mb-1">{children}</label>
);

const Hint: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="mt-1 text-xs text-slate-500">{children}</p>
);

/* --------- Focus-safe inputs (memoized) --------- */
type BaseInputProps = {
  name: keyof FormState;
  value: string;
  onChange: (name: keyof FormState, next: string) => void;
  placeholder?: string;
  step?: string;
  className?: string;
};

const TextInput = React.memo(function TextInput({
  name, value, onChange, placeholder, className,
}: BaseInputProps) {
  const autoId = React.useId();
  const id = `${name}-${autoId}`;

  const handleChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onChange(name, e.target.value),
    [name, onChange]
  );

  return (
    <input
      id={id}
      name={name}
      type="text"
      value={value ?? ""} // always controlled string
      onChange={handleChange}
      placeholder={placeholder}
      autoComplete="off"
      className={
        "w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none " +
        (className || "")
      }
    />
  );
});

const NumberInput = React.memo(function NumberInput({
  name, value, onChange, placeholder, step, className,
}: BaseInputProps) {
  const autoId = React.useId();
  const id = `${name}-${autoId}`;

  const handleChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      // Keep it as a string so users can type partial numbers like "-" or "1."
      onChange(name, e.target.value);
    },
    [name, onChange]
  );

  return (
    <input
      id={id}
      name={name}
      type="text"          // text to avoid browser coercion/blur on invalid partial numbers
      inputMode="numeric"  // still shows numeric keypad on mobile
      value={value ?? ""}
      onChange={handleChange}
      placeholder={placeholder}
      className={
        "w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none " +
        (className || "")
      }
      // keep step unused since type="text"; we parse on save
      aria-describedby={step ? `${id}-step` : undefined}
    />
  );
});

/* ---------------- Helpers for months ---------------- */
function yyyymmFirst(dateIso: string): string {
  const d = new Date(dateIso + "T00:00:00");
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}-01`;
}

function toMonthStart(s: string): string {
  if (!s) return "";
  // Accept "YYYY-MM" or "YYYY-MM-DD" (with or without zero padding)
  const m = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/.exec(s);
  if (!m) {
    // fallback: take first 7 chars if shaped like YYYY-MM*
    return s.slice(0, 7) + "-01";
  }
  const y = m[1];
  const mm = m[2].padStart(2, "0");
  return `${y}-${mm}-01`;
}


function fmtMonth(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short" });
}
function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString();
}
function num(n: number | null | undefined, frac = 2): string {
  if (n == null) return "—";
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: frac, maximumFractionDigits: frac });
}
/** Returns YYYY-MM-01 for the month containing the most days of the billing period */
function billMonthFromPeriod(period_start: string | Date, period_end: string | Date): string {
  const s = new Date(period_start);
  const e = new Date(period_end);

  // normalize to midnight UTC to avoid TZ drift
  const start = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()));
  const end   = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate()));

  // iterate month-by-month and compute day overlap
  const firstMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const lastMonth  = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));

  let cursor = new Date(firstMonth);
  let bestMonth = firstMonth;
  let bestDays = -1;

  while (cursor <= lastMonth) {
    const monthStart = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1));
    const monthEnd   = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)); // last day

    const overlapStart = new Date(Math.max(start.getTime(), monthStart.getTime()));
    const overlapEnd   = new Date(Math.min(end.getTime(), monthEnd.getTime()));
    const overlapDays  = overlapEnd >= overlapStart
      ? Math.round((overlapEnd.getTime() - overlapStart.getTime()) / 86400000) + 1
      : 0;

    if (overlapDays > bestDays) {
      bestDays = overlapDays;
      bestMonth = monthStart;
    }
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }

  return `${bestMonth.getUTCFullYear()}-${String(bestMonth.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/* ---------------- BillsTable (legacy – unused now but kept) ---------------- */
const BillsTable: React.FC<{
  title: string;
  months: BillMonth[];
  rowsByMonth: Map<string, BillWithUsage[]>;
  utility: "electric" | "gas";
}> = ({ title, months, rowsByMonth, utility }) => {
  const hasAny = months.some(m => (rowsByMonth.get(m.bill_month) || []).length > 0);
  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-slate-800 mb-3">{title}</h3>
      <div className="overflow-x-auto overflow-y-auto max-h-[70vh] rounded-lg border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-3 py-2 text-left">Bill Month</th>
              <th className="px-3 py-2 text-left">Meter</th>
              <th className="px-3 py-2 text-left">Period</th>
              <th className="px-3 py-2 text-right">Usage {utility === "electric" ? "(kWh)" : "(therms / MCF / MMBtu)"}</th>
              <th className="px-3 py-2 text-right">Total $</th>
              <th className="px-3 py-2 text-right">Demand $</th>
              <th className="px-3 py-2 text-right">$/kWh or Unit</th>
            </tr>
          </thead>
    {console.log("[ProviderBillsTable]", provider,
  "months", months.at(0)?.bill_month, "→", months.at(-1)?.bill_month,
  "count", months.length)}

      
<tbody className="divide-y divide-slate-100">
            {months.map((m) => {
              const bills = rowsByMonth.get(m.bill_month) || [];
              if (bills.length === 0) {
                return (
                  <tr key={m.bill_month} className="bg-amber-50">
                    <td className="px-3 py-2 font-medium text-amber-900">{fmtMonth(m.bill_month)}</td>
                    <td className="px-3 py-2 text-amber-900">—</td>
                    <td className="px-3 py-2 text-amber-900">—</td>
                    <td className="px-3 py-2 text-right text-amber-900">—</td>
                    <td className="px-3 py-2 text-right text-amber-900">—</td>
                    <td className="px-3 py-2 text-right text-amber-900">—</td>
                    <td className="px-3 py-2 text-right text-amber-900">Missing</td>
                  </tr>
                );
              }
              return bills.map((b) => {
                const usageElectric = b.usage?.usage_kwh ?? null;
                const usageGas =
                  b.usage?.therms ??
                  b.usage?.usage_mcf ??
                  b.usage?.usage_mmbtu ??
                  null;

                const unitCost =
                  b.total_cost != null
                    ? (utility === "electric"
                        ? (usageElectric && usageElectric > 0 ? b.total_cost / usageElectric : null)
                        : (usageGas && usageGas > 0 ? b.total_cost / usageGas : null))
                    : null;

                return (
                  <tr key={b.id}>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtMonth(m.bill_month)}</td>
                    {/* meter fallback: label → id → "—" */}
                    <td className="px-3 py-2">{b.meter?.label || b.meter?.id || "—"}</td>

                    <td className="px-3 py-2 whitespace-nowrap">
                      {fmtDate(b.period_start)} → {fmtDate(b.period_end)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {utility === "electric" ? num(usageElectric, 0) : num(usageGas, 2)}
                    </td>
                    <td className="px-3 py-2 text-right">{num(b.total_cost, 2)}</td>
                    <td className="px-3 py-2 text-right">{num(b.demand_cost, 2)}</td>
                    <td className="px-3 py-2 text-right">{unitCost == null ? "—" : num(unitCost, 4)}</td>
                  </tr>
                );
              });
            })}
            {!hasAny && (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={7}>
                  No {title.toLowerCase()} yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* ---------------- New: ProviderBillsTable with month grid ---------------- */
function ProviderBillsTable({
  provider,
  rows,
  months,
}: {
  provider: string;
  rows: BillWithUsage[];
  months: BillMonth[];
}) {
  // Group rows by YYYY-MM-01
  const byMonth = React.useMemo(() => {
    const map = new Map<string, BillWithUsage[]>();
    for (const b of rows) {
      const key = toMonthStart(b.bill_month ?? "");
      const arr = map.get(key) || [];
      arr.push(b);
      map.set(key, arr);
    }
    return map;
  }, [rows]);

  return (
    <div className="mt-8">
      <h3 className="text-base font-semibold text-slate-900">{provider}</h3>
      <p className="mt-1 text-sm text-slate-600">Sorted by bill month (oldest → newest).</p>

<div className="mt-4 overflow-x-auto overflow-y-auto max-h-[70vh] rounded-lg border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-700">Bill Month</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-700">Type</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-700">Meter</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-700">Period</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-700">Usage</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-slate-700">Total</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-slate-700">Demand $</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {months.map(({ bill_month }) => {
              const billsInMonth = byMonth.get(bill_month) || [];

              if (billsInMonth.length === 0) {
                // Gap row (missing month)
                return (
                  <tr key={bill_month} className="bg-amber-50">
                    <td className="px-3 py-2 text-sm font-medium text-amber-900">
                      {fmtMonth(bill_month)}
                    </td>
                    <td className="px-3 py-2 text-sm text-amber-900">—</td>
                    <td className="px-3 py-2 text-sm text-amber-900">—</td>
                    <td className="px-3 py-2 text-sm text-amber-900">—</td>
                    <td className="px-3 py-2 text-sm text-amber-900">Missing</td>
                    <td className="px-3 py-2 text-sm text-right text-amber-900">—</td>
                    <td className="px-3 py-2 text-sm text-right text-amber-900">—</td>
                  </tr>
                );
              }

              // Show all bills that fall in this month (usually 1, but we handle >1 just in case)
              return billsInMonth
                .sort((a, b) => (a.period_start || "").localeCompare(b.period_start || ""))
                .map((b) => {
                  // Prefer meter.type; fall back to usage shape; then default 'electric'
                  const meterType: "electric" | "gas" =
                    (b.meter?.type as "electric" | "gas") ??
                    (b.usage?.usage_kwh != null
                      ? "electric"
                      : (b.usage?.usage_mcf != null || b.usage?.usage_mmbtu != null || b.usage?.therms != null)
                        ? "gas"
                        : "electric");

                  // usage string by type
                  let usageStr = "—";
                  if (meterType === "electric") {
                    const v = b.usage?.usage_kwh ?? null;
                    usageStr = v != null ? `${num(v, 0)} kWh` : "—";
                  } else {
                    const mcf = b.usage?.usage_mcf ?? null;
                    const mmbtu = b.usage?.usage_mmbtu ?? null;
                    const th = b.usage?.therms ?? null;
                    usageStr =
                      mcf != null ? `${num(mcf, 2)} MCF` :
                      mmbtu != null ? `${num(mmbtu, 2)} MMBtu` :
                      th != null ? `${num(th, 2)} therms` : "—";
                  }

                  const isIncomplete =
                    (meterType === "electric" && (b.usage?.usage_kwh == null || b.total_cost == null)) ||
                    (meterType === "gas" && (b.usage?.usage_mcf == null && b.usage?.usage_mmbtu == null && b.usage?.therms == null));

                  return (
                    <tr key={b.id} className={isIncomplete ? "bg-yellow-50" : ""}>
                      <td className="px-3 py-2 text-sm text-slate-900">{fmtMonth(bill_month)}</td>
                      <td className="px-3 py-2 text-sm text-slate-700 capitalize">
                        {meterType}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700">
                        {b.meter?.label || b.meter?.id || "—"}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700">
                        {fmtDate(b.period_start)} → {fmtDate(b.period_end)}
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700">{usageStr}</td>
                      <td className="px-3 py-2 text-sm text-slate-700 text-right">{num(b.total_cost, 2)}</td>
                      <td className="px-3 py-2 text-sm text-slate-700 text-right">{num(b.demand_cost, 2)}</td>
                    </tr>
                  );
                });
            })}
            {months.length === 0 && (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={7}>
                  No bills for {provider}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- Page ---------------- */
export default function BuildingDetailPage() {
  const router = useRouter();
  const { id } = router.query;

  const [building, setBuilding] = React.useState<Building | null>(null);
  const [form, setForm] = React.useState<FormState | null>(null);

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // New: bills state
  const [meters, setMeters] = React.useState<Meter[]>([]);
  const [bills, setBills] = React.useState<BillWithUsage[]>([]);
  const [billMonths, setBillMonths] = React.useState<BillMonth[]>([]);
  const [loadingBills, setLoadingBills] = React.useState<boolean>(true);
  const [billsErr, setBillsErr] = React.useState<string | null>(null);

  // Load building once per id
  React.useEffect(() => {
    if (!id) return;
    let aborted = false;

    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("buildings")
        .select(
          [
            "id",
            "name",
            "address",
            "address_line1",
            "address_line2",
            "city",
            "state",
            "state_code",
            "postal_code",
            "square_feet",
            "activity_code",
            "hours_of_operation",
            "number_of_students",
            "number_of_staff",
            "year_built",
          ].join(",")
        )
        .eq("id", id)
        .single();

      if (aborted) return;

      if (error) {
        setError(error.message);
        setBuilding(null);
        setForm(null);
      } else {
        const b = data as Building;
        setBuilding(b);
        // Seed stable, string-only form state
        setForm({
          address: b.address ?? "",
          address_line1: b.address_line1 ?? "",
          address_line2: b.address_line2 ?? "",
          city: b.city ?? "",
          state: b.state ?? "",
          state_code: b.state_code ?? "",
          postal_code: b.postal_code ?? "",
          square_feet: b.square_feet == null ? "" : String(b.square_feet),
          activity_code: b.activity_code ?? "",
          hours_of_operation: b.hours_of_operation == null ? "" : String(b.hours_of_operation),
          number_of_students: b.number_of_students == null ? "" : String(b.number_of_students),
          number_of_staff: b.number_of_staff == null ? "" : String(b.number_of_staff),
          year_built: b.year_built == null ? "" : String(b.year_built),
        });
      }
      setLoading(false);
    })();

    return () => {
      aborted = true;
    };
  }, [id]);

  const onFormChange = React.useCallback(
    (name: keyof FormState, next: string) => {
      setForm((prev) => (prev ? { ...prev, [name]: next } : prev));
    },
    []
  );

  const handleSubmit = React.useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!building || !form) return;

      setSaving(true);
      setError(null);

      // Parse numbers safely (empty string → null)
      const toNum = (s: string): number | null =>
        s.trim() === "" ? null : Number(s);

      const payload = {
        address: form.address.trim() || null,
        address_line1: form.address_line1.trim() || null,
        address_line2: form.address_line2.trim() || null,
        city: form.city.trim() || null,
        state: form.state || null, // keep as-is (do not upper-case blindly)
        state_code:
          form.state_code && form.state_code.trim() !== ""
            ? form.state_code.trim().toUpperCase()
            : null,
        postal_code: form.postal_code.trim() || null,

        square_feet: toNum(form.square_feet),
        activity_code: form.activity_code || null,
        hours_of_operation: toNum(form.hours_of_operation),
        number_of_students: toNum(form.number_of_students),
        number_of_staff: toNum(form.number_of_staff),
        year_built: toNum(form.year_built),
      };

      if (payload.state_code && payload.state_code.length !== 2) {
        setSaving(false);
        setError("State Code must be 2 letters (e.g., KS).");
        return;
      }

      const { error } = await supabase
        .from("buildings")
        .update(payload)
        .eq("id", building.id);

      if (error) {
        setSaving(false);
        setError(error.message);
        return;
      }

      router.push("/buildings");
    },
    [building, form, router]
  );

  /* ---------------- Load meters, bills, usage, and bill_months ---------------- */
  React.useEffect(() => {
    if (!id) return;
    let aborted = false;

    (async () => {
      setLoadingBills(true);
      setBillsErr(null);
      try {
        // 1) Meters for this building (we need utility + label)
        const { data: meterRows, error: mErr } = await supabase
          .from("meters")
          .select("id, building_id, utility, type, label, created_at")
          .eq("building_id", id as string);

        if (mErr) throw mErr;
        const metersForBldg = (meterRows || []) as Meter[];
        if (aborted) return;
        setMeters(metersForBldg);

        const meterIds = metersForBldg.map(m => m.id);
        if (meterIds.length === 0) {
          // Still show empty month list if needed (no meters)
          setBills([]);
          setBillMonths([]);
          setLoadingBills(false);
          return;
        }

        // 2) Bills for those meters
        const { data: billRows, error: bErr } = await supabase
          .from("bills")
          .select("id, bill_upload_id, period_start, period_end, total_cost, demand_cost, building_id, meter_id, created_at, utility_provider")
          .in("meter_id", meterIds)
          .order("period_start", { ascending: true });

        if (bErr) throw bErr;
        const billsList = (billRows || []) as Bill[];

        // 3) Usage readings for those bills
        const billIds = billsList.map(b => b.id);
        let usageMap = new Map<string, UsageReading>();
        if (billIds.length > 0) {
          const { data: usageRows, error: uErr } = await supabase
            .from("usage_readings")
            .select("id, bill_id, usage_kwh, therms, usage_mcf, usage_mmbtu")
            .in("bill_id", billIds);
          if (uErr) throw uErr;
          for (const u of (usageRows || []) as UsageReading[]) {
            usageMap.set(u.bill_id, u);
          }
        }

        // 4) Merge bills + usage + meter + bill_month
        const meterMap = new Map(metersForBldg.map(m => [m.id, m]));
        const mergedRaw: BillWithUsage[] = billsList.map(b => ({
          ...b,
          usage: usageMap.get(b.id) || null,
          meter: meterMap.get(b.meter_id) || null,
          bill_month: billMonthFromPeriod(b.period_start, b.period_end),
        }));

        // (Belt & suspenders) de-dupe any repeated bills by id before proceeding
        const merged: BillWithUsage[] = Object.values(
          mergedRaw.reduce<Record<string, BillWithUsage>>((acc, row) => {
            acc[row.id] = row;
            return acc;
          }, {})
        );

        // Determine min/max month from found bills
const monthsFound = Array.from(new Set(merged.map(b => b.bill_month!))).sort();
let minMonth = monthsFound[0];
let maxMonth = monthsFound[monthsFound.length - 1];

// If no bills yet, don't query bill_months (shows empty)
let months: BillMonth[] = [];
if (minMonth && maxMonth) {
  // NEW: get the latest month available in bill_months
  const { data: maxRows, error: maxErr } = await supabase
    .from("bill_months")
    .select("bill_month")
    .order("bill_month", { ascending: false })
    .limit(1);
  if (maxErr) throw maxErr;

  const tableMax = maxRows?.[0]?.bill_month ?? maxMonth;

  // Build a continuous month grid from minMonth → tableMax on the client
const endMax = tableMax ?? maxMonth;
const start = new Date(minMonth + "T00:00:00Z");
const end   = new Date(endMax + "T00:00:00Z");

const mm: BillMonth[] = [];
let y = start.getUTCFullYear();
let m = start.getUTCMonth();
while (y < end.getUTCFullYear() || (y === end.getUTCFullYear() && m <= end.getUTCMonth())) {
  mm.push({ bill_month: `${y}-${String(m + 1).padStart(2, "0")}-01` });
  m++;
  if (m > 11) { m = 0; y++; }
}
months = mm;

console.log("[bills] grid", mm[0]?.bill_month, "→", mm.at(-1)?.bill_month, "count", mm.length);


}

if (aborted) return;
setBills(merged);
setBillMonths(months);



      } catch (e: any) {
        if (!aborted) setBillsErr(e?.message || "Failed to load bills.");
      } finally {
        if (!aborted) setLoadingBills(false);
      }
    })();

    return () => { aborted = true; };
  }, [id]);

  // Build provider → rows map (for single provider table)
  const billsByProvider = React.useMemo(() => {
    const map = new Map<string, BillWithUsage[]>();
    for (const b of bills) {
      const provider = b.utility_provider ?? "Unknown";
      const arr = map.get(provider) || [];
      arr.push(b);
      map.set(provider, arr);
    }
    return map;
  }, [bills]);

  // (kept) providersData is no longer used to render, but left in case you want the old two-table view
  const providersData = React.useMemo(() => {
    // Collect unique providers from merged bills
    const providers = Array.from(
      new Set((bills || []).map(b => (b.utility_provider ?? "Unknown")))
    ).sort();

    // Helper: given a subset of bills, make month maps (electric/gas)
    function byUtilityAndMonth(subset: BillWithUsage[]) {
      const eByMonth = new Map<string, BillWithUsage[]>();
      const gByMonth = new Map<string, BillWithUsage[]>();

      for (const b of subset) {
        const mKey = b.bill_month!;
        const util = (b.meter?.type ?? "").toLowerCase(); // "electric" | "gas"
        if (util === "electric") {
          const arr = eByMonth.get(mKey) || [];
          arr.push(b);
          eByMonth.set(mKey, arr);
        } else if (util === "gas") {
          const arr = gByMonth.get(mKey) || [];
          arr.push(b);
          gByMonth.set(mKey, arr);
        }
      }
      return { eByMonth, gByMonth };
    }

    // Reuse global month range (billMonths)
    const monthRange = billMonths;

    // Build a structure: [{ provider, months, electricByMonth, gasByMonth }]
    const out = providers.map(provider => {
      const subset = bills.filter(b => (b.utility_provider ?? "Unknown") === provider);
      const { eByMonth, gByMonth } = byUtilityAndMonth(subset);
      return {
        provider,
        months: monthRange,
        electricByMonth: eByMonth,
        gasByMonth: gByMonth,
      };
    });

    return out;
  }, [bills, billMonths]);

  if (loading) {
    return <div className="p-6 text-sm text-slate-600">Loading…</div>;
  }
  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-700">
          Error: {error}
        </div>
      </div>
    );
  }
  if (!building || !form) {
    return <div className="p-6 text-sm text-slate-600">No building found.</div>;
  }

  return (
    <div className="p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900">
            Edit Building: {building.name}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Update address, use details, and ENERGY STAR fields. Changes save to the{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5">buildings</code> table.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Canonical single-line address */}
          <div>
            <Label>Canonical Address</Label>
            <TextInput
              name="address"
              value={form.address}
              onChange={onFormChange}
              placeholder="3012 N TRIPLE CREEK DR"
            />
            <Hint>Used by bill ingest matching. Keep this a clean, single line.</Hint>
          </div>

          {/* Structured address */}
          <div>
            <h2 className="text-sm font-semibold text-slate-800 mb-3">
              Structured Address (optional)
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Address Line 1</Label>
                <TextInput
                  name="address_line1"
                  value={form.address_line1}
                  onChange={onFormChange}
                  placeholder="123 Main St"
                />
              </div>
              <div>
                <Label>Address Line 2</Label>
                <TextInput
                  name="address_line2"
                  value={form.address_line2}
                  onChange={onFormChange}
                  placeholder="Suite 200"
                />
              </div>
              <div>
                <Label>City</Label>
                <TextInput
                  name="city"
                  value={form.city}
                  onChange={onFormChange}
                  placeholder="Derby"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>State</Label>
                  <TextInput
                    name="state"
                    value={form.state}
                    onChange={onFormChange}
                    placeholder="KS"
                  />
                </div>
                <div>
                  <Label>State Code (2-letter)</Label>
                  <TextInput
                    name="state_code"
                    value={form.state_code}
                    onChange={onFormChange}
                    placeholder="KS"
                  />
                  <Hint>
                    Optional helper (we also store <code>state</code>).
                  </Hint>
                </div>
                <div>
                  <Label>Postal Code</Label>
                  <TextInput
                    name="postal_code"
                    value={form.postal_code}
                    onChange={onFormChange}
                    placeholder="67037"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Size / Type */}
          <div>
            <h2 className="text-sm font-semibold text-slate-800 mb-3">
              Size &amp; Use
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label>Square Feet</Label>
                <NumberInput
                  name="square_feet"
                  value={form.square_feet}
                  onChange={onFormChange}
                  placeholder="e.g. 85000"
                  step="1"
                />
              </div>
              <div>
                <Label>Activity Code (Portfolio Manager)</Label>
                <select
                  name="activity_code"
                  value={form.activity_code}
                  onChange={(e) => onFormChange("activity_code", e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">Select type</option>
                  {ACTIVITY_CODES.map((opt) => (
                    <option key={opt.code} value={opt.code}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <Hint>
                  Official ENERGY STAR property types.{" "}
                  <span className="whitespace-nowrap">K-12 School</span>{" "}
                  can receive a 1–100 ENERGY STAR score.
                </Hint>
              </div>
              <div>
                <Label>Year Built</Label>
                <NumberInput
                  name="year_built"
                  value={form.year_built}
                  onChange={onFormChange}
                  placeholder="e.g. 1998"
                  step="1"
                />
              </div>
            </div>
          </div>

          {/* ENERGY STAR use details */}
          <div>
            <h2 className="text-sm font-semibold text-slate-800 mb-3">
              ENERGY STAR – Use Details
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label>Hours of Operation</Label>
                <NumberInput
                  name="hours_of_operation"
                  value={form.hours_of_operation}
                  onChange={onFormChange}
                  placeholder="e.g. 60"
                  step="0.5"
                />
                <Hint>number of hours per week with at least one employee in building</Hint>
              </div>
              <div>
                <Label>Number of Students</Label>
                <NumberInput
                  name="number_of_students"
                  value={form.number_of_students}
                  onChange={onFormChange}
                  placeholder="e.g. 1200"
                  step="1"
                />
                <Hint># of students</Hint>
              </div>
              <div>
                <Label>Number of Staff</Label>
                <NumberInput
                  name="number_of_staff"
                  value={form.number_of_staff}
                  onChange={onFormChange}
                  placeholder="e.g. 110"
                  step="1"
                />
                <Hint>in building full time (not traveling staff)</Hint>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/buildings")}
              className="inline-flex items-center rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-200"
            >
              Cancel
            </button>
          </div>

          {/* Error (inline) */}
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-700">
              {error}
            </div>
          )}
        </form>

        {/* ---------------- Bills Section ---------------- */}
        <div className="mt-12">
          <h2 className="text-base font-semibold text-slate-900">Bills</h2>
          <p className="mt-1 text-sm text-slate-600">
            One table per provider. Mixed electric & gas with type and unit-aware usage. Sorted by bill month.
          </p>

          {loadingBills ? (
            <div className="mt-4 text-sm text-slate-600">Loading bills…</div>
          ) : billsErr ? (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-700">
              {billsErr}
            </div>
          ) : (
            <>
              {Array.from(billsByProvider.keys()).length === 0 ? (
                <div className="mt-4 text-sm text-slate-600">No bills yet.</div>
              ) : (
                Array.from(billsByProvider.entries()).map(([provider, rows]) => (
                  <ProviderBillsTable key={provider} provider={provider} rows={rows} months={billMonths} />
                ))
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
