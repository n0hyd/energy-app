import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function UploadForBuilding() {
  const { query } = useRouter();
  const buildingId = query.id as string | undefined;
  const passedMeter = (query.meter as string) || null;
  const [meterId, setMeterId] = useState<string | null>(passedMeter);

  useEffect(() => {
    if (!buildingId || meterId) return;
    (async () => {
      // find first meter for this building
      const { data, error } = await supabase
        .from("meters")
        .select("id")
        .eq("building_id", buildingId)
        .limit(1);
      if (!error && data && data.length) setMeterId(data[0].id);
    })();
  }, [buildingId, meterId]);

  if (!buildingId) return <main className="p-6">Loading…</main>;
  if (!meterId) return <main className="p-6">No meter found for this building. Create one first.</main>;

  // render your existing uploader here, pointed at meterId
  return (
    <main className="p-6">
      {/* <MultiPDFUpload meterId={meterId} buildingId={buildingId} /> */}
      Upload UI goes here (meter: {meterId})
    </main>
  );
}
