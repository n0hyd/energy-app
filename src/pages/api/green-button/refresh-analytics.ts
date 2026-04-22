import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";

type Database = any;

type RefreshBody = {
  orgId?: string;
  buildingId?: string | null;
  strictLoadShape?: boolean;
};

type RefreshFailure = {
  step: string;
  message: string;
  code: string | null;
  details: string | null;
  hint: string | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const sessionSb = createPagesServerClient<Database>({ req, res });
  const {
    data: { user },
    error: authErr,
  } = await sessionSb.auth.getUser();
  if (authErr || !user) {
    return res.status(401).json({ ok: false, error: "Auth session missing" });
  }

  const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) as RefreshBody;
  const orgId = body?.orgId ?? null;
  const buildingId = body?.buildingId ?? null;
  const strictLoadShape = Boolean(body?.strictLoadShape);
  if (!orgId) {
    return res.status(400).json({ ok: false, error: "orgId is required" });
  }

  const userOrg = (user.user_metadata as { org_id?: string } | undefined)?.org_id ?? null;
  if (userOrg && userOrg !== orgId) {
    return res.status(403).json({ ok: false, error: "orgId does not match current user org" });
  }

  // Server-only service-role client. Never expose this configuration to the browser.
  const supabaseAdmin = createServiceRoleClient();

  const failures: RefreshFailure[] = [];
  const warnings: RefreshFailure[] = [];
  const results: Record<string, unknown> = {};
  const startedAt = Date.now();

  const runStep = async (step: string, fn: () => any) => {
    const { data, error } = await fn();
    if (error) {
      failures.push({
        step,
        message: error.message ?? `${step} failed`,
        code: error.code ?? null,
        details: error.details ?? null,
        hint: error.hint ?? null,
      });
      results[step] = { ok: false, error: error.message ?? `${step} failed` };
      return;
    }
    results[step] = data ?? { ok: true };
  };

  await runStep("monthly_peak_cache", () =>
    supabaseAdmin.rpc("refresh_green_button_monthly_peak_cache", {
      p_org_id: orgId,
      p_building_id: buildingId,
    })
  );
  await runStep("monthly_energy_mv", () => supabaseAdmin.rpc("refresh_green_button_monthly_energy_mv"));
  await runStep("monthly_top_peaks_mv", () => supabaseAdmin.rpc("refresh_green_button_monthly_top_peaks_mv"));
  await runStep("startup_intensity_mv", () =>
    supabaseAdmin.rpc("refresh_green_button_startup_intensity_monthly_mv")
  );
  await runStep("peak_timing_mv", () => supabaseAdmin.rpc("refresh_green_button_peak_timing_monthly_mv"));
  await runStep("after_hours_mv", () => supabaseAdmin.rpc("refresh_green_button_after_hours_load_monthly_mv"));
  await runStep("after_hours_pct_mv", () =>
    supabaseAdmin.rpc("refresh_green_button_after_hours_pct_monthly_mv")
  );
  await runStep("load_shape_cache", () =>
    supabaseAdmin.rpc("refresh_green_button_load_shape_monthly_cache_scoped", {
      p_org_id: orgId,
      p_building_id: buildingId,
      p_month_starts: null,
      p_expected_weekday_intervals: 0,
    })
  );
  const loadShapeStep = results["load_shape_cache"] as { ok?: boolean; error?: string } | undefined;
  const loadShapeFailureIdx = failures.findIndex((f) => f.step === "load_shape_cache");
  if (
    loadShapeFailureIdx >= 0 &&
    String(loadShapeStep?.error ?? "").toLowerCase().includes("statement timeout") &&
    !strictLoadShape
  ) {
    warnings.push(failures[loadShapeFailureIdx]);
    failures.splice(loadShapeFailureIdx, 1);
    results["load_shape_cache"] = {
      ok: false,
      warning: true,
      error: loadShapeStep?.error ?? "Load shape cache refresh timed out",
    };
  }
  await runStep("weekend_ops_mv", () => supabaseAdmin.rpc("refresh_green_button_weekend_ops_monthly_mv"));

  const durationMs = Date.now() - startedAt;
  if (failures.length > 0) {
    return res.status(500).json({
      ok: false,
      error: "One or more analytics refresh steps failed",
      orgId,
      buildingId,
      durationMs,
      failures,
      warnings,
      results,
    });
  }

  return res.status(200).json({
    ok: true,
    orgId,
    buildingId,
    warnings,
    warningCount: warnings.length,
    durationMs,
    results,
  });
}
