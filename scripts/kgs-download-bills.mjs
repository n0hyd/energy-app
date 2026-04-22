#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const args = new Set(process.argv.slice(2));
const isSetup = args.has("--setup");

const ROOT = process.cwd();
const PROFILE_DIR = path.join(ROOT, "automation-data", "kgs-profile");
const DOWNLOAD_DIR = path.join(ROOT, "automation-data", "kgs-bills");

const KGS_ACCOUNT_URL = process.env.KGS_ACCOUNT_URL || "https://www.kansasgasservice.com/account";
const ADDRESS_VALUES = (process.env.KGS_ADDRESS_VALUES || "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);
const ACCOUNT_TOKENS = (process.env.KGS_ACCOUNT_TOKENS || "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);
const ACCOUNT_TEXT_TOKENS = (process.env.KGS_ACCOUNT_TEXT_TOKENS || "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

const KGS_USERNAME = process.env.KGS_USERNAME || "";
const KGS_PASSWORD = process.env.KGS_PASSWORD || "";
const KGS_AUTOSUBMIT_LOGIN = (process.env.KGS_AUTOSUBMIT_LOGIN || "0") === "1";

const USERNAME_SELECTOR =
  process.env.KGS_USERNAME_SELECTOR ||
  "input[type='email'], input[name*='user' i], input[id*='user' i], input[name*='email' i], input[id*='email' i], input[name*='login' i], input[id*='login' i]";
const PASSWORD_SELECTOR = process.env.KGS_PASSWORD_SELECTOR || "input[type='password']";
const LOGIN_SUBMIT_SELECTOR =
  process.env.KGS_LOGIN_SUBMIT_SELECTOR ||
  "button[type='submit'], input[type='submit'], button:has-text('Sign In'), button:has-text('Log In'), button:has-text('Login')";

const ADDRESS_SELECT_SELECTOR =
  process.env.KGS_ADDRESS_SELECT_SELECTOR ||
  "select[name*='address' i], select[id*='address' i], select[name*='account' i], select[id*='account' i], select[aria-label*='address' i]";
const ADDRESS_DROPDOWN_TRIGGER_SELECTOR =
  process.env.KGS_ADDRESS_DROPDOWN_TRIGGER_SELECTOR ||
  "[aria-haspopup='listbox'][aria-expanded], [aria-haspopup='listbox']";
const ADDRESS_OPTION_SELECTOR = process.env.KGS_ADDRESS_OPTION_SELECTOR || "[role='option']";
const ADDRESS_COMBOBOX_SELECTOR =
  process.env.KGS_ADDRESS_COMBOBOX_SELECTOR ||
  "input[role='combobox'], [role='combobox'] input, [role='combobox'], input[name*='account' i], input[placeholder*='account' i], input[placeholder*='address' i]";
const ANGULAR_DROPDOWN_MENU_SELECTOR =
  process.env.KGS_ANGULAR_DROPDOWN_MENU_SELECTOR || "ul.dropdown-menu.active";
const ANGULAR_DROPDOWN_ITEM_SELECTOR =
  process.env.KGS_ANGULAR_DROPDOWN_ITEM_SELECTOR || "ul.dropdown-menu.active > li:not(.options-heading) > div";
const ANGULAR_DROPDOWN_TRIGGER_SELECTOR =
  process.env.KGS_ANGULAR_DROPDOWN_TRIGGER_SELECTOR ||
  ".dropdown-toggle, [data-toggle='dropdown'], [aria-haspopup='true'], [aria-expanded]";
const ACCOUNT_ITEM_SELECTOR =
  process.env.KGS_ACCOUNT_ITEM_SELECTOR ||
  "[data-account-number], [data-account], [data-address], [data-premise-id], [data-premise], [data-building-id], a, button, [role='button'], [role='option'], [role='menuitem'], li, div, span";

const STATEMENTS_TAB_SELECTOR =
  process.env.KGS_STATEMENTS_TAB_SELECTOR ||
  "a, button, [role='tab'], [role='button']";
const FIRST_STATEMENT_ROW_SELECTOR =
  process.env.KGS_FIRST_STATEMENT_ROW_SELECTOR ||
  "table tbody tr, [data-testid*='statement-row'], [class*='statement-row']";
const DOWNLOAD_TRIGGER_SELECTOR =
  process.env.KGS_DOWNLOAD_TRIGGER_SELECTOR ||
  "a.DocPageSave, a:has(img), button:has(img), a[title*='download' i], button[title*='download' i], a[href*='.pdf' i], a[href*='SingleDocumentViewer.aspx' i], [class*='download']";
const KGS_STATEMENTS_ORIGIN =
  process.env.KGS_STATEMENTS_ORIGIN || "https://statements.kansasgasservice.com";
const KGS_ALLOW_UI_DOWNLOAD_CLICK = (process.env.KGS_ALLOW_UI_DOWNLOAD_CLICK || "0") === "1";
const NO_STATEMENT_TEXT_REGEX =
  /no statements?|no statement available|no bill history|no bills?|no documents?|nothing to display|no results?/i;

const TIMEOUT_MS = Number.parseInt(process.env.KGS_TIMEOUT_MS || "20000", 10);
const SETTLE_DELAY_MS = Number.parseInt(process.env.KGS_SETTLE_DELAY_MS || "1500", 10);
const MFA_PROMPT_IN_DOWNLOAD = (process.env.KGS_MFA_PROMPT_IN_DOWNLOAD || "1") !== "0";
const PAYMENT_TEXT_REGEX = /\b(make payment|payment center|pay bill|autopay|auto pay|one-time payment)\b/i;
const ACCOUNT_LABEL_HINT_REGEX =
  /\b(account|service|address|location|premise|residence|property|unit|apt|suite|road|rd\b|street|st\b|avenue|ave\b|drive|dr\b|lane|ln\b|court|ct\b|circle|cir\b|boulevard|blvd\b|way\b|place|pl\b|trail|trl\b|parkway|pkwy\b|highway|hwy\b)\b/i;
const ACCOUNT_LABEL_EXCLUDE_REGEX =
  /\b(statements?|billing history|usage|overview|dashboard|profile|logout|sign out|payment|autopay|paperless|alerts?|settings|contact|help|support)\b/i;
const runtimeViewerUrls = new Set();
const runtimeDocIds = new Set();
const ADMIN_AUTO_CONTINUE_PROMPTS = process.env.ADMIN_AUTO_CONTINUE_PROMPTS === "1";
const ADMIN_NON_INTERACTIVE_WAIT_MS = Number.parseInt(
  process.env.ADMIN_NON_INTERACTIVE_WAIT_MS || "60000",
  10
);
const MANUAL_AUTH_WAIT_MS = Number.parseInt(
  process.env.KGS_MANUAL_AUTH_WAIT_MS || process.env.ADMIN_NON_INTERACTIVE_WAIT_MS || "300000",
  10
);
const KEEP_BROWSER_OPEN_ON_FAILURE =
  (process.env.KGS_KEEP_BROWSER_OPEN_ON_FAILURE || (ADMIN_AUTO_CONTINUE_PROMPTS ? "1" : "0")) === "1";
const FAILURE_HOLD_MS = Number.parseInt(
  process.env.KGS_FAILURE_HOLD_MS || "300000",
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

async function waitForManualAuthentication(page, message) {
  if (!ADMIN_AUTO_CONTINUE_PROMPTS && process.stdin.isTTY && process.stdout.isTTY) {
    await promptEnter(message);
    return;
  }

  const waitSeconds = Math.round(MANUAL_AUTH_WAIT_MS / 1000);
  log(`${message} Waiting up to ${waitSeconds}s for the account page in admin mode.`);
  const deadline = Date.now() + MANUAL_AUTH_WAIT_MS;

  while (Date.now() < deadline) {
    if (await hasAccountContext(page)) return true;
    await page.waitForTimeout(1000);
  }

  return hasAccountContext(page);
}

async function holdBrowserOpenOnFailure(page, err) {
  if (!KEEP_BROWSER_OPEN_ON_FAILURE) return;

  const seconds = Math.round(FAILURE_HOLD_MS / 1000);
  log(
    `Holding browser open for ${seconds}s after failure: ${err?.message || err}. Fix the page or inspect the state before it closes.`
  );

  const deadline = Date.now() + FAILURE_HOLD_MS;
  while (Date.now() < deadline) {
    if (page.isClosed()) return;
    await page.waitForTimeout(1000).catch(() => null);
  }
}

function sanitizeFileName(name) {
  return name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").replace(/\s+/g, " ").trim();
}

function unique(values) {
  const out = [];
  const seen = new Set();
  for (const v of values) {
    const vv = String(v || "").trim();
    if (!vv) continue;
    if (seen.has(vv)) continue;
    seen.add(vv);
    out.push(vv);
  }
  return out;
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number.parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

function decodeBase64Flexible(value) {
  const normalized = value.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function extractNumbersFromText(text) {
  return unique((text.match(/\b\d{8,16}\b/g) || []).map((v) => v.trim()));
}

function collectStringValuesDeep(node, out = []) {
  if (node == null) return out;
  if (typeof node === "string") {
    out.push(node);
    return out;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectStringValuesDeep(item, out);
    return out;
  }
  if (typeof node === "object") {
    for (const value of Object.values(node)) {
      collectStringValuesDeep(value, out);
    }
  }
  return out;
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

async function dumpDebugArtifacts(page, reason = "failure") {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const htmlPath = await nextAvailablePath(path.join(DOWNLOAD_DIR, `debug-${reason}-${stamp}.html`));
  const pngPath = await nextAvailablePath(path.join(DOWNLOAD_DIR, `debug-${reason}-${stamp}.png`));

  const html = await page.content().catch(() => "");
  if (html) {
    await fs.writeFile(htmlPath, html, "utf8").catch(() => null);
    log(`Saved debug HTML: ${path.relative(ROOT, htmlPath)}`);
  }

  await page.screenshot({ path: pngPath, fullPage: true }).catch(() => null);
  log(`Saved debug screenshot: ${path.relative(ROOT, pngPath)}`);
}

async function hasLoginForm(page) {
  const usernames = page.locator(USERNAME_SELECTOR);
  const passwords = page.locator(PASSWORD_SELECTOR);

  const hasVisibleUsername = await anyVisible(usernames);
  const hasVisiblePassword = await anyVisible(passwords);
  if (!(hasVisibleUsername && hasVisiblePassword)) return false;

  const submit = page.locator(LOGIN_SUBMIT_SELECTOR);
  return anyVisible(submit);
}

async function hasAccountContext(page) {
  const loginPageMarkerCount = await page
    .locator("ogs-login-page, ogs-login-form, form input[type='password'], #txtpassword, #txtusername")
    .count()
    .catch(() => 0);
  if (loginPageMarkerCount > 0) return false;

  if ((await page.locator("#homeContent").first().count()) > 0) return true;
  if (await hasLoginForm(page)) return false;
  if ((await page.locator(ADDRESS_SELECT_SELECTOR).first().count()) > 0) return true;
  if ((await page.locator(ADDRESS_DROPDOWN_TRIGGER_SELECTOR).first().count()) > 0) return true;
  if ((await page.locator(ADDRESS_COMBOBOX_SELECTOR).first().count()) > 0) return true;
  if ((await page.locator("a,button,[role='tab']").filter({ hasText: /^statements$/i }).first().count()) > 0) return true;
  const bodyText = await page.locator("body").innerText().catch(() => "");
  if (/sign into account|unsuccessful login attempt|password is required|forgot username|forgot password/i.test(bodyText)) {
    return false;
  }
  if (/my account|billing account|account number/i.test(bodyText)) return true;
  return false;
}

async function anyVisible(locator, max = 8) {
  const count = await locator.count();
  const limit = Math.min(count, max);
  for (let i = 0; i < limit; i += 1) {
    if (await locator.nth(i).isVisible().catch(() => false)) return true;
  }
  return false;
}

async function discoverAccountTokens(page) {
  const discovered = [];

  const fromBody = await page
    .locator("body")
    .innerText()
    .then((t) => extractNumbersFromText(t))
    .catch(() => []);
  discovered.push(...fromBody);

  const hiddenValue = await page
    .locator("#homeContent")
    .first()
    .getAttribute("value")
    .catch(() => null);

  if (hiddenValue) {
    try {
      const decodedHtml = decodeHtmlEntities(hiddenValue);
      const decoded = decodeBase64Flexible(decodedHtml);
      discovered.push(...extractNumbersFromText(decoded));

      const parsed = JSON.parse(decoded);
      const allStrings = collectStringValuesDeep(parsed);
      for (const s of allStrings) discovered.push(...extractNumbersFromText(s));
    } catch {
      // Best effort only.
    }
  }

  const fromScripts = await page
    .$$eval("script", (scripts) => scripts.map((s) => s.textContent || ""))
    .then((texts) => {
      const hits = [];
      for (const t of texts) {
        const m = t.match(/\b\d{8,16}\b/g) || [];
        for (const x of m) hits.push(x);
      }
      return hits;
    })
    .catch(() => []);
  discovered.push(...fromScripts);

  const fromAttributes = await page
    .locator("[data-account],[data-account-number],[data-premise],[data-address],[aria-label],[title],a[href],button[value],input[value]")
    .evaluateAll((nodes) => {
      const hits = [];
      for (const node of nodes) {
        const attrs = node.getAttributeNames?.() || [];
        for (const name of attrs) {
          const value = node.getAttribute(name) || "";
          const matches = value.match(/\b\d{8,16}\b/g) || [];
          for (const match of matches) hits.push(match);
        }
        if ("value" in node && typeof node.value === "string") {
          const matches = node.value.match(/\b\d{8,16}\b/g) || [];
          for (const match of matches) hits.push(match);
        }
      }
      return hits;
    })
    .catch(() => []);
  discovered.push(...fromAttributes);

  const uniqueTokens = unique(discovered);
  if (uniqueTokens.length) {
    log(`Discovered ${uniqueTokens.length} account token(s) from page data`);
  }
  return uniqueTokens;
}

function looksLikeAccountLabel(text) {
  const label = normalizeWhitespace(text);
  if (!label) return false;
  if (label.length < 6 || label.length > 160) return false;
  if (ACCOUNT_LABEL_EXCLUDE_REGEX.test(label) || PAYMENT_TEXT_REGEX.test(label)) return false;
  if (/\b\d{8,16}\b/.test(label)) return true;
  if (/\d+/.test(label) && ACCOUNT_LABEL_HINT_REGEX.test(label)) return true;
  return false;
}

async function attemptAutofillLogin(page, options = {}) {
  const { autoSubmit = KGS_AUTOSUBMIT_LOGIN } = options;
  if (!KGS_USERNAME || !KGS_PASSWORD) return false;
  if (!(await hasLoginForm(page))) return false;

  log("Login form detected. Attempting credential autofill.");
  const username = page.locator(USERNAME_SELECTOR).first();
  const password = page.locator(PASSWORD_SELECTOR).first();
  await username.fill(KGS_USERNAME, { timeout: TIMEOUT_MS });
  await password.fill(KGS_PASSWORD, { timeout: TIMEOUT_MS });

  if (!autoSubmit) {
    log("Credentials filled. Waiting for manual sign-in/MFA.");
    return true;
  }

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

async function ensureAuthenticated(page, interactivePrompt) {
  log(`Opening account page: ${KGS_ACCOUNT_URL}`);
  await page.goto(KGS_ACCOUNT_URL, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: TIMEOUT_MS }).catch(() => null);
  await page.waitForTimeout(SETTLE_DELAY_MS);
  log(`Auth context: URL=${page.url()} | title=${await page.title().catch(() => "")}`);

  if (await hasAccountContext(page)) return;

  if (interactivePrompt && (await hasLoginForm(page))) {
    const didAutofill = await attemptAutofillLogin(page, { autoSubmit: false }).catch(() => false);
    const message = didAutofill
      ? "Credentials are filled in the browser. Complete sign-in/MFA and return to the account page."
      : "Complete sign-in/MFA in the browser and return to the account page.";
    const reached = await waitForManualAuthentication(page, message);
    if (reached) return;
    await page.goto(KGS_ACCOUNT_URL, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: TIMEOUT_MS }).catch(() => null);
    await page.waitForTimeout(SETTLE_DELAY_MS);
    log(`Auth context after wait: URL=${page.url()} | title=${await page.title().catch(() => "")}`);
    if (await hasAccountContext(page)) return;
  }

  const didAutofill = await attemptAutofillLogin(page).catch(() => false);
  if (didAutofill && (await hasAccountContext(page))) return;

  if (interactivePrompt) {
    const reached = await waitForManualAuthentication(
      page,
      "If prompted, complete login/MFA in the browser and return to the account page."
    );
    if (reached) return;
    await page.goto(KGS_ACCOUNT_URL, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: TIMEOUT_MS }).catch(() => null);
    await page.waitForTimeout(SETTLE_DELAY_MS);
    log(`Auth context after wait: URL=${page.url()} | title=${await page.title().catch(() => "")}`);
    if (await hasAccountContext(page)) return;
  }

  throw new Error(
    "Authentication did not reach the account page. Check credentials/selectors, or complete MFA manually."
  );
}

async function openStatementsTab(page) {
  let tab = page.locator("a[ngbnavlink], a[role='tab'], a.nav-link").filter({ hasText: /statements?/i }).first();
  if ((await tab.count()) === 0) {
    tab = page.locator(STATEMENTS_TAB_SELECTOR).filter({ hasText: /statements?/i }).first();
  }
  if ((await tab.count()) === 0) {
    tab = page
      .locator("a, button, [role='tab'], [role='button'], li, span, div")
      .filter({ hasText: /statements?/i })
      .first();
  }
  if ((await tab.count()) === 0) throw new Error("Statements tab not found. Set KGS_STATEMENTS_TAB_SELECTOR.");

  log("Opening Statements tab");
  await tab.scrollIntoViewIfNeeded().catch(() => null);
  await Promise.all([
    page.waitForLoadState("domcontentloaded", { timeout: TIMEOUT_MS }).catch(() => null),
    tab.click({ timeout: TIMEOUT_MS }).catch(async () => {
      await tab.click({ timeout: TIMEOUT_MS, force: true }).catch(async () => {
        await tab.evaluate((el) => {
          if (el instanceof HTMLElement) el.click();
        });
      });
    }),
  ]);
  await page.waitForLoadState("networkidle", { timeout: TIMEOUT_MS }).catch(() => null);
  await page.waitForTimeout(SETTLE_DELAY_MS);

  const selected = await tab.getAttribute("aria-selected").catch(() => null);
  if (selected && selected !== "true") {
    await tab.click({ timeout: TIMEOUT_MS, force: true }).catch(() => null);
    await page.waitForTimeout(750);
  }
}

async function saveDownload(download, label, index) {
  const suggested = sanitizeFileName(download.suggestedFilename() || "statement.pdf");
  const baseName = suggested.toLowerCase().endsWith(".pdf") ? suggested : `${suggested}.pdf`;
  const prefixed = `${sanitizeFileName(label || `account-${index}`)} - ${baseName}`;
  const targetPath = await nextAvailablePath(path.join(DOWNLOAD_DIR, prefixed));
  await download.saveAs(targetPath);
  log(`Saved ${path.relative(ROOT, targetPath)}`);
}

async function savePdfResponse(response, label, index) {
  const type = (response.headers()["content-type"] || "").toLowerCase();
  if (!type.includes("pdf")) {
    throw new Error(`Download response was not PDF-like (${type || "unknown"}).`);
  }
  const targetPath = await nextAvailablePath(
    path.join(DOWNLOAD_DIR, `${sanitizeFileName(label || `account-${index}`)} - statement-${index}.pdf`)
  );
  await fs.writeFile(targetPath, await response.body());
  log(`Saved ${path.relative(ROOT, targetPath)}`);
}

function makeAbsoluteUrl(url, base) {
  try {
    return new URL(url, base).toString();
  } catch {
    return null;
  }
}

function extractDocId(url) {
  try {
    const u = new URL(url);
    return u.searchParams.get("docid") || u.searchParams.get("docId") || null;
  } catch {
    return null;
  }
}

function extractDocIdsFromText(text) {
  const ids = [];
  if (!text) return ids;
  const patterns = [
    /[?&]docid=(\d{5,})/gi,
    /\bdocid["'\s:=]+(\d{5,})/gi,
    /\bdocId["'\s:=]+(\d{5,})/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) ids.push(m[1]);
  }
  return ids;
}

function collectRuntimeArtifactsFromText(text) {
  const urls = text.match(/https?:\/\/[^"'\\s>]*SingleDocumentViewer\.aspx\?docid=\d+/gi) || [];
  for (const u of urls) runtimeViewerUrls.add(u);
  for (const id of extractDocIdsFromText(text)) runtimeDocIds.add(id);
}

function clearRuntimeArtifacts() {
  runtimeViewerUrls.clear();
  runtimeDocIds.clear();
}

async function hasNoStatementAvailable(page) {
  const directLinks = await page
    .locator("a[href*='SingleDocumentViewer.aspx' i], a[href*='DownloadHandler.ashx' i], a.DocPageSave")
    .count()
    .catch(() => 0);
  if (directLinks > 0) return false;

  const mainText = await page.locator("body").innerText().catch(() => "");
  if (NO_STATEMENT_TEXT_REGEX.test(mainText)) return true;

  for (const frame of page.frames()) {
    const text = await frame.locator("body").innerText().catch(() => "");
    if (NO_STATEMENT_TEXT_REGEX.test(text)) return true;
  }

  return false;
}

async function collectViewerUrls(page) {
  const urls = new Set();
  const docIds = new Set();
  const fromMain = await page
    .$$eval("a[href*='SingleDocumentViewer.aspx' i], a[href*='eStatements' i], a[href*='docid=' i]", (els) =>
      els.map((el) => el.getAttribute("href") || "").filter(Boolean)
    )
    .catch(() => []);
  for (const href of fromMain) {
    const abs = makeAbsoluteUrl(href, page.url());
    if (abs) {
      urls.add(abs);
      const id = extractDocId(abs);
      if (id) docIds.add(id);
    }
  }

  for (const frame of page.frames()) {
    const frameUrls = await frame
      .$$eval("a[href*='SingleDocumentViewer.aspx' i], a[href*='eStatements' i], a[href*='docid=' i]", (els) =>
        els.map((el) => el.getAttribute("href") || "").filter(Boolean)
      )
      .catch(() => []);
    for (const href of frameUrls) {
      const abs = makeAbsoluteUrl(href, frame.url() || page.url());
      if (abs) {
        urls.add(abs);
        const id = extractDocId(abs);
        if (id) docIds.add(id);
      }
    }
  }

  const htmlMatches = await page
    .content()
    .then((html) => html.match(/https?:\/\/[^"'\\s>]*SingleDocumentViewer\.aspx\?docid=\d+/gi) || [])
    .catch(() => []);
  for (const m of htmlMatches) {
    urls.add(m);
    const id = extractDocId(m);
    if (id) docIds.add(id);
  }

  for (const frame of page.frames()) {
    const frameMatches = await frame
      .content()
      .then((html) => html.match(/https?:\/\/[^"'\\s>]*SingleDocumentViewer\.aspx\?docid=\d+/gi) || [])
      .catch(() => []);
    for (const m of frameMatches) {
      urls.add(m);
      const id = extractDocId(m);
      if (id) docIds.add(id);
    }
  }

  const pageText = await page.content().catch(() => "");
  collectRuntimeArtifactsFromText(pageText);
  for (const id of extractDocIdsFromText(pageText)) docIds.add(id);
  for (const frame of page.frames()) {
    const txt = await frame.content().catch(() => "");
    collectRuntimeArtifactsFromText(txt);
    for (const id of extractDocIdsFromText(txt)) docIds.add(id);
  }

  for (const u of runtimeViewerUrls) urls.add(u);
  for (const id of runtimeDocIds) docIds.add(id);

  return { viewerUrls: [...urls], docIds: [...docIds] };
}

async function tryDownloadFromViewerUrl(page, label, index) {
  const { viewerUrls, docIds } = await collectViewerUrls(page);
  const docIdSet = new Set(docIds);
  if (!viewerUrls.length && !docIdSet.size) return false;

  const candidates = new Set();
  for (const u of viewerUrls) {
    candidates.add(u);
    const docId = extractDocId(u);
    if (!docId) continue;
    const base = new URL(u);
    const root = `${base.origin}`;
    candidates.add(`${root}/eStatements/DownloadHandler.ashx?docid=${encodeURIComponent(docId)}`);
    candidates.add(`${root}/eStatements/SingleDocumentViewer.aspx?docid=${encodeURIComponent(docId)}&download=1`);
    candidates.add(`${root}/eStatements/Download.aspx?docid=${encodeURIComponent(docId)}`);
    candidates.add(`${root}/eStatements/DownloadPdf.aspx?docid=${encodeURIComponent(docId)}`);
    candidates.add(`${root}/eStatements/GetDocument.aspx?docid=${encodeURIComponent(docId)}`);
    candidates.add(`${root}/eStatements/DownloadStatement.aspx?docid=${encodeURIComponent(docId)}`);
    candidates.add(`${root}/eStatements/DocumentDownload.aspx?docid=${encodeURIComponent(docId)}`);
  }
  for (const id of docIdSet) {
    candidates.add(`${KGS_STATEMENTS_ORIGIN}/eStatements/DownloadHandler.ashx?docid=${encodeURIComponent(id)}`);
    candidates.add(`${KGS_STATEMENTS_ORIGIN}/eStatements/SingleDocumentViewer.aspx?docid=${encodeURIComponent(id)}`);
    candidates.add(`${KGS_STATEMENTS_ORIGIN}/eStatements/SingleDocumentViewer.aspx?docid=${encodeURIComponent(id)}&download=1`);
    candidates.add(`${KGS_STATEMENTS_ORIGIN}/eStatements/Download.aspx?docid=${encodeURIComponent(id)}`);
    candidates.add(`${KGS_STATEMENTS_ORIGIN}/eStatements/DownloadPdf.aspx?docid=${encodeURIComponent(id)}`);
    candidates.add(`${KGS_STATEMENTS_ORIGIN}/eStatements/GetDocument.aspx?docid=${encodeURIComponent(id)}`);
    candidates.add(`${KGS_STATEMENTS_ORIGIN}/eStatements/DownloadStatement.aspx?docid=${encodeURIComponent(id)}`);
    candidates.add(`${KGS_STATEMENTS_ORIGIN}/eStatements/DocumentDownload.aspx?docid=${encodeURIComponent(id)}`);
  }

  for (const url of candidates) {
    const resp = await page.request.get(url, { timeout: TIMEOUT_MS, failOnStatusCode: false }).catch(() => null);
    if (!resp || !resp.ok()) continue;
    const type = (resp.headers()["content-type"] || "").toLowerCase();
    const disposition = (resp.headers()["content-disposition"] || "").toLowerCase();
    const looksPdf = type.includes("pdf") || disposition.includes("attachment");
    if (looksPdf) {
      log(`Downloading newest statement for ${label} via direct URL`);
      await savePdfResponse(resp, label, index);
      return true;
    }

    if (resp && resp.ok()) {
      const text = await resp.text().catch(() => "");
      collectRuntimeArtifactsFromText(text);
      const innerIds = extractDocIdsFromText(text);
      for (const id of innerIds) docIdSet.add(id);
    }
  }

  return false;
}

async function clickFirstStatementDownload(page, label, index) {
  if (await hasNoStatementAvailable(page)) {
    throw new Error(`No statement available for ${label}.`);
  }

  const pickVisible = async (locator) => {
    const count = await locator.count();
    for (let i = 0; i < Math.min(count, 30); i += 1) {
      const candidate = locator.nth(i);
      const visible = await candidate.isVisible().catch(() => false);
      if (!visible) continue;
      const ariaHidden = (await candidate.getAttribute("aria-hidden").catch(() => "")) || "";
      const className = ((await candidate.getAttribute("class").catch(() => "")) || "").toLowerCase();
      const isDocSave = className.includes("docpagesave");
      if (ariaHidden.toLowerCase() === "true" && !isDocSave) continue;
      const box = await candidate.boundingBox().catch(() => null);
      if (!box || box.width < 4 || box.height < 4) continue;
      return candidate;
    }
    return null;
  };

  const directDownloaded = await tryDownloadFromViewerUrl(page, label, index);
  if (directDownloaded) return;

  if (!KGS_ALLOW_UI_DOWNLOAD_CLICK) {
    throw new Error(
      `Direct statement URL/docid not found for ${label}. Set KGS_ALLOW_UI_DOWNLOAD_CLICK=1 to permit UI save-button clicking.`
    );
  }

  let trigger = null;
  const firstRow = page.locator(FIRST_STATEMENT_ROW_SELECTOR).first();
  const hasRow = (await firstRow.count()) > 0;
  if (hasRow) {
    await firstRow.waitFor({ state: "visible", timeout: TIMEOUT_MS }).catch(() => null);
    await firstRow.scrollIntoViewIfNeeded().catch(() => null);
    const rowTrigger = await pickVisible(firstRow.locator(DOWNLOAD_TRIGGER_SELECTOR));
    if (rowTrigger) trigger = rowTrigger;
  }

  if (!trigger) {
    const docPageSave = await pickVisible(page.locator("a.DocPageSave"));
    if (docPageSave) trigger = docPageSave;
  }

  if (!trigger) {
    const direct = await pickVisible(
      page.locator("a[href*='SingleDocumentViewer.aspx' i], a[href*='eStatements' i], a[href*='statement' i]")
    );
    if (direct) trigger = direct;
  }

  if (!trigger) {
    const generic = await pickVisible(page.locator(DOWNLOAD_TRIGGER_SELECTOR));
    if (generic) trigger = generic;
  }

  if (!trigger) {
    throw new Error(`Download trigger not found for ${label}. Set KGS_DOWNLOAD_TRIGGER_SELECTOR.`);
  }

  log(`Downloading newest statement for ${label}`);
  const downloadPromise = page.waitForEvent("download", { timeout: TIMEOUT_MS }).catch(() => null);
  const pdfResponsePromise = page
    .waitForResponse(
      (resp) => {
        const type = (resp.headers()["content-type"] || "").toLowerCase();
        return type.includes("pdf") || /\.pdf(?:\?|$)/i.test(resp.url());
      },
      { timeout: TIMEOUT_MS }
    )
    .catch(() => null);

  const beforeUrl = page.url();
  await trigger.scrollIntoViewIfNeeded().catch(() => null);
  let clicked = false;
  try {
    await trigger.click({ timeout: TIMEOUT_MS });
    clicked = true;
  } catch {
    try {
      await trigger.click({ timeout: TIMEOUT_MS, force: true });
      clicked = true;
    } catch {
      try {
        await trigger.evaluate((el) => {
          if (el instanceof HTMLElement) el.click();
        });
        clicked = true;
      } catch {
        // Try iframe viewer button.
        for (const frame of page.frames()) {
          const frameTrigger = await pickVisible(frame.locator("a.DocPageSave"));
          if (!frameTrigger) continue;
          await frameTrigger.click({ timeout: TIMEOUT_MS }).catch(async () => {
            await frameTrigger.click({ timeout: TIMEOUT_MS, force: true }).catch(async () => {
              await frameTrigger.evaluate((el) => {
                if (el instanceof HTMLElement) el.click();
              });
            });
          });
          clicked = true;
          break;
        }
      }
    }
  }
  if (!clicked) throw new Error("Primary download trigger click failed.");

  const afterUrl = page.url();
  if (afterUrl !== beforeUrl && /kansasgasservice\.com\/?$/.test(afterUrl)) {
    throw new Error("Download click navigated to homepage instead of downloading.");
  }
  const [download, pdfResponse] = await Promise.all([downloadPromise, pdfResponsePromise]);

  if (download) {
    await saveDownload(download, label, index);
    return;
  }
  if (pdfResponse) {
    await savePdfResponse(pdfResponse, label, index);
    return;
  }

  const directRetry = await tryDownloadFromViewerUrl(page, label, index);
  if (directRetry) return;

  throw new Error(`Click did not produce a file download for ${label}.`);
}

async function getNativeSelectOptions(page) {
  const select = page.locator(ADDRESS_SELECT_SELECTOR).first();
  if ((await select.count()) === 0) return [];
  await select.waitFor({ state: "visible", timeout: TIMEOUT_MS });
  const options = await select.evaluate((el) => {
    const s = /** @type {HTMLSelectElement} */ (el);
    return Array.from(s.options).map((opt) => ({
      value: opt.value.trim(),
      text: (opt.textContent || "").trim(),
      disabled: opt.disabled,
    }));
  });
  return options.filter((o) => !o.disabled && o.value && !/select|choose/i.test(o.text));
}

async function iterateNativeSelect(page) {
  const select = page.locator(ADDRESS_SELECT_SELECTOR).first();
  const options = await getNativeSelectOptions(page);
  if (!options.length) return 0;

  log(`Found ${options.length} addresses in native select`);
  let total = 0;
  let idx = 1;
  for (const opt of options) {
    log(`Selecting address: ${opt.text || opt.value}`);
    await Promise.all([
      page.waitForLoadState("domcontentloaded", { timeout: TIMEOUT_MS }).catch(() => null),
      select.selectOption(opt.value),
    ]);
    await page.waitForLoadState("networkidle", { timeout: TIMEOUT_MS }).catch(() => null);
    await page.waitForTimeout(SETTLE_DELAY_MS);
    await openStatementsTab(page);
    await clickFirstStatementDownload(page, opt.text || opt.value, idx);
    total += 1;
    idx += 1;
  }
  return total;
}

async function openAngularAddressMenu(page) {
  const existing = page.locator(ANGULAR_DROPDOWN_MENU_SELECTOR).first();
  if ((await existing.count()) > 0 && (await existing.isVisible().catch(() => false))) return true;

  const triggers = page.locator(ANGULAR_DROPDOWN_TRIGGER_SELECTOR);
  const count = await triggers.count();
  for (let i = 0; i < Math.min(count, 20); i += 1) {
    const t = triggers.nth(i);
    const visible = await t.isVisible().catch(() => false);
    if (!visible) continue;
    const text = ((await t.innerText().catch(() => "")) || "").trim();
    if (PAYMENT_TEXT_REGEX.test(text)) continue;
    await t.click({ timeout: 3000 }).catch(() => null);
    const menu = page.locator(ANGULAR_DROPDOWN_MENU_SELECTOR).first();
    if ((await menu.count()) > 0 && (await menu.isVisible().catch(() => false))) return true;
  }
  return false;
}

async function iterateAngularDropdown(page) {
  const ensureAccountPage = async () => {
    if (!/kansasgasservice\.com\/account/i.test(page.url())) {
      await page.goto(KGS_ACCOUNT_URL, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: TIMEOUT_MS }).catch(() => null);
      await page.waitForTimeout(SETTLE_DELAY_MS);
    }
  };

  const opened = await openAngularAddressMenu(page);
  if (!opened) return 0;

  let labels = await page.locator(ANGULAR_DROPDOWN_ITEM_SELECTOR).allInnerTexts().catch(() => []);
  labels = labels
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter((t) => t && !/^kansas gas service$/i.test(t) && !/^loan account$/i.test(t));

  if (ACCOUNT_TEXT_TOKENS.length) {
    const set = new Set(ACCOUNT_TEXT_TOKENS.map((x) => x.toLowerCase()));
    labels = labels.filter((l) => set.has(l.toLowerCase()) || ACCOUNT_TEXT_TOKENS.some((t) => l.toLowerCase().includes(t.toLowerCase())));
  }
  labels = unique(labels);
  if (!labels.length) return 0;

  log(`Found ${labels.length} addresses in angular dropdown`);
  let total = 0;
  let idx = 1;
  for (const label of labels) {
    await ensureAccountPage();
    await openAngularAddressMenu(page);
    const option = page
      .locator(ANGULAR_DROPDOWN_ITEM_SELECTOR)
      .filter({ hasText: new RegExp(`^\\s*${escapeRegex(label)}\\s*$`, "i") })
      .first();
    if ((await option.count()) === 0) continue;
    await option.click({ timeout: TIMEOUT_MS });
    await page.waitForLoadState("networkidle", { timeout: TIMEOUT_MS }).catch(() => null);
    await page.waitForTimeout(SETTLE_DELAY_MS);
    clearRuntimeArtifacts();
    try {
      await openStatementsTab(page);
      await clickFirstStatementDownload(page, label, idx);
      total += 1;
      idx += 1;
    } catch (err) {
      log(`Skipping angular item ${label}: ${err.message}`);
      await ensureAccountPage();
    }
  }
  return total;
}

async function collectListboxLabels(page) {
  const trigger = page.locator(ADDRESS_DROPDOWN_TRIGGER_SELECTOR).first();
  if ((await trigger.count()) === 0) return [];
  await trigger.click({ timeout: TIMEOUT_MS });
  const options = page.locator(ADDRESS_OPTION_SELECTOR);
  await options.first().waitFor({ state: "visible", timeout: TIMEOUT_MS });
  const labels = await options.allInnerTexts();
  await page.keyboard.press("Escape").catch(() => null);
  return labels.map((t) => t.trim()).filter((t) => t && !/select|choose/i.test(t));
}

async function iterateListboxDropdown(page) {
  const trigger = page.locator(ADDRESS_DROPDOWN_TRIGGER_SELECTOR).first();
  if ((await trigger.count()) === 0) return 0;

  const labels = await collectListboxLabels(page);
  if (!labels.length) return 0;

  log(`Found ${labels.length} addresses in listbox dropdown`);
  let total = 0;
  let idx = 1;
  for (const label of labels) {
    await trigger.click({ timeout: TIMEOUT_MS });
    const option = page.locator(ADDRESS_OPTION_SELECTOR).filter({ hasText: new RegExp(`^\\s*${escapeRegex(label)}\\s*$`) }).first();
    await option.click({ timeout: TIMEOUT_MS });
    await page.waitForLoadState("networkidle", { timeout: TIMEOUT_MS }).catch(() => null);
    await page.waitForTimeout(SETTLE_DELAY_MS);
    clearRuntimeArtifacts();
    await openStatementsTab(page);
    await clickFirstStatementDownload(page, label, idx);
    total += 1;
    idx += 1;
  }
  return total;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function selectByComboboxToken(page, token) {
  const combos = page.locator(ADDRESS_COMBOBOX_SELECTOR);
  const count = await combos.count();
  if (!count) return false;

  let combo = null;
  for (let i = 0; i < count; i += 1) {
    const candidate = combos.nth(i);
    const visible = await candidate.isVisible().catch(() => false);
    if (!visible) continue;
    const box = await candidate.boundingBox().catch(() => null);
    if (!box || box.width < 8 || box.height < 8) continue;
    if (box.y + box.height < 0) continue;
    combo = candidate;
    break;
  }
  if (!combo) return false;

  await combo.click({ timeout: TIMEOUT_MS });
  const tagName = await combo.evaluate((el) => el.tagName.toLowerCase());
  if (tagName === "input") {
    await combo.fill(token, { timeout: TIMEOUT_MS });
  } else {
    await page.keyboard.press("Control+a").catch(() => null);
    await page.keyboard.type(token);
  }
  await page.keyboard.press("Enter");
  await page.waitForLoadState("networkidle", { timeout: TIMEOUT_MS }).catch(() => null);
  await page.waitForTimeout(SETTLE_DELAY_MS);
  return true;
}

async function iterateComboboxTokens(page) {
  const tokens = unique([...ACCOUNT_TOKENS, ...(await discoverAccountTokens(page))]);
  if (!tokens.length) return 0;

  log(`Trying combobox account iteration with ${tokens.length} token(s)`);
  let total = 0;
  let idx = 1;
  for (const token of tokens) {
    const selected = await selectByComboboxToken(page, token).catch(() => false);
    if (!selected) break;
    clearRuntimeArtifacts();
    try {
      await openStatementsTab(page);
      await clickFirstStatementDownload(page, token, idx);
      total += 1;
      idx += 1;
    } catch (err) {
      log(`Skipping token ${token}: ${err.message}`);
    }
  }
  return total;
}

async function clickAccountItemByText(page, token) {
  const escaped = escapeRegex(token);
  const candidates = page.locator(ACCOUNT_ITEM_SELECTOR).filter({ hasText: new RegExp(escaped, "i") });
  const count = await candidates.count();
  if (!count) return false;

  for (let i = 0; i < Math.min(count, 40); i += 1) {
    const item = candidates.nth(i);
    const visible = await item.isVisible().catch(() => false);
    if (!visible) continue;
    const box = await item.boundingBox().catch(() => null);
    if (!box || box.width < 6 || box.height < 6) continue;
    const text = (await item.innerText().catch(() => "")).trim();
    if (PAYMENT_TEXT_REGEX.test(text)) continue;

    const tag = await item.evaluate((el) => el.tagName.toLowerCase()).catch(() => "");
    const href = await item.getAttribute("href").catch(() => "");
    const dataHref = await item.getAttribute("data-href").catch(() => "");
    const navHints = `${href || ""} ${dataHref || ""}`.toLowerCase();
    if (PAYMENT_TEXT_REGEX.test(navHints)) continue;
    if (tag === "a" && /payment|pay\b/i.test(navHints)) continue;

    await item.scrollIntoViewIfNeeded().catch(() => null);
    await item.click({ timeout: TIMEOUT_MS }).catch(() => null);
    await page.waitForLoadState("networkidle", { timeout: TIMEOUT_MS }).catch(() => null);
    await page.waitForTimeout(SETTLE_DELAY_MS);

    const url = page.url().toLowerCase();
    if (/payment|pay-bill|make-payment/.test(url)) {
      log(`Token ${token} navigated to payment page (${page.url()}); returning to account page`);
      await page.goto(KGS_ACCOUNT_URL, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: TIMEOUT_MS }).catch(() => null);
      await page.waitForTimeout(SETTLE_DELAY_MS);
      continue;
    }

    return true;
  }

  return false;
}

async function collectDataAttributeAccounts(page) {
  return page
    .evaluate(() => {
      const normalize = (s) => String(s || "").replace(/\s+/g, " ").trim();
      const visible = (el) => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return (
          style &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          rect.width >= 24 &&
          rect.height >= 16
        );
      };

      const selectors = [
        "[data-account-number]",
        "[data-account]",
        "[data-address]",
        "[data-premise-id]",
        "[data-premise]",
        "[data-building-id]",
      ];

      const items = [];
      for (const selector of selectors) {
        for (const el of document.querySelectorAll(selector)) {
          if (!(el instanceof HTMLElement) || !visible(el)) continue;
          const text = normalize(el.innerText || el.textContent || "");
          const attrs = {};
          for (const name of el.getAttributeNames()) {
            attrs[name] = el.getAttribute(name) || "";
          }
          items.push({ text, attrs });
        }
      }
      return items;
    })
    .catch(() => []);
}

async function clickDataAttributeAccount(page, item) {
  const entries = Object.entries(item?.attrs || {}).filter(([, value]) => String(value || "").trim());
  for (const [name, value] of entries) {
    const escaped = String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const selector = `[${name}="${escaped}"]`;
    const candidate = page.locator(selector).first();
    if ((await candidate.count().catch(() => 0)) === 0) continue;
    if (!(await candidate.isVisible().catch(() => false))) continue;
    await candidate.scrollIntoViewIfNeeded().catch(() => null);
    await candidate.click({ timeout: TIMEOUT_MS }).catch(() => null);
    await page.waitForLoadState("networkidle", { timeout: TIMEOUT_MS }).catch(() => null);
    await page.waitForTimeout(SETTLE_DELAY_MS);
    return true;
  }
  return item?.text ? clickAccountItemByText(page, item.text) : false;
}

async function iterateDataAttributeAccounts(page) {
  const items = await collectDataAttributeAccounts(page);
  if (!items.length) return 0;

  log(`Trying data-attribute account iteration with ${items.length} candidate(s)`);
  let total = 0;
  let idx = 1;
  for (const item of items) {
    const clicked = await clickDataAttributeAccount(page, item).catch(() => false);
    if (!clicked) continue;
    clearRuntimeArtifacts();
    try {
      await openStatementsTab(page);
      await clickFirstStatementDownload(page, item.text || `account-${idx}`, idx);
      total += 1;
      idx += 1;
    } catch (err) {
      log(`Skipping data-attribute account ${item.text || idx}: ${err.message}`);
    }
  }
  return total;
}

async function iterateByTextTokens(page) {
  const discovered = await discoverAccountTokens(page);
  const tokens = unique([...ACCOUNT_TEXT_TOKENS, ...ACCOUNT_TOKENS, ...discovered]);
  if (!tokens.length) return 0;

  log(`Trying text-match account selection with ${tokens.length} token(s)`);
  let total = 0;
  let idx = 1;
  for (const token of tokens) {
    const clicked = await clickAccountItemByText(page, token).catch(() => false);
    if (!clicked) continue;
    clearRuntimeArtifacts();
    try {
      await openStatementsTab(page);
      await clickFirstStatementDownload(page, token, idx);
      total += 1;
      idx += 1;
    } catch (err) {
      log(`Skipping text token ${token}: ${err.message}`);
    }
  }
  return total;
}

async function tryCurrentAccount(page) {
  clearRuntimeArtifacts();
  try {
    await openStatementsTab(page);
    await clickFirstStatementDownload(page, "current-account", 1);
    return 1;
  } catch {
    return 0;
  }
}

async function collectVisibleAccountLabels(page) {
  const candidates = page.locator(ACCOUNT_ITEM_SELECTOR);
  const count = await candidates.count();
  const labels = [];

  for (let i = 0; i < Math.min(count, 120); i += 1) {
    const item = candidates.nth(i);
    const visible = await item.isVisible().catch(() => false);
    if (!visible) continue;
    const box = await item.boundingBox().catch(() => null);
    if (!box || box.width < 24 || box.height < 16) continue;
    const text = normalizeWhitespace(await item.innerText().catch(() => ""));
    if (!looksLikeAccountLabel(text)) continue;
    labels.push(text);
  }

  return unique(labels);
}

async function iterateVisibleAccountItems(page) {
  const labels = await collectVisibleAccountLabels(page);
  if (!labels.length) return 0;

  log(`Trying visible account item iteration with ${labels.length} candidate(s)`);
  let total = 0;
  let idx = 1;
  for (const label of labels) {
    const clicked = await clickAccountItemByText(page, label).catch(() => false);
    if (!clicked) continue;
    clearRuntimeArtifacts();
    try {
      await openStatementsTab(page);
      await clickFirstStatementDownload(page, label, idx);
      total += 1;
      idx += 1;
    } catch (err) {
      log(`Skipping visible account item ${label}: ${err.message}`);
    }
  }
  return total;
}

async function iterateExplicitValues(page) {
  if (!ADDRESS_VALUES.length) return 0;

  const select = page.locator(ADDRESS_SELECT_SELECTOR).first();
  if ((await select.count()) === 0) {
    throw new Error("KGS_ADDRESS_VALUES requires a native <select>. Set KGS_ADDRESS_SELECT_SELECTOR.");
  }

  log(`Using KGS_ADDRESS_VALUES list (${ADDRESS_VALUES.length})`);
  let total = 0;
  let idx = 1;
  for (const value of ADDRESS_VALUES) {
    await Promise.all([
      page.waitForLoadState("domcontentloaded", { timeout: TIMEOUT_MS }).catch(() => null),
      select.selectOption(value),
    ]);
    await page.waitForLoadState("networkidle", { timeout: TIMEOUT_MS }).catch(() => null);
    await page.waitForTimeout(SETTLE_DELAY_MS);
    clearRuntimeArtifacts();
    await openStatementsTab(page);
    await clickFirstStatementDownload(page, value, idx);
    total += 1;
    idx += 1;
  }
  return total;
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
  page.on("response", async (resp) => {
    try {
      const url = resp.url();
      if (/docid=|SingleDocumentViewer\.aspx|eStatements/i.test(url)) {
        collectRuntimeArtifactsFromText(url);
      }
      const ct = (resp.headers()["content-type"] || "").toLowerCase();
      if (
        /docid=|SingleDocumentViewer\.aspx|eStatements/i.test(url) ||
        ct.includes("json") ||
        ct.includes("xml") ||
        ct.includes("text")
      ) {
        const text = await resp.text().catch(() => "");
        if (text) collectRuntimeArtifactsFromText(text);
      }
    } catch {
      // ignore observer errors
    }
  });

  try {
    await ensureAuthenticated(page, isSetup || MFA_PROMPT_IN_DOWNLOAD);

    if (isSetup) {
      log("Setup complete. Login session is saved.");
      log("Run `npm run kgs:download` to download newest statement for each address.");
      return;
    }

    let totalSaved = await tryCurrentAccount(page);
    if (!totalSaved) totalSaved = await iterateExplicitValues(page);
    if (!totalSaved) totalSaved = await iterateNativeSelect(page);
    if (!totalSaved) totalSaved = await iterateListboxDropdown(page);
    if (!totalSaved) totalSaved = await iterateAngularDropdown(page);
    if (!totalSaved) totalSaved = await iterateComboboxTokens(page);
    if (!totalSaved) totalSaved = await iterateByTextTokens(page);
    if (!totalSaved) totalSaved = await iterateDataAttributeAccounts(page);
    if (!totalSaved) totalSaved = await iterateVisibleAccountItems(page);
    if (!totalSaved) {
      await dumpDebugArtifacts(page, "no-address-options");
      throw new Error(
        "No address options found. Set KGS selectors or provide KGS_ACCOUNT_TOKENS/KGS_ACCOUNT_TEXT_TOKENS."
      );
    }

    log(`Done. Total saved: ${totalSaved}`);
    log(`Statements folder: ${path.relative(ROOT, DOWNLOAD_DIR)}`);
  } catch (err) {
    await holdBrowserOpenOnFailure(page, err);
    throw err;
  } finally {
    await context.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

