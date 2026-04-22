#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const args = new Set(process.argv.slice(2));
const isSetup = args.has("--setup");

const ROOT = process.cwd();
const PROFILE_DIR = path.join(ROOT, "automation-data", "woodriver-profile");
const DOWNLOAD_DIR = path.join(ROOT, "automation-data", "woodriver-bills");

const DEFAULT_ACCOUNT_IDS = "12521,12828";
const ACCOUNT_IDS = (process.env.WOODRIVER_ACCOUNT_IDS || DEFAULT_ACCOUNT_IDS)
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);
const FIRST_ACCOUNT_ID = ACCOUNT_IDS[0] || "12521";
const BASE_URL = process.env.WOODRIVER_BASE_URL || "https://portal.woodriverenergy.com";
const LOGIN_URL =
  process.env.WOODRIVER_LOGIN_URL ||
  "https://portal.woodriverenergy.com/login?redirect_to=https%3A%2F%2Fportal.woodriverenergy.com%2F";
const OVERVIEW_URL =
  process.env.WOODRIVER_OVERVIEW_URL || `${BASE_URL}/account/${FIRST_ACCOUNT_ID}/overview`;
const ACCOUNTS_URL =
  process.env.WOODRIVER_ACCOUNTS_URL || `${BASE_URL}/account/${FIRST_ACCOUNT_ID}/overview`;

const WOODRIVER_USERNAME = process.env.WOODRIVER_USERNAME || "";
const WOODRIVER_PASSWORD = process.env.WOODRIVER_PASSWORD || "";

const USERNAME_SELECTOR =
  process.env.WOODRIVER_USERNAME_SELECTOR ||
  "input[type='email'], input[name*='user' i], input[id*='user' i], input[name*='email' i], input[id*='email' i], input[name*='login' i], input[id*='login' i]";
const PASSWORD_SELECTOR = process.env.WOODRIVER_PASSWORD_SELECTOR || "input[type='password']";
const LOGIN_SUBMIT_SELECTOR =
  process.env.WOODRIVER_LOGIN_SUBMIT_SELECTOR ||
  "button[type='submit'], input[type='submit'], button:has-text('Sign In'), button:has-text('Log In'), button:has-text('Login')";

const BILLING_NAV_SELECTOR =
  process.env.WOODRIVER_BILLING_NAV_SELECTOR ||
  "nav a[href*='/billing']";
const DOWNLOAD_LINK_SELECTOR =
  process.env.WOODRIVER_DOWNLOAD_LINK_SELECTOR ||
  "a[href*='billing/invoice-pdf'][href*='download=true'], a[href*='/billing/invoice-pdf/'][href*='download=true']";

const TIMEOUT_MS = Number.parseInt(process.env.WOODRIVER_TIMEOUT_MS || "20000", 10);
const SETTLE_DELAY_MS = Number.parseInt(process.env.WOODRIVER_SETTLE_DELAY_MS || "1500", 10);
const MFA_PROMPT_IN_DOWNLOAD = (process.env.WOODRIVER_MFA_PROMPT_IN_DOWNLOAD || "1") !== "0";
const ADMIN_AUTO_CONTINUE_PROMPTS = process.env.ADMIN_AUTO_CONTINUE_PROMPTS === "1";
const ADMIN_NON_INTERACTIVE_WAIT_MS = Number.parseInt(
  process.env.ADMIN_NON_INTERACTIVE_WAIT_MS || "60000",
  10
);

function log(msg) {
  const stamp = new Date().toISOString();
  console.log(`[${stamp}] ${msg}`);
}

async function ensureDirs() {
  await fs.mkdir(PROFILE_DIR, { recursive: true });
  await fs.mkdir(DOWNLOAD_DIR, { recursive: true });
}

async function promptEnter(message) {
  if (ADMIN_AUTO_CONTINUE_PROMPTS || !process.stdin.isTTY || !process.stdout.isTTY) {
    const waitSeconds = Math.round(ADMIN_NON_INTERACTIVE_WAIT_MS / 1000);
    log(`${message} Waiting ${waitSeconds}s before continuing (non-interactive mode).`);
    await new Promise((resolve) => setTimeout(resolve, ADMIN_NON_INTERACTIVE_WAIT_MS));
    return;
  }

  const rl = readline.createInterface({ input, output });
  try {
    await rl.question(`${message}\nPress Enter to continue... `);
  } finally {
    rl.close();
  }
}

