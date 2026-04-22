#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const args = new Set(process.argv.slice(2));
const isSetup = args.has("--setup");
const argScope = args.has("--all-bills")
  ? "all"
  : args.has("--current-month")
    ? "current"
    : null;

const ROOT = process.cwd();
const PROFILE_DIR = path.join(ROOT, "automation-data", "evergy-profile");
const DOWNLOAD_DIR = path.join(ROOT, "automation-data", "evergy-bills");
const VIEW_BILLS_URL =
  process.env.EVERGY_VIEW_BILLS_URL ||
  "https://www.evergy.com/ala/accounts/account-info/view-bills?accountNumber=2801394045";
const ACCOUNT_NUMBERS = (process.env.EVERGY_ACCOUNT_NUMBERS || "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);
const ACCOUNT_DROPDOWN_SELECTOR =
  process.env.EVERGY_ACCOUNT_DROPDOWN_SELECTOR ||
  "select[name*='account' i], select[id*='account' i], select[aria-label*='account' i]";
const FIRST_BILL_ROW_SELECTOR = process.env.EVERGY_FIRST_BILL_ROW_SELECTOR || "table tbody tr";
const DOWNLOAD_TRIGGER_SELECTOR =
  process.env.EVERGY_DOWNLOAD_TRIGGER_SELECTOR ||
  "a:has(img), button:has(img), a[title*='download' i], button[title*='download' i], img[alt*='download' i], a[href*='.pdf' i]";
const TIMEOUT_MS = Number.parseInt(process.env.EVERGY_TIMEOUT_MS || "90000", 10);
const SETTLE_DELAY_MS = Number.parseInt(process.env.EVERGY_SETTLE_DELAY_MS || "1500", 10);
const DEBUG_DUMP_ON_FAILURE = (process.env.EVERGY_DEBUG_DUMP_ON_FAILURE || "1") !== "0";
const BILLS_API_TEMPLATE_FALLBACK = "/sc-api/account/bills/{accountNumber}";
const EVERGY_USERNAME = process.env.EVERGY_USERNAME || "";
const EVERGY_PASSWORD = process.env.EVERGY_PASSWORD || "";
const USERNAME_SELECTOR =
  process.env.EVERGY_USERNAME_SELECTOR ||
  "input[type='email'], input[name*='user' i], input[id*='user' i], input[name*='email' i], input[id*='email' i], input[name*='login' i], input[id*='login' i]";
const PASSWORD_SELECTOR = process.env.EVERGY_PASSWORD_SELECTOR || "input[type='password']";
const LOGIN_SUBMIT_SELECTOR =
  process.env.EVERGY_LOGIN_SUBMIT_SELECTOR ||
  "button[type='submit'], input[type='submit'], button:has-text('Sign In'), button:has-text('Log In'), button:has-text('Login')";
const MFA_PROMPT_IN_DOWNLOAD = (process.env.EVERGY_MFA_PROMPT_IN_DOWNLOAD || "1") !== "0";
const DOWNLOAD_SCOPE_ENV = (process.env.EVERGY_DOWNLOAD_SCOPE || "").trim().toLowerCase();
const ADMIN_AUTO_CONTINUE_PROMPTS = process.env.ADMIN_AUTO_CONTINUE_PROMPTS === "1";
const ADMIN_NON_INTERACTIVE_WAIT_MS = Number.parseInt(
  process.env.ADMIN_NON_INTERACTIVE_WAIT_MS || "60000",
  10
);

/**
 * @typedef {"current" | "all"} DownloadScope
 */

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

async function chooseDownloadScope() {
  if (argScope) return argScope;
  if (DOWNLOAD_SCOPE_ENV === "all" || DOWNLOAD_SCOPE_ENV === "current") {
    return DOWNLOAD_SCOPE_ENV;
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) return "current";

  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question(
      "Download scope? [C]urrent month (default) or [A]ll bills: "
    );
    if (/^\s*a(ll)?\s*$/i.test(answer || "")) return "all";
    return "current";
  } finally {
    rl.close();
  }
}

function contentDispositionFileName(headerValue) {
  if (!headerValue) return null;
  const utf8Match = headerValue.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1].replace(/["']/g, ""));
  const asciiMatch = headerValue.match(/filename="?([^";]+)"?/i);
  if (asciiMatch?.[1]) return asciiMatch[1].trim();
  return null;
}

