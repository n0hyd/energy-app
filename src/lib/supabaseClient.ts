// src/lib/supabaseClient.ts
"use client";

import { createBrowserSupabaseClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@/lib/types"; // keep/remove if you have DB types

// Singleton
let _sb:
  | ReturnType<typeof createBrowserSupabaseClient /* <Database> */>
  | null = null;

export const supabase =
  _sb ??
  (_sb = createBrowserSupabaseClient /* <Database> */({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  }));