// pages/api/pm/_getCreds.ts
import { createClient } from "@supabase/supabase-js";

export async function getPmCredsForOrg(org_id: string) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await supabase
    .from("org_integrations_pm")
    .select("base_url, username, password_enc")
    .eq("org_id", org_id)
    .single();
  if (error || !data) throw new Error("ENERGY STAR credentials not configured for this org");
  return {
    baseUrl: data.base_url,
    username: data.username,
    password: decrypt(data.password_enc),
  };
}

function decrypt(s: string) {
  // TODO: replace with your real decryption, e.g. using KMS/LibSodium.
  return s;
}
