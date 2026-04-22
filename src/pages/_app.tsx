import { useState } from "react";
import type { AppProps } from "next/app";
import { SessionContextProvider } from "@supabase/auth-helpers-react";
import { createBrowserSupabaseClient } from "@supabase/auth-helpers-nextjs";
import type { Session } from "@supabase/supabase-js";
import { getPublicSupabaseEnv } from "@/lib/supabaseEnv";
import "../styles/globals.css";

export default function MyApp({ Component, pageProps }: AppProps) {
  const initialSession = (pageProps as { initialSession?: Session | null }).initialSession;
  const [supabaseClient] = useState(() => {
    const { anonKey, url } = getPublicSupabaseEnv();
    return createBrowserSupabaseClient({
      supabaseKey: anonKey,
      supabaseUrl: url,
    });
  });

  return (
    <SessionContextProvider
      supabaseClient={supabaseClient}
      initialSession={initialSession}
    >
      <Component {...pageProps} />
    </SessionContextProvider>
  );
}
