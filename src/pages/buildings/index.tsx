// /src/pages/buildings/index.tsx
import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient"; // ✅ singleton client

type Building = { 
  id: string; 
  name: string; 
  address: string | null;
  created_at: string 
};

export default function BuildingsPage() {
  const [loading, setLoading] = useState(true);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [rlsDenied, setRlsDenied] = useState(false);
  const redirected = useRef(false);

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

      // 2) Load buildings (now including address)
      const { data, error } = await supabase
        .from("buildings")
        .select("id,name,address,created_at")
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
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Buildings</h1>
        <Link href="/buildings/new" className="btn btn-primary">New Building</Link>
      </div>

      <div className="card p-4">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Address</th>
              <th className="px-4 py-2">Created</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {buildings.map((b) => (
              <tr key={b.id} className="border-b last:border-0">
                <td className="px-4 py-3">{b.name}</td>
                <td className="px-4 py-3">{b.address ?? "—"}</td>
                <td className="px-4 py-3">{new Date(b.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <Link href={`/buildings/${b.id}`} className="btn btn-sm">View</Link>
                </td>
              </tr>
            ))}
            {buildings.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-gray-500">No buildings yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
