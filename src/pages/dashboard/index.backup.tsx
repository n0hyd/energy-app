// src/pages/dashboard/index.tsx
import { GetServerSidePropsContext } from "next";
import Link from "next/link";
import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";

// Loose row shapes to avoid over-typing while MVP is moving fast
type Bill = {
  id: string;
  period_start: string;
  period_end: string;
  total_cost: number | null;
  demand_cost?: number | null;
  usage_kwh?: number | null;
  building_id?: string | null;
  bill_upload_id?: string | null;
  // nested (fallback to resolve building name via bill_uploads -> meters -> buildings)
  bill_uploads?: {
    meters?: {
      buildings?: { id: string; name: string } | null;
    } | null;
  } | null;
};

type Props = {
  latestBills: Array<
    Bill & {
      building_name?: string | null;
    }
  >;
};

export default function DashboardPage({ latestBills }: Props) {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="space-x-2">
          <Link href="/buildings" className="btn">Buildings</Link>
          <Link href="/uploads" className="btn">Uploads</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="text-sm text-gray-500">Total Bills (Last 10)</div>
          <div className="text-3xl font-bold">{latestBills.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-gray-500">Avg $/kWh (Last Bill)</div>
          <div className="text-3xl font-bold">
            {(() => {
              const last = latestBills[0];
              if (!last || last.total_cost == null || !last.usage_kwh || last.usage_kwh <= 0) return "—";
              return `$${(Number(last.total_cost) / Number(last.usage_kwh)).toFixed(4)}`;
            })()}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-gray-500">Demand % (Last Bill)</div>
          <div className="text-3xl font-bold">
            {(() => {
              const last = latestBills[0];
              if (!last || last.total_cost == null || !last.demand_cost || Number(last.total_cost) <= 0) return "—";
              return `${((Number(last.demand_cost) / Number(last.total_cost)) * 100).toFixed(1)}%`;
            })()}
          </div>
        </div>
      </div>

      <div className="card p-4">
        <h2 className="text-lg font-semibold mb-3">Latest Bills</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="px-4 py-2">Building</th>
                <th className="px-4 py-2">Billing Period</th>
                <th className="px-4 py-2">Usage (kWh)</th>
                <th className="px-4 py-2">Total Cost ($)</th>
                <th className="px-4 py-2">$ / kWh</th>
              </tr>
            </thead>
            <tbody>
              {latestBills.map((b) => {
                const buildingName =
                  b.building_name ??
                  b.bill_uploads?.meters?.buildings?.name ??
                  "—";
                const unit =
                  b.total_cost != null && b.usage_kwh && b.usage_kwh > 0
                    ? Number(b.total_cost) / Number(b.usage_kwh)
                    : undefined;
                return (
                  <tr key={b.id} className="border-b last:border-0">
                    <td className="px-4 py-3">{buildingName}</td>
                    <td className="px-4 py-3">
                      {new Date(b.period_start).toLocaleDateString()} –{" "}
                      {new Date(b.period_end).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {b.usage_kwh != null ? Math.round(Number(b.usage_kwh)).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {b.total_cost != null ? Number(b.total_cost).toFixed(2) : "—"}
                    </td>
                    <td className="px-4 py-3">{unit != null ? unit.toFixed(4) : "—"}</td>
                  </tr>
                );
              })}
              {latestBills.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-gray-500">
                    No bills yet. Add one from a building or the manual entry page.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export async function getServerSideProps(ctx: GetServerSidePropsContext) {
  const supabase = createPagesServerClient(ctx);
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return {
      redirect: { destination: "/auth/sign-in?redirect=/dashboard", permanent: false },
    };
  }

  // Fetch last 10 bills (newest first)
  const { data: billsRaw } = await supabase
    .from("bills")
    .select(`
      id,
      period_start,
      period_end,
      total_cost,
      demand_cost,
      building_id,
      bill_upload_id,
      bill_uploads (
        meters (
          buildings ( id, name )
        )
      )
    `)
    .order("period_end", { ascending: false })
    .limit(10);

  const billIds = (billsRaw ?? []).map((b: any) => b.id);
  let usageByBill = new Map<string, number>();

  if (billIds.length > 0) {
    const { data: readings } = await supabase
      .from("usage_readings")
      .select("bill_id,usage_kwh")
      .in("bill_id", billIds);

    (readings ?? []).forEach((r: any) => {
      usageByBill.set(r.bill_id, Number(r.usage_kwh));
    });
  }

  // Resolve building names (prefer direct `building_id` if your schema has it;
  // otherwise fall back to nested joins through bill_uploads → meters → buildings)
  let latestBills: Props["latestBills"] = (billsRaw ?? []).map((b: any) => ({
    ...b,
    usage_kwh: usageByBill.get(b.id) ?? null,
    building_name: b.buildings?.name ?? // if you later add a direct join
      b.bill_uploads?.meters?.buildings?.name ?? null,
  }));

  return {
    props: {
      latestBills,
      initialSession: session,
    },
  };
}