function sanitizeFileName(name) {
  return name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").replace(/\s+/g, " ").trim();
}

async function nextAvailablePath(targetPath) {
  const ext = path.extname(targetPath);
  const base = targetPath.slice(0, targetPath.length - ext.length);
  let attempt = 0;
  let candidate = targetPath;
  while (true) {
    try {
      await fs.access(candidate);
      attempt += 1;
      candidate = `${base} (${attempt})${ext}`;
    } catch {
      return candidate;
    }
  }
}

function absoluteUrl(baseUrl, href) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

async function hasLoginForm(page) {
  const usernames = page.locator(USERNAME_SELECTOR);
  const passwords = page.locator(PASSWORD_SELECTOR);
  return (await usernames.count()) > 0 && (await passwords.count()) > 0;
}

async function hasAccountContext(page) {
  if (/\/account\//i.test(page.url())) return true;
  if ((await page.locator("a[href*='/account/'][href*='/billing']").count()) > 0) return true;
  if ((await page.locator(".accounts a.acct-item[href*='/account/']").count()) > 0) return true;
  return false;
}

async function attemptAutofillLogin(page) {
  if (!WOODRIVER_USERNAME || !WOODRIVER_PASSWORD) return false;
  if (!(await hasLoginForm(page))) return false;

  log("Login form detected. Attempting credential autofill.");
  const username = page.locator(USERNAME_SELECTOR).first();
  const password = page.locator(PASSWORD_SELECTOR).first();
  await username.fill(WOODRIVER_USERNAME, { timeout: TIMEOUT_MS });
  await password.fill(WOODRIVER_PASSWORD, { timeout: TIMEOUT_MS });

  const submit = page.locator(LOGIN_SUBMIT_SELECTOR).first();
  if ((await submit.count()) > 0) {
    await Promise.all([
      page.waitForLoadState("domcontentloaded", { timeout: TIMEOUT_MS }).catch(() => null),
      submit.click({ timeout: TIMEOUT_MS }),
    ]);
  } else {
    await password.press("Enter");
    await page.waitForLoadState("domcontentloaded", { timeout: TIMEOUT_MS }).catch(() => null);
  }

  await page.waitForLoadState("networkidle", { timeout: TIMEOUT_MS }).catch(() => null);
  await page.waitForTimeout(SETTLE_DELAY_MS);
  return true;
}

async function openAccountsPage(page) {
  await page.goto(OVERVIEW_URL, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: TIMEOUT_MS }).catch(() => null);
  await page.waitForTimeout(SETTLE_DELAY_MS);
  if (await hasAccountContext(page)) return true;

  await page.goto(ACCOUNTS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: TIMEOUT_MS }).catch(() => null);
  await page.waitForTimeout(SETTLE_DELAY_MS);
  return hasAccountContext(page);
}

async function ensureAuthenticated(page, interactivePrompt) {
  log(`Opening login page: ${LOGIN_URL}`);
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: TIMEOUT_MS }).catch(() => null);
  await page.waitForTimeout(SETTLE_DELAY_MS);

  if (await hasAccountContext(page)) {
    if (await openAccountsPage(page)) return;
  }

  const didAutofill = await attemptAutofillLogin(page);
  if (didAutofill) {
    if (await hasAccountContext(page)) {
      if (await openAccountsPage(page)) return;
    }
  }

  if (interactivePrompt) {
    await promptEnter(
      "If prompted, complete login/MFA in the browser. After login lands on accounts, return here."
    );
    if (await openAccountsPage(page)) return;
  }

  throw new Error(
    "Authentication did not reach the account page. Check credentials/selectors, or complete MFA manually."
  );
}

async function resolveAccountName(page, accountId) {
  const nameBySidebar = await page
    .locator(`a[href*='/account/${accountId}/'] .acct-name, a[href*='/account/${accountId}/'] .acct-top-row span`)
    .first()
    .innerText()
    .catch(() => "");
  if (nameBySidebar.trim()) return nameBySidebar.trim();

  const fromTitle = await page.title().catch(() => "");
  if (fromTitle.trim()) return fromTitle.trim();

  return `account-${accountId}`;
}

