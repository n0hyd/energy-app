// src/lib/apiFetch.ts
"use client";

import { supabase } from "@/lib/supabaseClient";

/**
 * fetch() wrapper that always:
 *  - reads the current Supabase session from the cookie-aware client
 *  - attaches Authorization: Bearer <access_token> when available
 *  - keeps cookies with credentials: "include"
 */
export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  // Obtain session from cookie-backed client
  const { data: { session } } = await supabase.auth.getSession();

  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  return fetch(input, {
    ...init,
    headers,
    credentials: "include",
  });
}
