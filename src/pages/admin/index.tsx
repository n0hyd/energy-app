import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Flame, Zap } from "lucide-react";

type AdminJobKey =
  | "evergy-bills"
  | "evergy-green-button"
  | "kgs-bills"
  | "woodriver-bills";

type JobStatus = {
  key: AdminJobKey;
  provider: string;
  action: string;
  scriptName: string;
  running: boolean;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastOutputLine: string | null;
  outputFolderPath: string;
  latestOutputLabel: string | null;
  outputCount: number | null;
};

type JobLogRow = {
  time: string;
  scriptName: string;
  result: "success" | "fail";
  message: string;
};

type JobsResponse = {
  statuses: JobStatus[];
  logs: JobLogRow[];
};

function toMonthValue(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

const MONTH_OPTIONS = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
] as const;

function makeYearOptions(startYear = 2024): number[] {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let year = currentYear; year >= startYear; year -= 1) {
    years.push(year);
  }
  return years;
}

function monthValueToMmYyyy(value: string): string {
  const m = String(value || "").match(/^(\d{4})-(\d{2})$/);
  if (!m) return "";
  return `${m[2]}/${m[1]}`;
}

function folderPathToFileUrl(folderPath: string): string {
  const normalized = String(folderPath || "").replace(/\\/g, "/");
  if (/^[a-zA-Z]:\//.test(normalized)) {
    return `file:///${normalized}`;
  }
  if (normalized.startsWith("/")) {
    return `file://${normalized}`;
  }
  return "#";
}

