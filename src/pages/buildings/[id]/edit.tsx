import { useRouter } from "next/router";
import * as React from "react";
import { supabase } from "@/lib/supabaseClient";

/* ---------------- Types ---------------- */
type Building = {
  id: string;
  name: string;

  address: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  state_code: string | null;
  postal_code: string | null;

  square_feet: number | null;
  activity_code: string | null;

  hours_of_operation: number | null;
  number_of_students: number | null;
  number_of_staff: number | null;
  year_built: number | null;

  // NEW: mascot image URL
  mascot_url: string | null;
};

type FormState = {
  address: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  state_code: string;
  postal_code: string;

  square_feet: string;
  activity_code: string;
  hours_of_operation: string;
  number_of_students: string;
  number_of_staff: string;
  year_built: string;
};

/* --------- Property Type List --------- */
const ACTIVITY_CODES: { code: string; label: string }[] = [
  { code: "K-12 School", label: "K-12 School" },
  { code: "Financial Office", label: "Financial Office" },
  { code: "Food Service", label: "Food Service" },
  { code: "Adult Education", label: "Adult Education" },
  { code: "Ambulatory Surgical Center", label: "Ambulatory Surgical Center" },
  { code: "Aquarium", label: "Aquarium" },
  { code: "Bank Branch", label: "Bank Branch" },
  { code: "Bar/Nightclub", label: "Bar/Nightclub" },
  { code: "Barracks", label: "Barracks" },
  { code: "Bowling Alley", label: "Bowling Alley" },
  { code: "Casino", label: "Casino" },
  { code: "College/University", label: "College/University" },
  { code: "Convenience Store with Gas Station", label: "Convenience Store with Gas Station" },
  { code: "Convenience Store without Gas Station", label: "Convenience Store without Gas Station" },
  { code: "Convention Center", label: "Convention Center" },
  { code: "Courthouse", label: "Courthouse" },
  { code: "Data Center", label: "Data Center" },
  { code: "Distribution Center", label: "Distribution Center" },
  { code: "Drinking Water Treatment & Distribution", label: "Drinking Water Treatment & Distribution" },
  { code: "Enclosed Mall", label: "Enclosed Mall" },
  { code: "Energy/Power Station", label: "Energy/Power Station" },
  { code: "Fast Food Restaurant", label: "Fast Food Restaurant" },
  { code: "Fire Station", label: "Fire Station" },
  { code: "Fitness Center/Health Club/Gym", label: "Fitness Center/Health Club/Gym" },
  { code: "Food Sales", label: "Food Sales" },
  { code: "Hospital (General Medical & Surgical)", label: "Hospital (General Medical & Surgical)" },
  { code: "Hotel", label: "Hotel" },
  { code: "Ice/Curling Rink", label: "Ice/Curling Rink" },
  { code: "Indoor Arena", label: "Indoor Arena" },
  { code: "Laboratory", label: "Laboratory" },
  { code: "Library", label: "Library" },
  { code: "Lifestyle Center", label: "Lifestyle Center" },
  { code: "Mailing Center/Post Office", label: "Mailing Center/Post Office" },
  { code: "Manufacturing/Industrial Plant", label: "Manufacturing/Industrial Plant" },
  { code: "Medical Office", label: "Medical Office" },
  { code: "Movie Theater", label: "Movie Theater" },
];

/* ---------------- Small UI Bits ---------------- */
const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <label className="block text-sm font-medium text-slate-700 mb-1">{children}</label>
);

const Hint: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="mt-1 text-xs text-slate-500">{children}</p>
);

const TextInput = React.memo(function TextInput({
  name,
  value,
  onChange,
  placeholder,
}: {
  name: keyof FormState;
  value: string;
  onChange: (name: keyof FormState, v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      name={name}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(name, e.target.value)}
      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
    />
  );
});

const NumberInput = React.memo(function NumberInput({
  name,
  value,
  onChange,
  placeholder,
}: {
  name: keyof FormState;
  value: string;
  onChange: (name: keyof FormState, v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      name={name}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(name, e.target.value)}
      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
    />
  );
});