async function goToBillingForAccount(page, accountId) {
  const directBillingUrl = `${BASE_URL}/account/${accountId}/billing`;
  log(`Opening billing page for account ${accountId}`);
  await page.goto(directBillingUrl, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: TIMEOUT_MS }).catch(() => null);
  await page.waitForTimeout(SETTLE_DELAY_MS);

  if (/\/account\/\d+\/billing/i.test(page.url())) return;

  const billingNav = page.locator(BILLING_NAV_SELECTOR).filter({ hasText: /billing/i }).first();
  if ((await billingNav.count()) > 0) {
    await Promise.all([
      page.waitForLoadState("domcontentloaded", { timeout: TIMEOUT_MS }).catch(() => null),
      billingNav.click({ timeout: TIMEOUT_MS }),
    ]);
    await page.waitForLoadState("networkidle", { timeout: TIMEOUT_MS }).catch(() => null);
    await page.waitForTimeout(SETTLE_DELAY_MS);
  }

  if (!/\/account\/\d+\/billing/i.test(page.url())) {
    throw new Error(`Failed to reach billing page for account ${accountId}. Current URL: ${page.url()}`);
  }
}

async function getNewestBillDownloadUrl(page) {
  await page.waitForTimeout(500);

  const first = page.locator(DOWNLOAD_LINK_SELECTOR).first();
  if ((await first.count()) > 0) {
    const href = await first.getAttribute("href");
    if (href) {
      const url = absoluteUrl(page.url(), href);
      if (url) return url;
    }
  }

  const fallback = page
    .locator("a[href*='billing/invoice-pdf'][href*='download=true'], a[href*='invoice-pdf'][href*='download=true']")
    .first();
  if ((await fallback.count()) > 0) {
    const href = await fallback.getAttribute("href");
    if (href) {
      const url = absoluteUrl(page.url(), href);
      if (url) return url;
    }
  }

  throw new Error("Could not find newest bill download link. Set WOODRIVER_DOWNLOAD_LINK_SELECTOR.");
}

async function savePdfResponse(response, accountLabel, invoiceId) {
  const contentType = (response.headers()["content-type"] || "").toLowerCase();
  if (!contentType.includes("pdf")) {
    throw new Error(`Download response was not PDF-like (${contentType || "unknown"}).`);
  }

  const safeLabel = sanitizeFileName(accountLabel || "woodriver-account");
  const safeInvoice = sanitizeFileName(invoiceId || "invoice");
  const fileName = `${safeLabel} - ${safeInvoice}.pdf`;
  const targetPath = await nextAvailablePath(path.join(DOWNLOAD_DIR, fileName));
  await fs.writeFile(targetPath, await response.body());
  log(`Saved ${path.relative(ROOT, targetPath)}`);
}

function getInvoiceIdFromUrl(url) {
  try {
    const match = new URL(url).pathname.match(/invoice-pdf\/(\d+)/i);
    return match?.[1] || "invoice";
  } catch {
    return "invoice";
  }
}

async function downloadNewestBillForAccount(page, accountId) {
  await goToBillingForAccount(page, accountId);

  const accountName = await resolveAccountName(page, accountId);
  const billUrl = await getNewestBillDownloadUrl(page);
  const invoiceId = getInvoiceIdFromUrl(billUrl);

  log(`Downloading newest bill for ${accountName} (${accountId})`);
  const response = await page.request.get(billUrl, {
    timeout: TIMEOUT_MS,
    failOnStatusCode: false,
  });

  if (!response.ok()) {
    throw new Error(`Bill download failed for account ${accountId}: HTTP ${response.status()} (${billUrl})`);
  }

  await savePdfResponse(response, `${accountName} (${accountId})`, invoiceId);
}

async function run() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw new Error(
      "Missing dependency: playwright. Run `npm install` (or `npm install -D playwright`) and try again."
    );
  }

  await ensureDirs();

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    acceptDownloads: true,
    viewport: { width: 1440, height: 920 },
  });

  const page = context.pages()[0] || (await context.newPage());
  page.setDefaultTimeout(TIMEOUT_MS);

  try {
    await ensureAuthenticated(page, isSetup || MFA_PROMPT_IN_DOWNLOAD);

    if (isSetup) {
      log("Setup complete. Login session is saved.");
      log("Run `npm run woodriver:download` to download newest bill for each account.");
      return;
    }

    let totalSaved = 0;
    for (const accountId of ACCOUNT_IDS) {
      await downloadNewestBillForAccount(page, accountId);
      totalSaved += 1;
    }

    log(`Done. Total saved: ${totalSaved}`);
    log(`Bills folder: ${path.relative(ROOT, DOWNLOAD_DIR)}`);
  } finally {
    await context.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

