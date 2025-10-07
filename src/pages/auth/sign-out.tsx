import { useEffect } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function SignOutPage() {
  useEffect(() => {
    async function doSignOut() {
      await supabase.auth.signOut();
      window.location.href = "/auth/sign-in"; // redirect to sign-in after logout
    }
    doSignOut();
  }, []);

  return <p style={{ padding: 40 }}>Signing out…</p>;
}
