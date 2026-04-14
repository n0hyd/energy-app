import { useState } from "react";
import type { AppProps } from "next/app";
import { SessionContextProvider } from "@supabase/auth-helpers-react";
import { createBrowserSupabaseClient } from "@supabase/auth-helpers-nextjs";
import "../styles/globals.css"; // ✅ make sure this path matches your project

export default function MyApp({ Component, pageProps }: AppProps) {
  const [supabaseClient] = useState(() => createBrowserSupabaseClient());

  return (
    <SessionContextProvider
      supabaseClient={supabaseClient}
      initialSession={(pageProps as any).initialSession}
    >
      <Component {...pageProps} />
    </SessionContextProvider>
  );
}
