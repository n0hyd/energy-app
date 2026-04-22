import { createServiceRoleClient } from "@/lib/supabaseAdmin";

export async function getPmCredsForOrg(orgId: string) {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("org_integrations_pm")
    .select("base_url, username, password_enc")
    .eq("org_id", orgId)
    .single();

  if (error || !data) {
    throw new Error("ENERGY STAR credentials not configured for this org");
  }

  return {
    baseUrl: data.base_url,
    username: data.username,
    password: decrypt(data.password_enc),
  };
}

function decrypt(value: string) {
  // TODO: replace with your real decryption, e.g. using KMS/LibSodium.
  return value;
}
