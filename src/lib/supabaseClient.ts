// src/lib/supabaseClient.ts
"use client";

import { createBrowserSupabaseClient } from "@supabase/auth-helpers-nextjs";
import { getPublicSupabaseEnv } from "@/lib/supabaseEnv";

// Singleton
let _sb:
  | ReturnType<typeof createBrowserSupabaseClient /* <Database> */>
  | null = null;

export const supabase =
  _sb ??
  (() => {
    const { anonKey, url } = getPublicSupabaseEnv();
    _sb = createBrowserSupabaseClient /* <Database> */({
      supabaseKey: anonKey,
      supabaseUrl: url,
    });
    return _sb;
  })();
