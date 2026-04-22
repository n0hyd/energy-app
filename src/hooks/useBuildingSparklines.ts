import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

interface BuildingSparklineRow {
  org_id: string;
  building_id: string;
  kbtu_values: number[] | null;
}

interface UseBuildingSparklinesResult {
  sparklinesByBuildingId: Record<string, number[]>;
  loading: boolean;
  error: string | null;
}

export function useBuildingSparklines(
  orgId: string | null
): UseBuildingSparklinesResult {
  const [sparklinesByBuildingId, setSparklinesByBuildingId] = useState<
    Record<string, number[]>
  >({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!orgId) {
        setSparklinesByBuildingId({});
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("building_usage_sparkline")
        .select("building_id, kbtu_values")
        .eq("org_id", orgId);

      if (cancelled) return;

      if (error) {
        console.error("useBuildingSparklines error", error);
        setError(error.message);
        setSparklinesByBuildingId({});
      } else {
        const rows = (data as BuildingSparklineRow[]) ?? [];
        const map: Record<string, number[]> = {};

        for (const row of rows) {
          if (row.kbtu_values && row.kbtu_values.length > 0) {
            map[row.building_id] = row.kbtu_values;
          }
        }

        setSparklinesByBuildingId(map);
      }

      setLoading(false);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return { sparklinesByBuildingId, loading, error };
}