function sanitizeFileName(name) {
  return name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").replace(/\s+/g, " ").trim();
}

function fileNameLooksLikeBill(name) {
  const normalized = String(name || "").toLowerCase();
  if (!normalized) return false;
  if (normalized.includes("insert")) return false;
  return normalized.includes("bill");
}

function fileNameFromUrl(urlLike) {
  if (!urlLike) return "";
  try {
    const url = new URL(String(urlLike));
    const byParam =
      url.searchParams.get("filename") ||
      url.searchParams.get("fileName") ||
      url.searchParams.get("name");
    if (byParam) return sanitizeFileName(decodeURIComponent(byParam));

    const pathname = url.pathname || "";
    const tail = pathname.split("/").filter(Boolean).pop() || "";
    return sanitizeFileName(decodeURIComponent(tail));
  } catch {
    return "";
  }
}

async function hasLoginForm(page) {
  const username = page.locator(USERNAME_SELECTOR).first();
  const password = page.locator(PASSWORD_SELECTOR).first();
  return (await username.count()) > 0 && (await password.count()) > 0;
}

async function hasBillsContext(page) {
  const byScript = page.locator("#data-AccountSelection").first();
  const byViewBills = page.locator("[data-component='ViewBills']").first();
  const url = page.url();
  if (url.includes("/view-bills")) return true;
  if ((await byScript.count()) > 0) return true;
  if ((await byViewBills.count()) > 0) return true;
  return false;
}

async function attemptAutofillLogin(page) {
  if (!EVERGY_USERNAME || !EVERGY_PASSWORD) return false;
  if (!(await hasLoginForm(page))) return false;

  log("Login form detected. Attempting credential autofill.");
  const username = page.locator(USERNAME_SELECTOR).first();
  const password = page.locator(PASSWORD_SELECTOR).first();
  await username.fill(EVERGY_USERNAME, { timeout: TIMEOUT_MS });
  await password.fill(EVERGY_PASSWORD, { timeout: TIMEOUT_MS });

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

async function ensureAuthenticated(page, interactiveMfaPrompt) {
  log(`Opening bills page: ${VIEW_BILLS_URL}`);
  await page.goto(VIEW_BILLS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: TIMEOUT_MS }).catch(() => null);
  await page.waitForTimeout(SETTLE_DELAY_MS);

  if (await hasBillsContext(page)) return;

  const didAutofill = await attemptAutofillLogin(page);
  if (didAutofill && (await hasBillsContext(page))) return;

  if (interactiveMfaPrompt) {
    await promptEnter(
      "If prompted, complete login/MFA in the browser and return to the bills page."
    );
    await page.goto(VIEW_BILLS_URL, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: TIMEOUT_MS }).catch(() => null);
    await page.waitForTimeout(SETTLE_DELAY_MS);
    if (await hasBillsContext(page)) return;
  }

  if (!(EVERGY_USERNAME && EVERGY_PASSWORD)) {
    throw new Error(
      "Authentication required and EVERGY_USERNAME/EVERGY_PASSWORD are not set. Set them in environment and retry."
    );
  }

  throw new Error(
    "Authentication did not reach the bills page. Check login selectors, credentials, or complete MFA manually."
  );
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

function buildAccountUrl(accountNumber) {
  const url = new URL(VIEW_BILLS_URL);
  url.searchParams.set("accountNumber", accountNumber);
  return url.toString();
}

