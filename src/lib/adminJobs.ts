import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

export type AdminJobKey =
  | "evergy-bills"
  | "evergy-green-button"
  | "kgs-bills"
  | "woodriver-bills";

export type JobResult = "success" | "fail";

export type JobStatus = {
  key: AdminJobKey;
  provider: string;
  action: string;
  scriptName: string;
  running: boolean;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastMessage: string | null;
  lastOutputLine: string | null;
  outputFolderPath: string;
  latestOutputFile: string | null;
  latestOutputLabel: string | null;
  outputCount: number | null;
};

export type JobLogRow = {
  time: string;
  scriptName: string;
  result: JobResult;
  message: string;
};

type JobConfig = {
  key: AdminJobKey;
  provider: string;
  action: string;
  scriptName: string;
  scriptPath: string;
  outputDir: string;
  env?: Record<string, string>;
};

type RuntimeState = {
  statuses: Record<AdminJobKey, JobStatus>;
  logs: JobLogRow[];
  initialized: boolean;
};

const ROOT = process.cwd();
const AUTOMATION_DIR = path.join(ROOT, "automation-data");
const STATUS_FILE = path.join(AUTOMATION_DIR, "admin-job-status.json");
const LOG_FILE = path.join(AUTOMATION_DIR, "admin-job-log.json");
const MAX_LOGS = 20;
const JOB_TIMEOUT_MS = Number.parseInt(process.env.ADMIN_JOB_TIMEOUT_MS || "900000", 10);
const STALE_RUNNING_RESET_MS = Number.parseInt(
  process.env.ADMIN_STALE_RUNNING_RESET_MS || "240000",
  10
);

const JOBS: JobConfig[] = [
  {
    key: "evergy-bills",
    provider: "Evergy",
    action: "Download Bills",
    scriptName: "evergy-download-bills.mjs",
    scriptPath: path.join(ROOT, "scripts", "evergy-download-bills.mjs"),
    outputDir: path.join(ROOT, "automation-data", "evergy-bills"),
    env: { EVERGY_MFA_PROMPT_IN_DOWNLOAD: "1" },
  },
  {
    key: "evergy-green-button",
    provider: "Evergy",
    action: "Download Green Button",
    scriptName: "evergy-download-green-button.mjs",
    scriptPath: path.join(ROOT, "scripts", "evergy-download-green-button.mjs"),
    outputDir: path.join(ROOT, "automation-data", "evergy-green-button"),
    env: { EVERGY_MFA_PROMPT_IN_DOWNLOAD: "1" },
  },
  {
    key: "kgs-bills",
    provider: "Kansas Gas",
    action: "Download Bills",
    scriptName: "kgs-download-bills.mjs",
    scriptPath: path.join(ROOT, "scripts", "kgs-download-bills.mjs"),
    outputDir: path.join(ROOT, "automation-data", "kgs-bills"),
    env: { KGS_MFA_PROMPT_IN_DOWNLOAD: "1" },
  },
  {
    key: "woodriver-bills",
    provider: "Woodriver",
    action: "Download Bills",
    scriptName: "woodriver-download-bills.mjs",
    scriptPath: path.join(ROOT, "scripts", "woodriver-download-bills.mjs"),
    outputDir: path.join(ROOT, "automation-data", "woodriver-bills"),
    env: { WOODRIVER_MFA_PROMPT_IN_DOWNLOAD: "1" },
  },
];

function defaultStatus(cfg: JobConfig): JobStatus {
  return {
    key: cfg.key,
    provider: cfg.provider,
    action: cfg.action,
    scriptName: cfg.scriptName,
    running: false,
    lastRunAt: null,
    lastSuccessAt: null,
    lastError: null,
    lastMessage: null,
    lastOutputLine: null,
    outputFolderPath: cfg.outputDir,
    latestOutputFile: null,
    latestOutputLabel: null,
    outputCount: null,
  };
}

function getRuntime(): RuntimeState {
  const g = globalThis as typeof globalThis & { __adminJobsRuntime?: RuntimeState };
  if (!g.__adminJobsRuntime) {
    const statuses = Object.fromEntries(
      JOBS.map((cfg) => [cfg.key, defaultStatus(cfg)])
    ) as Record<AdminJobKey, JobStatus>;
    g.__adminJobsRuntime = { statuses, logs: [], initialized: false };
  }
  return g.__adminJobsRuntime;
}

