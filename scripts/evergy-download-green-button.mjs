#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const args = new Set(process.argv.slice(2));
const isSetup = args.has("--setup");

const ROOT = process.cwd();
const PROFILE_DIR = path.join(ROOT, "automation-data", "evergy-profile");
const DOWNLOAD_DIR = path.join(ROOT, "automation-data", "evergy-green-button");
const GREEN_BUTTON_URL =
  process.env.EVERGY_GREEN_BUTTON_URL ||
  "https://www.evergy.com/ala/energy-dashboard/green-button-download";

const ADDRESS_SELECT_SELECTOR =
  process.env.EVERGY_GREEN_BUTTON_ADDRESS_SELECTOR ||
  "select[name*='address' i], select[id*='address' i], select[aria-label*='address' i]";
const ADDRESS_INPUT_SELECTOR =
  process.env.EVERGY_GREEN_BUTTON_ADDRESS_INPUT_SELECTOR ||
  "input#account, input[name='account'][aria-label='account']";
const ADDRESS_LIST_ITEM_SELECTOR =
  process.env.EVERGY_GREEN_BUTTON_ADDRESS_ITEM_SELECTOR ||
  ".combo-box__list .combo-box__list-item.js-combo-box-item-2, .combo-box__list-item.js-combo-box-item-2";
const START_INPUT_SELECTOR = process.env.EVERGY_GREEN_BUTTON_START_SELECTOR || "#start";
const END_INPUT_SELECTOR = process.env.EVERGY_GREEN_BUTTON_END_SELECTOR || "#end";
const SUBMIT_SELECTOR =
  process.env.EVERGY_GREEN_BUTTON_SUBMIT_SELECTOR || "#green-button-download-trigger";
const INTERVAL_RADIO_SELECTOR =
  process.env.EVERGY_GREEN_BUTTON_INTERVAL_SELECTOR || "#intervalData";

const TIMEOUT_MS = Number.parseInt(process.env.EVERGY_TIMEOUT_MS || "20000", 10);
const DOWNLOAD_TIMEOUT_MS = Number.parseInt(
  process.env.EVERGY_GREEN_BUTTON_DOWNLOAD_TIMEOUT_MS || "180000",
  10
);
const SETTLE_DELAY_MS = Number.parseInt(process.env.EVERGY_SETTLE_DELAY_MS || "1200", 10);

const EVERGY_USERNAME = process.env.EVERGY_USERNAME || "";
const EVERGY_PASSWORD = process.env.EVERGY_PASSWORD || "";
const USERNAME_SELECTOR =
  process.env.EVERGY_USERNAME_SELECTOR ||
  "input[type='email'], input[name*='user' i], input[id*='user' i], input[name*='email' i], input[id*='email' i], input[name*='login' i], input[id*='login' i]";
const PASSWORD_SELECTOR = process.env.EVERGY_PASSWORD_SELECTOR || "input[type='password']";
const LOGIN_SUBMIT_SELECTOR =
  process.env.EVERGY_LOGIN_SUBMIT_SELECTOR ||
  "button[type='submit'], input[type='submit'], button:has-text('Sign In'), button:has-text('Log In'), button:has-text('Login')";
const MFA_PROMPT = (process.env.EVERGY_MFA_PROMPT_IN_DOWNLOAD || "1") !== "0";
const ADMIN_AUTO_CONTINUE_PROMPTS = process.env.ADMIN_AUTO_CONTINUE_PROMPTS === "1";
const ADMIN_NON_INTERACTIVE_WAIT_MS = Number.parseInt(
  process.env.ADMIN_NON_INTERACTIVE_WAIT_MS || "60000",
  10
);

const TARGET_ADDRESSES = [
  "1550 E Walnut Grove Rd.",
  "4625 S Juniper",
  "2230 N Woodlawn blvd",
  "900 E Crestway ave",
  "5000 S Clifton",
  "1500 E Woodbrook",
  "3012 N Triple Creek dr",
  "501 E English St",
  "830 N RIDGECREST RD - 2948469058",
  "8801 E Ent",
  "925 E Madison Ave Ftbll",
  "3100 N Rock Rd",
  "920 N Rock",
];