/* ---------------- Page ---------------- */
export default function EditBuildingPage() {
  const router = useRouter();
  const { id } = router.query;

  const [building, setBuilding] = React.useState<Building | null>(null);
  const [form, setForm] = React.useState<FormState | null>(null);

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // NEW: mascot upload state
  const [mascotFile, setMascotFile] = React.useState<File | null>(null);
  const [mascotPreview, setMascotPreview] = React.useState<string | null>(null);

  /* ---- Load building data ---- */
  React.useEffect(() => {
    if (!id) return;

    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("buildings")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      const b = data as Building;
      setBuilding(b);

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

      // NEW: seed mascot preview from existing value
      setMascotPreview(b.mascot_url ?? null);

      setLoading(false);
    })();
  }, [id]);

  const onFormChange = (name: keyof FormState, v: string) => {
    setForm((prev) => (prev ? { ...prev, [name]: v } : prev));
  };

  // NEW: mascot change handler
  const handleMascotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setMascotFile(file);

    if (file) {
      const objectUrl = URL.createObjectURL(file);
      setMascotPreview(objectUrl);
    }
  };

  /* ---- Save form ---- */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || !building) return;

    setSaving(true);
    setError(null);

    const toNum = (s: string) => (s.trim() === "" ? null : Number(s));

    const payload: any = {
      address: form.address.trim() || null,
      address_line1: form.address_line1.trim() || null,
      address_line2: form.address_line2.trim() || null,
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      state_code: form.state_code.trim().toUpperCase() || null,
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
      setError("State Code must be 2 letters.");
      return;
    }

    // NEW: upload mascot (if user selected a file)
    let mascotUrl: string | null = building.mascot_url ?? null;

    if (mascotFile) {
      const ext = mascotFile.name.split(".").pop() || "png";
      const filePath = `building-${building.id}/mascot-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("mascots") // make sure this bucket exists
        .upload(filePath, mascotFile, { upsert: true });

      if (uploadError) {
        setSaving(false);
        setError(`Error uploading mascot: ${uploadError.message}`);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from("mascots")
        .getPublicUrl(filePath);

      mascotUrl = publicUrlData.publicUrl;
    }

    // include mascot_url in payload
    payload.mascot_url = mascotUrl;

    const { error } = await supabase
      .from("buildings")
      .update(payload)
      .eq("id", building.id);

    if (error) {
      setSaving(false);
      setError(error.message);
      return;
    }

    router.push(`/buildings/${building.id}`);
  };

  /* ---- Loading / Error States ---- */
  if (loading) return <div className="p-6 text-sm">Loading…</div>;
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;
  if (!form || !building) return <div className="p-6">No building found.</div>;

  /* ---- Render ---- */
  return (
    <div className="p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900">
            Edit Building: {building.name}
          </h1>

          <p className="mt-1 text-sm text-slate-600">
            Update address, size, ENERGY STAR attributes, and mascot logo.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Canonical Address */}
          <div>
            <Label>Canonical Address</Label>
            <TextInput
              name="address"
              value={form.address}
              onChange={onFormChange}
              placeholder="3012 N TRIPLE CREEK DR"
            />
            <Hint>Used for bill matching. Keep it a single clean line.</Hint>
          </div>

          {/* Structured Address */}
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

          {/* Size & Use */}
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
                  placeholder="85000"
                />
              </div>

              <div>
                <Label>Activity Code</Label>
                <select
                  name="activity_code"
                  value={form.activity_code}
                  onChange={(e) =>
                    onFormChange("activity_code", e.target.value)
                  }
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">Select type</option>
                  {ACTIVITY_CODES.map((opt) => (
                    <option key={opt.code} value={opt.code}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Year Built</Label>
                <NumberInput
                  name="year_built"
                  value={form.year_built}
                  onChange={onFormChange}
                  placeholder="1998"
                />
              </div>
            </div>
          </div>

          {/* ENERGY STAR Details */}
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
                  placeholder="60"
                />
              </div>

              <div>
                <Label>Number of Students</Label>
                <NumberInput
                  name="number_of_students"
                  value={form.number_of_students}
                  onChange={onFormChange}
                  placeholder="1200"
                />
              </div>

              <div>
                <Label>Number of Staff</Label>
                <NumberInput
                  name="number_of_staff"
                  value={form.number_of_staff}
                  onChange={onFormChange}
                  placeholder="100"
                />
              </div>
            </div>
          </div>

          {/* Mascot Logo */}
          <div>
            <h2 className="text-sm font-semibold text-slate-800 mb-3">
              Mascot Logo (optional)
            </h2>

            <div className="flex items-start gap-4">
              <div className="w-32 h-32 rounded-md border border-dashed border-slate-300 flex items-center justify-center overflow-hidden bg-slate-50">
                {mascotPreview ? (
                  <img
                    src={mascotPreview}
                    alt={`${building.name} mascot`}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-slate-400 text-center px-2">
                    No mascot uploaded
                  </span>
                )}
              </div>

              <div className="flex-1">
                <Label>Upload Mascot Image</Label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleMascotChange}
                  className="block w-full text-sm text-slate-700
                             file:mr-4 file:rounded-md file:border-0
                             file:bg-indigo-600 file:px-3 file:py-1.5
                             file:text-sm file:font-medium file:text-white
                             hover:file:bg-indigo-700"
                />
                <Hint>
                  Recommended: square PNG or JPG. This will be shown on building cards and detail pages.
                </Hint>
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
              onClick={() => router.push(`/buildings/${building.id}`)}
              className="inline-flex items-center rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-200"
            >
              Cancel
            </button>
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-700">
              {error}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