function formatDateTime(value: string | null): string {
  if (!value) return "N/A";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function ActionCard({
  action,
  onRun,
  greenButtonStartMonth,
  greenButtonEndMonth,
  onChangeGreenButtonStartMonth,
  onChangeGreenButtonEndMonth,
}: {
  action: JobStatus;
  onRun: (jobKey: AdminJobKey, options?: { startMonth?: string; endMonth?: string }) => Promise<void>;
  greenButtonStartMonth: string;
  greenButtonEndMonth: string;
  onChangeGreenButtonStartMonth: (value: string) => void;
  onChangeGreenButtonEndMonth: (value: string) => void;
}) {
  const isGasSource = action.provider.toLowerCase().includes("gas");
  const folderHref = folderPathToFileUrl(action.outputFolderPath);
  const isGreenButton = action.key === "evergy-green-button";
  const yearOptions = useMemo(() => makeYearOptions(2024), []);

  const startYear = greenButtonStartMonth.split("-")[0] || String(new Date().getFullYear());
  const startMonth = greenButtonStartMonth.split("-")[1] || "01";
  const endYear = greenButtonEndMonth.split("-")[0] || String(new Date().getFullYear());
  const endMonth = greenButtonEndMonth.split("-")[1] || "01";

  const onStartYearChange = (year: string) => {
    onChangeGreenButtonStartMonth(`${year}-${startMonth}`);
  };

  const onStartMonthChange = (month: string) => {
    onChangeGreenButtonStartMonth(`${startYear}-${month}`);
  };

  const onEndYearChange = (year: string) => {
    onChangeGreenButtonEndMonth(`${year}-${endMonth}`);
  };

  const onEndMonthChange = (month: string) => {
    onChangeGreenButtonEndMonth(`${endYear}-${month}`);
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 h-full">
      <div className="flex items-center gap-2 mb-2">
        {isGasSource ? (
          <Flame className="w-4 h-4 text-gray-400" />
        ) : (
          <Zap className="w-4 h-4 text-gray-400" />
        )}
        <p className="text-sm font-medium text-gray-700">{action.provider}</p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-gray-900">{action.action}</h3>
        <button
          type="button"
          disabled={action.running}
          onClick={() =>
            onRun(
              action.key,
              isGreenButton
                ? {
                    startMonth: monthValueToMmYyyy(greenButtonStartMonth),
                    endMonth: monthValueToMmYyyy(greenButtonEndMonth),
                  }
                : undefined
            )
          }
          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {action.running ? "Running..." : action.action}
        </button>
      </div>

      {isGreenButton && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="text-xs text-gray-700">
            Start month
            <div className="mt-1 grid grid-cols-2 gap-2">
              <select
                value={startMonth}
                onChange={(e) => onStartMonthChange(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
              >
                {MONTH_OPTIONS.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
              <select
                value={startYear}
                onChange={(e) => onStartYearChange(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <label className="text-xs text-gray-700">
            End month
            <div className="mt-1 grid grid-cols-2 gap-2">
              <select
                value={endMonth}
                onChange={(e) => onEndMonthChange(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
              >
                {MONTH_OPTIONS.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
              <select
                value={endYear}
                onChange={(e) => onEndYearChange(e.target.value)}
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </label>
        </div>
      )}

      <div className="mt-3 space-y-1 text-sm text-gray-700">
        <p>
          <span className="font-medium text-gray-900">Last run:</span> {formatDateTime(action.lastRunAt)}
        </p>
        <p>
          <span className="font-medium text-gray-900">Last success:</span>{" "}
          {formatDateTime(action.lastSuccessAt)}
        </p>
        <p>
          <span className="font-medium text-gray-900">Last error:</span> {action.lastError || "None"}
        </p>
      </div>

      <div className="mt-3 text-sm text-gray-700">
        <span className="font-medium text-gray-900">Output:</span>{" "}
        {action.outputFolderPath ? (
          <a href={folderHref} className="text-blue-700 hover:underline" target="_blank" rel="noreferrer">
            Open output folder
          </a>
        ) : (
          <span className="text-gray-500">No folder configured</span>
        )}{" "}
        {action.outputCount != null && (
          <span className="text-gray-500">({action.outputCount} records imported)</span>
        )}
      </div>
      <div className="mt-2 text-xs text-gray-500">
        <span className="font-medium text-gray-700">Live status:</span>{" "}
        {action.lastOutputLine || (action.running ? "Running..." : "Idle")}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [statuses, setStatuses] = useState<JobStatus[]>([]);
  const [logs, setLogs] = useState<JobLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [greenButtonStartMonth, setGreenButtonStartMonth] = useState(() => toMonthValue(new Date()));
  const [greenButtonEndMonth, setGreenButtonEndMonth] = useState(() => toMonthValue(new Date()));

  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/jobs");
      const body = (await res.json()) as JobsResponse | { error?: string };
      if (!res.ok) {
        throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
      }

      const data = body as JobsResponse;
      setStatuses(Array.isArray(data.statuses) ? data.statuses : []);
      setLogs(Array.isArray(data.logs) ? data.logs : []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load jobs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadJobs();
    const id = setInterval(() => void loadJobs(), 5000);
    return () => clearInterval(id);
  }, [loadJobs]);

  const runJob = useCallback(
    async (jobKey: AdminJobKey, options?: { startMonth?: string; endMonth?: string }) => {
      try {
        const res = await fetch("/api/admin/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobKey, ...options }),
        });
        const body = (await res.json()) as { ok?: boolean; message?: string; error?: string };
        if (!res.ok || body.ok === false) {
          throw new Error(body.error || body.message || `HTTP ${res.status}`);
        }
        await loadJobs();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to start job");
      }
    },
    [loadJobs]
  );

  const sortedStatuses = useMemo(
    () =>
      [...statuses].sort((a, b) => {
        const order: Record<AdminJobKey, number> = {
          "evergy-bills": 1,
          "evergy-green-button": 2,
          "kgs-bills": 3,
          "woodriver-bills": 4,
        };
        return order[a.key] - order[b.key];
      }),
    [statuses]
  );

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <section className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-bold text-gray-900">Admin Tools</h1>
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                <Link
                  href="/dashboard"
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                >
                  Dashboard
                </Link>
                <Link
                  href="/buildings"
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                >
                  Buildings
                </Link>
                <Link
                  href="/green-button"
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                >
                  System Metrics
                </Link>
              </div>
              <Link
                href="/admin/bulk-update-buildings"
                className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700"
              >
                Bulk Update Buildings
              </Link>
            </div>
          </div>
          <p className="text-gray-600">
            Run and monitor provider data jobs from one place. Jobs may wait up to 3 minutes in
            non-interactive mode while you complete provider login in the opened browser window.
          </p>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </section>

        <section>
          {loading ? (
            <div className="text-sm text-gray-600">Loading jobs...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sortedStatuses.map((action) => (
                <div key={action.key}>
                  <ActionCard
                    action={action}
                    onRun={runJob}
                    greenButtonStartMonth={greenButtonStartMonth}
                    greenButtonEndMonth={greenButtonEndMonth}
                    onChangeGreenButtonStartMonth={setGreenButtonStartMonth}
                    onChangeGreenButtonEndMonth={setGreenButtonEndMonth}
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-8 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Job log</h2>
          <p className="text-sm text-gray-600 mb-4">Last 20 jobs</p>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-600 border-b border-gray-200">
                  <th className="py-2 pr-4 font-medium">Time</th>
                  <th className="py-2 pr-4 font-medium">Script name</th>
                  <th className="py-2 pr-4 font-medium">Result</th>
                  <th className="py-2 font-medium">Message</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((job, index) => (
                  <tr key={`${job.scriptName}-${job.time}-${index}`} className="border-b border-gray-100">
                    <td className="py-2 pr-4 text-gray-700">{formatDateTime(job.time)}</td>
                    <td className="py-2 pr-4 text-gray-700">{job.scriptName}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${
                          job.result === "success"
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {job.result}
                      </span>
                    </td>
                    <td className="py-2 text-gray-700">{job.message}</td>
                  </tr>
                ))}
                {!logs.length && (
                  <tr>
                    <td className="py-3 text-gray-500" colSpan={4}>
                      No jobs have run yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