const ADDRESS_ALIASES = new Map([["925 E Madison Ave Ftbll", "801 E Madison"]]);

function log(msg) {
  const stamp = new Date().toISOString();
  console.log(`[${stamp}] ${msg}`);
}

function normalizeText(s) {
  return String(s || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeFileName(name) {
  return String(name)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

function toDateRange(startMonthYear, endMonthYear) {
  const parse = (v) => {
    const m = String(v).trim().match(/^(\d{1,2})[\/\-](\d{4})$/);
    if (!m) return null;
    const mm = Number(m[1]);
    const yyyy = Number(m[2]);
    if (mm < 1 || mm > 12) return null;
    return { mm, yyyy };
  };
  const s = parse(startMonthYear);
  const e = parse(endMonthYear);
  if (!s || !e) {
    throw new Error("Use MM/YYYY format for start and end (example: 01/2026).");
  }
  const startDate = new Date(Date.UTC(s.yyyy, s.mm - 1, 1));
  const endDate = new Date(Date.UTC(e.yyyy, e.mm, 0));
  if (startDate > endDate) throw new Error("Start month must be <= end month.");
  return { startDate, endDate };
}

function formatUsDateTwoDigitYear(dateUtc) {
  const mm = String(dateUtc.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dateUtc.getUTCDate()).padStart(2, "0");
  const yy = String(dateUtc.getUTCFullYear()).slice(-2);
  return `${mm}/${dd}/${yy}`;
}

async function ensureDirs() {
  await fs.mkdir(PROFILE_DIR, { recursive: true });
  await fs.mkdir(DOWNLOAD_DIR, { recursive: true });
}

async function prompt(question, fallback = "") {
  if (ADMIN_AUTO_CONTINUE_PROMPTS || !process.stdin.isTTY || !process.stdout.isTTY) {
    const trimmed = String(fallback || "").trim();
    if (!trimmed) {
      throw new Error(`Missing required input for "${question}" in non-interactive mode.`);
    }
    log(`Using non-interactive value for "${question}": ${trimmed}`);
    return trimmed;
  }

  const rl = readline.createInterface({ input, output });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
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

async function hasLoginForm(page) {
  const username = page.locator(USERNAME_SELECTOR).first();
  const password = page.locator(PASSWORD_SELECTOR).first();
  return (await username.count()) > 0 && (await password.count()) > 0;
}

async function isLikelyLoginPage(page) {
  const url = page.url().toLowerCase();
  if (url.includes("/login") || url.includes("signin") || url.includes("authenticate")) return true;
  return hasLoginForm(page);
}

async function hasGreenButtonContext(page) {
  const form = page.locator("#green-button-download__form, .green-button-download__form").first();
  const addressSelect = page.locator(ADDRESS_SELECT_SELECTOR).first();
  const addressInput = page.locator(ADDRESS_INPUT_SELECTOR).first();
  if ((await form.count()) > 0 && ((await addressSelect.count()) > 0 || (await addressInput.count()) > 0)) return true;

  const onGreenButtonUrl = page
    .url()
    .toLowerCase()
    .includes("/energy-dashboard/green-button-download");
  if (onGreenButtonUrl && !(await isLikelyLoginPage(page))) return true;
  return false;
}

async function attemptAutofillLogin(page) {
  if (!EVERGY_USERNAME || !EVERGY_PASSWORD) return false;
  if (!(await hasLoginForm(page))) return false;

  log("Login form detected. Attempting credential autofill.");
  await page.locator(USERNAME_SELECTOR).first().fill(EVERGY_USERNAME, { timeout: TIMEOUT_MS });
  await page.locator(PASSWORD_SELECTOR).first().fill(EVERGY_PASSWORD, { timeout: TIMEOUT_MS });

  const submit = page.locator(LOGIN_SUBMIT_SELECTOR).first();
  if ((await submit.count()) > 0) {
    await Promise.all([
      page.waitForLoadState("domcontentloaded", { timeout: TIMEOUT_MS }).catch(() => null),
      submit.click({ timeout: TIMEOUT_MS }),
    ]);
  } else {
    await page.locator(PASSWORD_SELECTOR).first().press("Enter");
  }
  await page.waitForLoadState("networkidle", { timeout: TIMEOUT_MS }).catch(() => null);
  await page.waitForTimeout(SETTLE_DELAY_MS);
  return true;
}

async function ensureAuthenticated(page, interactivePrompt) {
  log(`Opening Green Button page: ${GREEN_BUTTON_URL}`);
  await page.goto(GREEN_BUTTON_URL, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: TIMEOUT_MS }).catch(() => null);
  await page.waitForTimeout(SETTLE_DELAY_MS);
  if (await hasGreenButtonContext(page)) return;

  const didAutofill = await attemptAutofillLogin(page);
  if (didAutofill && (await hasGreenButtonContext(page))) return;

  if (interactivePrompt) {
    await promptEnter(
      "Complete Evergy login/MFA in browser and wait until you can see the Green Button download form."
    );

    // First trust where the user already is after MFA/login.
    await page.waitForLoadState("networkidle", { timeout: TIMEOUT_MS }).catch(() => null);
    await page.waitForTimeout(SETTLE_DELAY_MS);
    if (await hasGreenButtonContext(page)) return;

    // If not there yet, navigate through dashboard then back to Green Button.
    await page.goto("https://www.evergy.com/ala/energy-dashboard", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle", { timeout: TIMEOUT_MS }).catch(() => null);
    await page.waitForTimeout(SETTLE_DELAY_MS);

    await page.goto(GREEN_BUTTON_URL, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: TIMEOUT_MS }).catch(() => null);
    await page.waitForTimeout(SETTLE_DELAY_MS);
    if (await hasGreenButtonContext(page)) return;
  }

  const formCount = await page
    .locator("#green-button-download__form, .green-button-download__form")
    .count()
    .catch(() => 0);
  const addressCount = await page.locator(ADDRESS_SELECT_SELECTOR).count().catch(() => 0);
  const addressInputCount = await page.locator(ADDRESS_INPUT_SELECTOR).count().catch(() => 0);
  const loginDetected = await isLikelyLoginPage(page).catch(() => false);
  throw new Error(
    `Authentication did not reach Green Button page. url=${page.url()} formCount=${formCount} addressCount=${addressCount} addressInputCount=${addressInputCount} loginDetected=${loginDetected}`
  );
}

async function getAddressOptions(page) {
  const comboInput = page.locator(ADDRESS_INPUT_SELECTOR).first();
  if ((await comboInput.count()) > 0) {
    await comboInput.waitFor({ state: "visible", timeout: TIMEOUT_MS });
    await comboInput.click({ timeout: TIMEOUT_MS });
    await page.waitForTimeout(250);
    const comboItems = await page.$$eval(ADDRESS_LIST_ITEM_SELECTOR, (items) =>
      items.map((el) => {
        const li = /** @type {HTMLElement} */ (el);
        return {
          kind: "combo",
          value: (li.getAttribute("data-account-number") || "").trim(),
          text: (li.textContent || "").trim(),
          disabled: false,
          accountNumber: (li.getAttribute("data-account-number") || "").trim(),
          premiseId: (li.getAttribute("data-premise-id") || "").trim(),
          buildingId: (li.getAttribute("data-building-id") || "").trim(),
        };
      })
    );
    if (comboItems.length) return comboItems;
  }

  const select = page.locator(ADDRESS_SELECT_SELECTOR).first();
  await select.waitFor({ state: "visible", timeout: TIMEOUT_MS });
  return select.evaluate((el) => {
    const selectEl = /** @type {HTMLSelectElement} */ (el);
    return Array.from(selectEl.options)
      .map((opt) => ({
        kind: "select",
        value: (opt.value || "").trim(),
        text: (opt.textContent || "").trim(),
        disabled: opt.disabled,
      }))
      .filter((opt) => opt.value && !opt.disabled);
  });
}

function findBestAddressOption(options, targetAddress) {
  const target = normalizeText(targetAddress);
  const alias = normalizeText(ADDRESS_ALIASES.get(targetAddress) || "");
  const candidates = options
    .map((opt) => {
      const textNorm = normalizeText(opt.text);
      let score = 0;
      if (textNorm === target) score = 100;
      else if (textNorm.includes(target) || target.includes(textNorm)) score = 80;
      if (alias && (textNorm.includes(alias) || alias.includes(textNorm))) score = Math.max(score, 90);
      return { ...opt, score };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);
  return candidates[0] || null;
}

async function setDateInput(page, selector, value) {
  const loc = page.locator(selector).first();
  await loc.waitFor({ state: "visible", timeout: TIMEOUT_MS });
  await loc.fill(value);
  await loc.evaluate((el, v) => {
    const input = /** @type {HTMLInputElement} */ (el);
    input.value = v;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new Event("blur", { bubbles: true }));
  }, value);
}

async function chooseComboAddress(page, option) {
  const input = page.locator(ADDRESS_INPUT_SELECTOR).first();
  await input.waitFor({ state: "visible", timeout: TIMEOUT_MS });
  await input.click({ timeout: TIMEOUT_MS });
  const query = String(option.text || "").split(" - ")[0].trim();
  await input.fill(query);
  await page.waitForTimeout(350);

  const clicked = await page.evaluate(
    ({ itemSelector, targetText, targetAccount }) => {
      const norm = (s) =>
        String(s || "")
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      const desired = norm(targetText);
      const desiredAcct = String(targetAccount || "").trim();
      const items = Array.from(document.querySelectorAll(itemSelector));
      const scored = items
        .map((node) => {
          const li = /** @type {HTMLElement} */ (node);
          const txt = norm(li.textContent || "");
          const acct = (li.getAttribute("data-account-number") || "").trim();
          let score = 0;
          if (txt === desired) score = 100;
          else if (txt.includes(desired) || desired.includes(txt)) score = 80;
          if (desiredAcct && acct === desiredAcct) score += 10;
          return { li, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score);
      const best = scored[0]?.li;
      if (!best) return false;
      best.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      best.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      return true;
    },
    {
      itemSelector: ADDRESS_LIST_ITEM_SELECTOR,
      targetText: option.text,
      targetAccount: option.accountNumber || option.value || "",
    }
  );

  if (!clicked) {
    throw new Error(`Could not select combo-box address option: ${option.text}`);
  }
  await page.waitForTimeout(SETTLE_DELAY_MS);
}

async function nextAvailablePath(targetPath) {
  const ext = path.extname(targetPath);
  const base = targetPath.slice(0, targetPath.length - ext.length);
  let i = 0;
  let p = targetPath;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await fs.access(p);
      i += 1;
      p = `${base} (${i})${ext}`;
    } catch {
      return p;
    }
  }
}

async function saveXmlResponse(response, label, startLabel, endLabel) {
  const text = await response.text();
  if (!text || !text.trim().startsWith("<")) {
    throw new Error("Download response did not contain XML.");
  }
  const filename = `${sanitizeFileName(label)}_${startLabel}_${endLabel}.xml`;
  const target = await nextAvailablePath(path.join(DOWNLOAD_DIR, filename));
  await fs.writeFile(target, text, "utf8");
  log(`Saved ${path.relative(ROOT, target)}`);
}

async function saveDownload(download, label, startLabel, endLabel) {
  const suggested = sanitizeFileName(download.suggestedFilename() || `${label}_${startLabel}_${endLabel}.xml`);
  const name = suggested.toLowerCase().endsWith(".xml") ? suggested : `${suggested}.xml`;
  const target = await nextAvailablePath(path.join(DOWNLOAD_DIR, name));
  await download.saveAs(target);
  log(`Saved ${path.relative(ROOT, target)}`);
}

async function downloadForAddress(page, option, startDate, endDate) {
  const startLabel = startDate.toISOString().slice(0, 10);
  const endLabel = endDate.toISOString().slice(0, 10);
  log(`Downloading XML for: ${option.text}`);

  if (option.kind === "combo") {
    await chooseComboAddress(page, option);
  } else {
    await page.locator(ADDRESS_SELECT_SELECTOR).first().selectOption(option.value);
    await page.waitForTimeout(300);
  }

  const intervalRadio = page.locator(INTERVAL_RADIO_SELECTOR).first();
  if ((await intervalRadio.count()) > 0 && !(await intervalRadio.isChecked())) {
    await intervalRadio.check({ timeout: TIMEOUT_MS }).catch(() => null);
  }

  await setDateInput(page, START_INPUT_SELECTOR, formatUsDateTwoDigitYear(startDate));
  await setDateInput(page, END_INPUT_SELECTOR, formatUsDateTwoDigitYear(endDate));

  const submit = page.locator(SUBMIT_SELECTOR).first();
  await submit.waitFor({ state: "visible", timeout: TIMEOUT_MS });

  const downloadPromise = page
    .waitForEvent("download", { timeout: DOWNLOAD_TIMEOUT_MS })
    .catch(() => null);
  const xmlResponsePromise = page
    .waitForResponse((resp) => {
      const ct = (resp.headers()["content-type"] || "").toLowerCase();
      return ct.includes("xml") || /\.xml(?:\?|$)/i.test(resp.url());
    }, { timeout: DOWNLOAD_TIMEOUT_MS })
    .catch(() => null);

  if (await submit.isDisabled()) {
    log(`Submit is disabled for "${option.text}" after date fill; skipping.`);
    return false;
  }

  await submit.click({ timeout: TIMEOUT_MS });

  const [download, xmlResponse] = await Promise.all([downloadPromise, xmlResponsePromise]);
  if (download) {
    await saveDownload(download, option.text, startLabel, endLabel);
    return true;
  }
  if (xmlResponse) {
    await saveXmlResponse(xmlResponse, option.text, startLabel, endLabel);
    return true;
  }

  throw new Error(`No XML download detected for ${option.text}.`);
}

async function run() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw new Error("Missing playwright dependency. Run `npm install` first.");
  }

  await ensureDirs();

  let startMonthYear = process.env.EVERGY_GB_START_MONTH || "";
  let endMonthYear = process.env.EVERGY_GB_END_MONTH || "";
  if (!startMonthYear) startMonthYear = await prompt("Start month (MM/YYYY): ", "01/2026");
  if (!endMonthYear) endMonthYear = await prompt("End month (MM/YYYY): ", startMonthYear);
  const { startDate, endDate } = toDateRange(startMonthYear, endMonthYear);

  const uniqueTargets = Array.from(new Set(TARGET_ADDRESSES.map((v) => v.trim()).filter(Boolean)));
  log(`Target addresses: ${uniqueTargets.length}`);

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    acceptDownloads: true,
    viewport: { width: 1440, height: 920 },
  });
  const page = context.pages()[0] || (await context.newPage());
  page.setDefaultTimeout(TIMEOUT_MS);

  try {
    await ensureAuthenticated(page, isSetup || MFA_PROMPT);
    if (isSetup) {
      log("Setup complete. Session saved.");
      log("Run `npm run evergy:green-button:download` to download XML files.");
      return;
    }

    const options = await getAddressOptions(page);
    if (!options.length) {
      throw new Error("No address options found in dropdown. Check selector or page state.");
    }

    let saved = 0;
    let skipped = 0;
    for (const target of uniqueTargets) {
      const best = findBestAddressOption(options, target);
      if (!best) {
        skipped += 1;
        log(`Skipped (no dropdown match): ${target}`);
        continue;
      }
      try {
        const ok = await downloadForAddress(page, best, startDate, endDate);
        if (ok) saved += 1;
      } catch (err) {
        skipped += 1;
        log(`Failed for "${target}": ${err instanceof Error ? err.message : String(err)}`);
      }
      await page.waitForTimeout(SETTLE_DELAY_MS);
    }

    log(`Done. Saved: ${saved}, Skipped/Failed: ${skipped}`);
    log(`Folder: ${path.relative(ROOT, DOWNLOAD_DIR)}`);
  } finally {
    await context.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

