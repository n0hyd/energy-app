import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export interface BuildingOverviewRow {
  id: string;
  org_id: string;
  name: string;
  city: string | null;
  square_feet: number | null;
  last_bill_end: string | null;
  latest_cost: number | null;
  latest_kwh: number | null;
}

interface UseBuildingsOverviewResult {
  loading: boolean;
  rows: BuildingOverviewRow[] | null;
  error: string | null;
}

export function useBuildingsOverview(orgId: string | null): UseBuildingsOverviewResult {
  const [rows, setRows] = useState<BuildingOverviewRow[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // If we don't have an orgId yet, don't hit Supabase
      if (!orgId) {
        setRows([]);
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("buildings_overview")
        .select(
          "id, org_id, name, city, square_feet, last_bill_end, latest_cost, latest_kwh, mascot_url"
        )
        .eq("org_id", orgId)
        .order("name", { ascending: true });

      if (cancelled) return;

      if (error) {
        console.error("useBuildingsOverview error", error);
        setError(error.message);
        setRows(null);
      } else {
        setRows((data as BuildingOverviewRow[]) ?? []);
      }

      setLoading(false);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return { loading, rows, error };
}