function extractPdfCandidatesFromHtml(html, baseUrl) {
  const text = String(html || "");
  const candidates = new Set();

  const pushCandidate = (raw) => {
    const v = String(raw || "").trim().replace(/^["']|["']$/g, "");
    if (!v) return;
    try {
      candidates.add(new URL(v, baseUrl).toString());
    } catch {
      // ignore invalid URLs
    }
  };

  const patterns = [
    /https?:\/\/[^\s"'<>]+/gi,
    /href\s*=\s*["']([^"']+)["']/gi,
    /location(?:\.href)?\s*=\s*["']([^"']+)["']/gi,
    /window\.open\(\s*["']([^"']+)["']/gi,
    /url\s*:\s*["']([^"']+)["']/gi,
  ];

  for (const re of patterns) {
    let m;
    while ((m = re.exec(text))) {
      pushCandidate(m[1] || m[0]);
    }
  }

  return Array.from(candidates).filter((u) =>
    /pdf|bill|download|statement|invoice|document/i.test(u)
  );
}

async function firstRowSignature(page) {
  const row = page.locator(FIRST_BILL_ROW_SELECTOR).first();
  if ((await row.count()) === 0) return "";
  return (await row.innerText()).trim().replace(/\s+/g, " ");
}

async function waitForBillsVisible(page, previousSignature = null) {
  const row = page.locator(FIRST_BILL_ROW_SELECTOR).first();
  await row.waitFor({ state: "visible", timeout: TIMEOUT_MS });

  if (!previousSignature) return;

  const started = Date.now();
  while (Date.now() - started < TIMEOUT_MS) {
    const currentSignature = await firstRowSignature(page);
    if (currentSignature && currentSignature !== previousSignature) return;
    await page.waitForTimeout(300);
  }
}

async function getAccountOptions(page) {
  const select = page.locator(ACCOUNT_DROPDOWN_SELECTOR).first();
  if ((await select.count()) === 0) return [];

  await select.waitFor({ state: "visible", timeout: TIMEOUT_MS });
  const options = await select.evaluate((el) => {
    const selectEl = /** @type {HTMLSelectElement} */ (el);
    return Array.from(selectEl.options).map((opt) => ({
      value: opt.value.trim(),
      text: (opt.textContent || "").trim(),
      disabled: opt.disabled,
    }));
  });

  return options.filter((opt) => {
    if (opt.disabled) return false;
    if (!opt.value) return false;
    if (/select|choose/i.test(opt.text)) return false;
    return true;
  });
}

function parseAccountNumber(value) {
  if (!value) return null;
  const match = String(value).match(/\b\d{8,16}\b/);
  return match?.[0] || null;
}

async function collectAccountNumbersFromPage(page) {
  const pageTitle = await page.title().catch(() => "");
  log(`Discovery context: URL=${page.url()} | title=${pageTitle}`);

  // Give account widgets time to mount on this template.
  await Promise.race([
    page.waitForSelector("#data-AccountSelection", { timeout: 5000 }).catch(() => null),
    page
      .waitForSelector("[data-component='AccountSelection']", { timeout: 5000 })
      .catch(() => null),
    page.waitForTimeout(5000),
  ]);

  const currentUrl = new URL(page.url());
  const fromCurrent = currentUrl.searchParams.get("accountNumber");

  const fromLinks = await page.$$eval("a[href*='accountNumber=']", (anchors) => {
    const values = [];
    for (const a of anchors) {
      const href = a.getAttribute("href");
      if (!href) continue;
      try {
        const url = new URL(href, window.location.href);
        const v = url.searchParams.get("accountNumber");
        if (v) values.push(v);
      } catch {
        // ignore bad URL
      }
    }
    return values;
  });

  const fromConfigJson = await page
    .$eval("#data-AccountSelection", (el) => {
      try {
        const data = JSON.parse((el.textContent || "").trim());
        if (!Array.isArray(data)) return [];
        return data.map((item) => item?.accountNumber).filter(Boolean);
      } catch {
        return [];
      }
    })
    .catch(() => []);

  const fromRawHtml = await page
    .content()
    .then((html) => {
      const matches = html.match(/"accountNumber"\s*:\s*"(\d{8,16})"/g) || [];
      return matches
        .map((m) => {
          const mm = m.match(/"accountNumber"\s*:\s*"(\d{8,16})"/);
          return mm?.[1] || null;
        })
        .filter(Boolean);
    })
    .catch(() => []);

  const fromOptions = await page
    .$$eval("select option", (opts) =>
      opts.map((opt) => ({
        value: opt.getAttribute("value") || "",
        text: (opt.textContent || "").trim(),
      }))
    )
    .catch(() => []);

  const fromText = await page
    .locator("body")
    .innerText()
    .then((txt) => txt.match(/\b\d{10,16}\b/g) || [])
    .catch(() => []);

  const candidates = [fromCurrent, ...fromLinks, ...fromConfigJson, ...fromRawHtml];
  for (const item of fromOptions) {
    candidates.push(item.value);
    candidates.push(item.text);
  }
  candidates.push(...fromText);

  const unique = [];
  const seen = new Set();
  for (const c of candidates) {
    const parsed = parseAccountNumber(c);
    if (!parsed) continue;
    if (seen.has(parsed)) continue;
    seen.add(parsed);
    unique.push(parsed);
  }
  return unique;
}

async function getBillsApiTemplate(page) {
  const mountedApi = await page
    .locator("[data-component='ViewBills']")
    .first()
    .getAttribute("data-api")
    .catch(() => null);
  if (mountedApi) return mountedApi;
  return BILLS_API_TEMPLATE_FALLBACK;
}

function normalizeBillApiUrl(template, accountNumber) {
  const resolved = template.replace("{accountNumber}", accountNumber);
  return new URL(resolved, VIEW_BILLS_URL).toString();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

async function parseBillsPayload(response, accountNumber) {
  const contentType = (response.headers()["content-type"] || "").toLowerCase();

  if (contentType.includes("json")) {
    return response.json();
  }

  const text = await response.text();

  if (contentType.includes("xml") || text.trim().startsWith("<")) {
    let XMLParser;
    try {
      ({ XMLParser } = await import("fast-xml-parser"));
    } catch {
      throw new Error(
        `Bills API returned XML for ${accountNumber}, but fast-xml-parser is unavailable. Run npm install and retry.`
      );
    }

    const parser = new XMLParser({
      ignoreAttributes: false,
      parseTagValue: true,
      trimValues: true,
      removeNSPrefix: true,
    });
    return parser.parse(text);
  }

  throw new Error(`Bills API returned unsupported content type for ${accountNumber}: ${contentType || "unknown"}`);
}

function findBillCandidates(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const item of node) findBillCandidates(item, out);
    return out;
  }

  const keys = Object.keys(node);
  const hasDownloadField = keys.some((k) => /billdownloadurl|download|href/i.test(k));
  if (hasDownloadField) out.push(node);

  for (const value of Object.values(node)) {
    findBillCandidates(value, out);
  }
  return out;
}

function extractStringDeep(node, keyRegex) {
  if (node == null) return null;
  if (typeof node === "string") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = extractStringDeep(item, keyRegex);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== "object") return null;

  for (const [key, value] of Object.entries(node)) {
    if (keyRegex.test(key)) {
      if (typeof value === "string" && value.trim()) return value.trim();
      if (value && typeof value === "object") {
        // Common XML parser shape can include nested text nodes.
        if (typeof value["#text"] === "string" && value["#text"].trim()) return value["#text"].trim();
      }
    }
  }

  for (const value of Object.values(node)) {
    if (typeof value === "string") {
      if (/https?:\/\/|\/[^ ]+/.test(value) && /(download|bill|statement|invoice|pdf)/i.test(value)) {
        return value.trim();
      }
      continue;
    }
    const found = extractStringDeep(value, keyRegex);
    if (found) return found;
  }

  return null;
}

function pickNewestBillRecord(payload) {
  const all = pickAllBillRecords(payload);
  return all[0] || null;
}

function pickAllBillRecords(payload) {
  const directArray = toArray(payload);
  if (directArray.length) return directArray;

  const objectPayload = payload && typeof payload === "object" ? payload : {};
  const candidates = [
    ...toArray(objectPayload.items),
    ...toArray(objectPayload.data),
    ...toArray(objectPayload.results),
    ...toArray(objectPayload.bills),
    ...toArray(objectPayload.rows),
  ];
  if (candidates.length) return candidates;

  const deepCandidates = findBillCandidates(objectPayload);
  return deepCandidates;
}

function normalizeDownloadUrl(downloadUrl) {
  const url = new URL(downloadUrl, VIEW_BILLS_URL);
  if (url.searchParams.get("download") !== "1") {
    url.searchParams.set("download", "1");
  }
  return url.toString();
}

function extractDownloadUrlFromBillRecord(record) {
  if (!record || typeof record !== "object") return null;
  const rawUrl =
    record.billDownloadUrl ||
    record.billDownloadURL ||
    record.BillDownloadUrl ||
    record.BillDownloadURL ||
    record.download ||
    record.Download ||
    record.href ||
    record.Href ||
    extractStringDeep(record, /billdownloadurl|download|href|url/i);
  return rawUrl ? normalizeDownloadUrl(String(rawUrl)) : null;
}

async function fetchBillsForAccount(page, accountNumber, scope = "current") {
  const template = await getBillsApiTemplate(page);
  const apiUrl = normalizeBillApiUrl(template, accountNumber);
  log(`Fetching bills API for ${accountNumber}`);

  const response = await page.request.get(apiUrl, {
    timeout: TIMEOUT_MS,
    failOnStatusCode: false,
  });
  if (!response.ok()) {
    throw new Error(`Bills API failed for ${accountNumber}: HTTP ${response.status()} (${apiUrl})`);
  }

  const payload = await parseBillsPayload(response, accountNumber);
  const records = pickAllBillRecords(payload).filter((record) => record && typeof record === "object");
  if (!records.length) {
    throw new Error(`No bill records found for ${accountNumber}`);
  }

  if (scope === "current") {
    const newest = pickNewestBillRecord(payload);
    const newestUrl = extractDownloadUrlFromBillRecord(newest);
    if (!newestUrl) {
      const keys = Object.keys(newest || {}).slice(0, 25).join(", ");
      log(`Newest record keys for ${accountNumber}: ${keys}`);
      throw new Error(`No bill download URL found in newest bill record for ${accountNumber}`);
    }
    return [newestUrl];
  }

  const urls = [];
  const seen = new Set();
  for (const record of records) {
    const url = extractDownloadUrlFromBillRecord(record);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }

  if (!urls.length) {
    const keys = Object.keys(records[0] || {}).slice(0, 25).join(", ");
    log(`Newest record keys for ${accountNumber}: ${keys}`);
    throw new Error(`No bill download URLs found for ${accountNumber}`);
  }
  return urls;
}

async function downloadBillFromUrl(page, billUrl, accountLabel, index) {
  log(`Downloading newest bill for ${accountLabel}`);
  let response = await page.request.get(billUrl, {
    timeout: TIMEOUT_MS,
    failOnStatusCode: false,
  });
  if (!response.ok()) {
    throw new Error(`Bill download failed for ${accountLabel}: HTTP ${response.status()} (${billUrl})`);
  }

  const type = (response.headers()["content-type"] || "").toLowerCase();
  const disposition = response.headers()["content-disposition"] || "";
  const isPdfish =
    type.includes("pdf") ||
    disposition.toLowerCase().includes("attachment") ||
    /\.pdf(?:\?|$)/i.test(billUrl);
  if (!isPdfish && type.includes("html")) {
    const html = await response.text().catch(() => "");
    const fallbackUrls = extractPdfCandidatesFromHtml(html, billUrl);
    for (const nextUrl of fallbackUrls) {
      log(`Retrying bill download via HTML fallback URL for ${accountLabel}: ${nextUrl}`);
      const retry = await page.request.get(nextUrl, {
        timeout: TIMEOUT_MS,
        failOnStatusCode: false,
      });
      if (!retry.ok()) continue;
      const retryType = (retry.headers()["content-type"] || "").toLowerCase();
      const retryDisposition = (retry.headers()["content-disposition"] || "").toLowerCase();
      const retryPdfish =
        retryType.includes("pdf") ||
        retryDisposition.includes("attachment") ||
        /\.pdf(?:\?|$)/i.test(nextUrl);
      if (!retryPdfish) continue;
      response = retry;
      billUrl = nextUrl;
      break;
    }
  }

  const finalType = (response.headers()["content-type"] || "").toLowerCase();
  const finalDisposition = (response.headers()["content-disposition"] || "").toLowerCase();
  const finalPdfish =
    finalType.includes("pdf") ||
    finalDisposition.includes("attachment") ||
    /\.pdf(?:\?|$)/i.test(billUrl);
  if (!finalPdfish) {
    throw new Error(
      `Download response for ${accountLabel} did not look like a PDF (${finalType || "unknown"}).`
    );
  }

  return savePdfResponse(response, accountLabel, index, billUrl);
}

async function selectAccount(page, option) {
  const select = page.locator(ACCOUNT_DROPDOWN_SELECTOR).first();
  const before = await firstRowSignature(page);
  const currentValue = await select.inputValue();
  log(`Selecting account: ${option.text || option.value}`);

  if (currentValue !== option.value) {
    await Promise.all([
      page.waitForLoadState("domcontentloaded", { timeout: TIMEOUT_MS }).catch(() => null),
      select.selectOption(option.value),
    ]);
  }

  await page.waitForLoadState("networkidle", { timeout: TIMEOUT_MS }).catch(() => null);
  await page.waitForTimeout(SETTLE_DELAY_MS);
  await waitForBillsVisible(page, before);
}

async function saveDownload(download, accountLabel, index) {
  const suggested = sanitizeFileName(download.suggestedFilename() || "bill.pdf");
  if (!fileNameLooksLikeBill(suggested)) {
    log(`Skipping non-bill file for ${accountLabel}: ${suggested}`);
    return false;
  }
  const baseName = suggested.toLowerCase().endsWith(".pdf") ? suggested : `${suggested}.pdf`;
  const prefixed = `${sanitizeFileName(accountLabel || `account-${index}`)} - ${baseName}`;
  const targetPath = await nextAvailablePath(path.join(DOWNLOAD_DIR, prefixed));
  await download.saveAs(targetPath);
  log(`Saved ${path.relative(ROOT, targetPath)}`);
  return true;
}

async function savePdfResponse(response, accountLabel, index, sourceUrl = "") {
  const disposition = response.headers()["content-disposition"] || "";
  const byHeader = sanitizeFileName(contentDispositionFileName(disposition) || "");
  const byUrl = fileNameFromUrl(sourceUrl);
  const detectedName = byHeader || byUrl;
  if (!fileNameLooksLikeBill(detectedName)) {
    log(`Skipping non-bill file for ${accountLabel}: ${detectedName || "unknown filename"}`);
    return false;
  }
  const baseName = byHeader || `bill-${String(index).padStart(3, "0")}.pdf`;
  const finalName = baseName.toLowerCase().endsWith(".pdf") ? baseName : `${baseName}.pdf`;
  const prefixed = `${sanitizeFileName(accountLabel || `account-${index}`)} - ${finalName}`;
  const targetPath = await nextAvailablePath(path.join(DOWNLOAD_DIR, prefixed));
  await fs.writeFile(targetPath, await response.body());
  log(`Saved ${path.relative(ROOT, targetPath)}`);
  return true;
}

async function clickFirstBillDownload(page, accountLabel, index) {
  await waitForBillsVisible(page);
  const firstRow = page.locator(FIRST_BILL_ROW_SELECTOR).first();
  await firstRow.scrollIntoViewIfNeeded();

  const trigger = firstRow.locator(DOWNLOAD_TRIGGER_SELECTOR).first();
  if ((await trigger.count()) === 0) {
    throw new Error(
      `No download trigger found in first bill row. Set EVERGY_DOWNLOAD_TRIGGER_SELECTOR for account ${accountLabel}.`
    );
  }

  log(`Downloading newest bill for ${accountLabel}`);
  const downloadPromise = page.waitForEvent("download", { timeout: TIMEOUT_MS }).catch(() => null);
  const pdfResponsePromise = page
    .waitForResponse((resp) => {
      const type = (resp.headers()["content-type"] || "").toLowerCase();
      return type.includes("pdf") || /\.pdf(?:\?|$)/i.test(resp.url());
    }, { timeout: TIMEOUT_MS })
    .catch(() => null);

  await trigger.click({ timeout: TIMEOUT_MS });

  const [download, pdfResponse] = await Promise.all([downloadPromise, pdfResponsePromise]);
  if (download) {
    return saveDownload(download, accountLabel, index);
  }
  if (pdfResponse) {
    return savePdfResponse(pdfResponse, accountLabel, index, pdfResponse.url());
  }

  throw new Error(`Click did not produce a file download for account ${accountLabel}.`);
}

async function clickAllBillDownloads(page, accountLabel, startIndex) {
  await waitForBillsVisible(page);
  const rows = page.locator(FIRST_BILL_ROW_SELECTOR);
  const totalRows = await rows.count();
  if (!totalRows) {
    throw new Error(`No bill rows found for account ${accountLabel}.`);
  }

  let saved = 0;
  let fileIndex = startIndex;
  for (let i = 0; i < totalRows; i += 1) {
    const row = rows.nth(i);
    await row.scrollIntoViewIfNeeded();
    const trigger = row.locator(DOWNLOAD_TRIGGER_SELECTOR).first();
    if ((await trigger.count()) === 0) {
      continue;
    }

    const downloadPromise = page.waitForEvent("download", { timeout: TIMEOUT_MS }).catch(() => null);
    const pdfResponsePromise = page
      .waitForResponse((resp) => {
        const type = (resp.headers()["content-type"] || "").toLowerCase();
        return type.includes("pdf") || /\.pdf(?:\?|$)/i.test(resp.url());
      }, { timeout: TIMEOUT_MS })
      .catch(() => null);

    await trigger.click({ timeout: TIMEOUT_MS });
    const [download, pdfResponse] = await Promise.all([downloadPromise, pdfResponsePromise]);

    if (download) {
      const wasSaved = await saveDownload(download, accountLabel, fileIndex);
      if (wasSaved) saved += 1;
      fileIndex += 1;
      continue;
    }
    if (pdfResponse) {
      const wasSaved = await savePdfResponse(pdfResponse, accountLabel, fileIndex, pdfResponse.url());
      if (wasSaved) saved += 1;
      fileIndex += 1;
    }
  }

  if (!saved) {
    throw new Error(`Could not download any bill rows for account ${accountLabel}.`);
  }

  return saved;
}

async function downloadForAccountNumbers(page, accountNumbers, scope = "current") {
  let totalSaved = 0;
  let index = 1;

  for (const accountNumber of accountNumbers) {
    const target = buildAccountUrl(accountNumber);
    log(`Opening account URL: ${target}`);
    await page.goto(target, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: TIMEOUT_MS }).catch(() => null);
    await page.waitForTimeout(SETTLE_DELAY_MS);
    const billUrls = await fetchBillsForAccount(page, accountNumber, scope);
    log(
      scope === "all"
        ? `Found ${billUrls.length} bill(s) for ${accountNumber}`
        : `Downloading current bill for ${accountNumber}`
    );
    for (const billUrl of billUrls) {
      const wasSaved = await downloadBillFromUrl(page, billUrl, accountNumber, index);
      if (wasSaved) totalSaved += 1;
      index += 1;
    }
  }

  return totalSaved;
}

async function downloadForDropdownAccounts(page, scope = "current") {
  const discovered = await collectAccountNumbersFromPage(page);
  if (discovered.length) {
    log(`Discovered ${discovered.length} account number(s) from page config`);
    return downloadForAccountNumbers(page, discovered, scope);
  }

  const options = await getAccountOptions(page);
  if (!options.length) {
    log("No <select> account dropdown found. Falling back to account-number discovery.");
    throw new Error(
      "No account dropdown options found and no account numbers discovered. Set EVERGY_ACCOUNT_DROPDOWN_SELECTOR or provide EVERGY_ACCOUNT_NUMBERS."
    );
  }

  log(`Found ${options.length} accounts in dropdown`);
  let totalSaved = 0;
  let index = 1;
  for (const option of options) {
    await selectAccount(page, option);
    if (scope === "all") {
      const saved = await clickAllBillDownloads(page, option.text || option.value, index);
      totalSaved += saved;
      index += saved;
    } else {
      const wasSaved = await clickFirstBillDownload(page, option.text || option.value, index);
      if (wasSaved) totalSaved += 1;
      index += 1;
    }
  }
  return totalSaved;
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
      log("Run `npm run evergy:download` to download newest bill for each account.");
      return;
    }

    /** @type {DownloadScope} */
    const downloadScope = await chooseDownloadScope();
    log(
      downloadScope === "all"
        ? "Download mode: all bills"
        : "Download mode: current month (default)"
    );

    let totalSaved = 0;
    if (ACCOUNT_NUMBERS.length) {
      log("Using EVERGY_ACCOUNT_NUMBERS list");
      totalSaved = await downloadForAccountNumbers(page, ACCOUNT_NUMBERS, downloadScope);
    } else {
      totalSaved = await downloadForDropdownAccounts(page, downloadScope);
    }

    log(`Done. Total saved: ${totalSaved}`);
    log(`Bills folder: ${path.relative(ROOT, DOWNLOAD_DIR)}`);
  } finally {
    await context.close();
  }
}

run().catch((err) => {
  console.error(err);
  if (DEBUG_DUMP_ON_FAILURE) {
    console.error(
      "Tip: set EVERGY_ACCOUNT_NUMBERS as comma-separated values to bypass UI selectors entirely."
    );
  }
  process.exitCode = 1;
});

