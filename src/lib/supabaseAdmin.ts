import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type ServerSupabaseEnv = {
  serviceRoleKey: string;
  url: string;
};

function ensureServerOnlyAccess() {
  if (typeof window !== "undefined") {
    throw new Error("Server-only Supabase configuration must never be used in the browser.");
  }
}

function getOptionalServerSupabaseEnv(): ServerSupabaseEnv | null {
  ensureServerOnlyAccess();

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return null;
  }

  return { serviceRoleKey, url };
}

export function getServerSupabaseEnv(): ServerSupabaseEnv {
  const env = getOptionalServerSupabaseEnv();
  if (!env) {
    throw new Error(
      "Missing required server-only Supabase environment variables: SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  return env;
}

// Server-only helper. Never import this into client-side code.
export function createServiceRoleClient(): SupabaseClient {
  const { serviceRoleKey, url } = getServerSupabaseEnv();
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Server-only helper. Returns null when env vars are intentionally absent.
export function createOptionalServiceRoleClient(): SupabaseClient | null {
  const env = getOptionalServerSupabaseEnv();
  if (!env) return null;
  return createClient(env.url, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