async function ensureDirs() {
  await fs.mkdir(AUTOMATION_DIR, { recursive: true });
}

async function safeReadJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJson(filePath: string, value: unknown) {
  await ensureDirs();
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

async function hydrateOnce() {
  const rt = getRuntime();
  if (rt.initialized) return;

  const savedStatuses = await safeReadJson<Record<AdminJobKey, Partial<JobStatus>>>(STATUS_FILE);
  const savedLogs = await safeReadJson<JobLogRow[]>(LOG_FILE);

  for (const cfg of JOBS) {
    const base = defaultStatus(cfg);
    const persisted = savedStatuses?.[cfg.key] ?? {};
    rt.statuses[cfg.key] = { ...base, ...persisted, running: false };
  }

  rt.logs = Array.isArray(savedLogs) ? savedLogs.slice(0, MAX_LOGS) : [];
  rt.initialized = true;
}

async function persistAll() {
  const rt = getRuntime();
  await writeJson(STATUS_FILE, rt.statuses);
  await writeJson(LOG_FILE, rt.logs.slice(0, MAX_LOGS));
}

function clearStaleRunning(status: JobStatus): boolean {
  if (!status.running || !status.lastRunAt) return false;
  const startedAt = new Date(status.lastRunAt).getTime();
  if (!Number.isFinite(startedAt)) return false;
  const elapsed = Date.now() - startedAt;
  if (elapsed < STALE_RUNNING_RESET_MS) return false;

  status.running = false;
  status.lastError = `Marked stale after ${Math.round(elapsed / 1000)}s without completion.`;
  status.lastMessage = "Recovered stale running state";
  status.lastOutputLine = status.lastError;
  return true;
}

function getConfig(jobKey: AdminJobKey): JobConfig {
  const cfg = JOBS.find((j) => j.key === jobKey);
  if (!cfg) throw new Error(`Unknown job key: ${jobKey}`);
  return cfg;
}

function parseOutputCount(outputText: string): number | null {
  const m1 = outputText.match(/Total saved:\s*(\d+)/i);
  if (m1?.[1]) return Number.parseInt(m1[1], 10);
  const m2 = outputText.match(/Saved:\s*(\d+)/i);
  if (m2?.[1]) return Number.parseInt(m2[1], 10);
  return null;
}

function parseFailureMessage(outputText: string, fallback: string): string {
  const lines = outputText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return fallback;

  const skipPattern = /^Tip:\s+set\s+EVERGY_ACCOUNT_NUMBERS/i;
  const filtered = lines.filter((l) => !skipPattern.test(l));

  for (let i = filtered.length - 1; i >= 0; i -= 1) {
    const line = filtered[i];
    if (/error|failed|timeout|did not|could not|no bill|no account/i.test(line)) {
      return line;
    }
  }

  return filtered[filtered.length - 1] || lines[lines.length - 1] || fallback;
}

async function findLatestOutput(outputDir: string): Promise<{ path: string; label: string } | null> {
  try {
    const names = await fs.readdir(outputDir);
    if (!names.length) return null;

    let latestName: string | null = null;
    let latestMtime = 0;
    for (const name of names) {
      const full = path.join(outputDir, name);
      const stat = await fs.stat(full);
      if (!stat.isFile()) continue;
      const m = stat.mtimeMs;
      if (m > latestMtime) {
        latestMtime = m;
        latestName = name;
      }
    }
    if (!latestName) return null;
    return { path: path.join(outputDir, latestName), label: latestName };
  } catch {
    return null;
  }
}

export async function getAdminJobsSnapshot(): Promise<{ statuses: JobStatus[]; logs: JobLogRow[] }> {
  await hydrateOnce();
  const rt = getRuntime();
  let changed = false;
  for (const cfg of JOBS) {
    if (clearStaleRunning(rt.statuses[cfg.key])) changed = true;
  }
  if (changed) await persistAll();
  const statuses = JOBS.map((cfg) => rt.statuses[cfg.key]);
  return { statuses, logs: rt.logs.slice(0, MAX_LOGS) };
}

export async function startAdminJob(
  jobKey: AdminJobKey,
  options?: { startMonth?: string; endMonth?: string }
): Promise<{ ok: boolean; message: string }> {
  await hydrateOnce();
  const rt = getRuntime();
  const cfg = getConfig(jobKey);
  const status = rt.statuses[jobKey];
  if (clearStaleRunning(status)) {
    await persistAll();
  }

  if (status.running) {
    return { ok: false, message: `${cfg.action} is already running.` };
  }

  status.running = true;
  status.lastRunAt = new Date().toISOString();
  status.lastError = null;
  status.lastMessage = "Started";
  status.lastOutputLine = null;
  await persistAll();

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...cfg.env,
    ADMIN_AUTO_CONTINUE_PROMPTS: "1",
    ADMIN_NON_INTERACTIVE_WAIT_MS: process.env.ADMIN_NON_INTERACTIVE_WAIT_MS || "60000",
  };

  if (jobKey === "evergy-green-button") {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yyyy = String(now.getFullYear());
    env.EVERGY_GB_START_MONTH = options?.startMonth || `${mm}/${yyyy}`;
    env.EVERGY_GB_END_MONTH = options?.endMonth || `${mm}/${yyyy}`;
  }

  const child = spawn(process.execPath, [cfg.scriptPath], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: false,
  });

  let combined = "";
  let finalized = false;
  const appendChunk = (chunk: string) => {
    combined += chunk;
    const lines = combined.split(/\r?\n/).filter(Boolean);
    if (lines.length) {
      status.lastOutputLine = lines[lines.length - 1];
      status.lastMessage = status.lastOutputLine;
    }
  };

  child.stdout.on("data", (d) => appendChunk(d.toString()));
  child.stderr.on("data", (d) => appendChunk(d.toString()));

  const finalize = async (code: number | null, timedOut = false) => {
    if (finalized) return;
    finalized = true;

    const s = rt.statuses[jobKey];
    const when = new Date().toISOString();
    const outputCount = parseOutputCount(combined);
    const latest = await findLatestOutput(cfg.outputDir);

    s.running = false;
    s.outputCount = outputCount;
    s.latestOutputFile = latest?.path ?? null;
    s.latestOutputLabel = latest?.label ?? null;

    if (code === 0) {
      s.lastSuccessAt = when;
      s.lastError = null;
      s.lastMessage = "Completed";
      rt.logs.unshift({
        time: when,
        scriptName: cfg.scriptName,
        result: "success",
        message: outputCount != null ? `Completed. Saved ${outputCount}.` : "Completed.",
      });
    } else {
      const fallback = timedOut
        ? `Job timed out after ${Math.round(JOB_TIMEOUT_MS / 1000)}s`
        : `Exited with code ${code}`;
      const tail = parseFailureMessage(combined, fallback);
      s.lastError = tail;
      s.lastMessage = "Failed";
      s.lastOutputLine = tail;
      rt.logs.unshift({
        time: when,
        scriptName: cfg.scriptName,
        result: "fail",
        message: tail,
      });
    }

    rt.logs = rt.logs.slice(0, MAX_LOGS);
    await persistAll();
  };

  const timeoutHandle = setTimeout(async () => {
    try {
      child.kill("SIGTERM");
    } catch {
      // ignore
    }
    await finalize(1, true);
  }, JOB_TIMEOUT_MS);

  child.on("close", async (code) => {
    clearTimeout(timeoutHandle);
    await finalize(code ?? 1, false);
  });

  child.on("error", async (err) => {
    clearTimeout(timeoutHandle);
    const s = rt.statuses[jobKey];
    const when = new Date().toISOString();
    s.running = false;
    s.lastError = err.message;
    s.lastMessage = "Failed to start";
    s.lastOutputLine = err.message;
    rt.logs.unshift({
      time: when,
      scriptName: cfg.scriptName,
      result: "fail",
      message: err.message,
    });
    rt.logs = rt.logs.slice(0, MAX_LOGS);
    await persistAll();
  });

  return { ok: true, message: `${cfg.action} started.` };
}

export async function getLatestOutputFile(jobKey: AdminJobKey): Promise<string | null> {
  await hydrateOnce();
  const rt = getRuntime();
  const file = rt.statuses[jobKey]?.latestOutputFile || null;
  if (!file) return null;

  const resolved = path.resolve(file);
  const allowedRoot = path.resolve(path.join(ROOT, "automation-data"));
  if (!resolved.startsWith(allowedRoot)) return null;
  return resolved;
}

