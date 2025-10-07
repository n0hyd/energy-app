// src/pages/uploads/index.tsx
import { GetServerSidePropsContext } from "next";
import Link from "next/link";
import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";

type UploadRow = {
  id: string;
  status: "pending" | "entered" | "error";
  uploaded_at: string;
  storage_path: string;
  meters?: {
    buildings?: { id: string; name: string } | null;
  } | null;
};

type Props = {
  uploads: UploadRow[];
};

export default function UploadsPage({ uploads }: Props) {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Uploads</h1>
        <Link href="/bills/manual-entry">Add bills manually</Link>


      </div>

      <div className="card p-4">
        <h2 className="text-lg font-semibold mb-3">Recent Uploads</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="px-4 py-2">Building</th>
                <th className="px-4 py-2">File</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Uploaded</th>
                <th className="px-4 py-2">Open</th>
              </tr>
            </thead>
            <tbody>
              {uploads.map((u) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="px-4 py-3">{u.meters?.buildings?.name ?? "—"}</td>
                  <td className="px-4 py-3 font-mono truncate max-w-[260px]">
                    {u.storage_path}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${
                        u.status === "entered"
                          ? "bg-green-100 text-green-800"
                          : u.status === "pending"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {new Date(u.uploaded_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    {/* If you have an uploads detail route, wire it here */}
                    <Link
                      href={`/uploads/${u.meters?.buildings?.id ?? ""}?upload=${u.id}`}
                      className="btn btn-sm"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}

              {uploads.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-gray-500">
                    No uploads yet.
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
      redirect: { destination: "/auth/sign-in?redirect=/uploads", permanent: false },
    };
  }

  // Pull latest uploads (join through meters -> buildings for display)
  const { data: uploadsRaw } = await supabase
    .from("bill_uploads")
    .select(`
      id,
      status,
      uploaded_at,
      storage_path,
      meters (
        buildings ( id, name )
      )
    `)
    .order("uploaded_at", { ascending: false })
    .limit(20);

  return {
    props: {
      uploads: uploadsRaw ?? [],
      initialSession: session,
    },
  };
}
