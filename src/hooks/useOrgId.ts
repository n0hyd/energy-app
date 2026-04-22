// hooks/useOrgId.ts
import { useSession, useSupabaseClient } from "@supabase/auth-helpers-react";
import { useEffect, useState } from "react";

export function useOrgId() {
  const session = useSession();
  const sb = useSupabaseClient();
  const [orgId, setOrgId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!session?.user?.id) return setOrgId(null);
      const { data, error } = await sb
        .from("memberships")
        .select("org_id, is_default")
        .eq("profile_id", session.user.id)
        .order("is_default", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) { setOrgId(null); return; }
      setOrgId(data?.org_id ?? null);
    })();
  }, [session?.user?.id]);

  return orgId;
}
