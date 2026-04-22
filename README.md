This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Evergy Bill Downloader

Automates bill PDF downloads through a persisted Playwright browser profile.

1. Install deps:
```bash
npm install
```
2. First-time login setup (manual login + MFA in opened browser):
```bash
npm run evergy:setup
```
3. Regular download run:
```bash
npm run evergy:download
```

Optional environment variables:
- `EVERGY_USERNAME`
- `EVERGY_PASSWORD`
- `EVERGY_USERNAME_SELECTOR`
- `EVERGY_PASSWORD_SELECTOR`
- `EVERGY_LOGIN_SUBMIT_SELECTOR`
- `EVERGY_MFA_PROMPT_IN_DOWNLOAD` (`1` default)
- `EVERGY_VIEW_BILLS_URL` (default includes your current Evergy view-bills URL)
- `EVERGY_ACCOUNT_NUMBERS` (comma-separated, optional; bypasses dropdown iteration)
- `EVERGY_ACCOUNT_DROPDOWN_SELECTOR`
- `EVERGY_FIRST_BILL_ROW_SELECTOR`
- `EVERGY_DOWNLOAD_TRIGGER_SELECTOR`
- `EVERGY_TIMEOUT_MS` (default: `20000`)
- `EVERGY_SETTLE_DELAY_MS` (default: `1500`)

Output folders:
- `automation-data/evergy-profile`
- `automation-data/evergy-bills`

## Wood River Energy Bill Downloader

Automates latest bill PDF downloads through a persisted Playwright browser profile.

1. First-time setup:
```bash
npm run woodriver:setup
```
2. Download latest bill for each account:
```bash
npm run woodriver:download
```

Optional environment variables:
- `WOODRIVER_BASE_URL` (default: `https://portal.woodriverenergy.com`)
- `WOODRIVER_LOGIN_URL` (default: `https://portal.woodriverenergy.com/login?redirect_to=https%3A%2F%2Fportal.woodriverenergy.com%2F`)
- `WOODRIVER_OVERVIEW_URL` (default: `${WOODRIVER_BASE_URL}/account/12521/overview`)
- `WOODRIVER_ACCOUNTS_URL` (default: `${WOODRIVER_BASE_URL}/account/12521/overview`)
- `WOODRIVER_ACCOUNT_IDS` (comma-separated, default: `12521,12828`)
- `WOODRIVER_USERNAME`
- `WOODRIVER_PASSWORD`
- `WOODRIVER_USERNAME_SELECTOR`
- `WOODRIVER_PASSWORD_SELECTOR`
- `WOODRIVER_LOGIN_SUBMIT_SELECTOR`
- `WOODRIVER_BILLING_NAV_SELECTOR`
- `WOODRIVER_DOWNLOAD_LINK_SELECTOR`
- `WOODRIVER_MFA_PROMPT_IN_DOWNLOAD` (`1` default)
- `WOODRIVER_TIMEOUT_MS` (default: `20000`)
- `WOODRIVER_SETTLE_DELAY_MS` (default: `1500`)

Output folders:
- `automation-data/woodriver-profile`
- `automation-data/woodriver-bills`

## Kansas Gas Service Statement Downloader

Automates latest statement downloads through a persisted Playwright browser profile.

1. First-time setup:
```bash
npm run kgs:setup
```
2. Download latest statement for each address:
```bash
npm run kgs:download
```

Optional environment variables:
- `KGS_USERNAME`
- `KGS_PASSWORD`
- `KGS_USERNAME_SELECTOR`
- `KGS_PASSWORD_SELECTOR`
- `KGS_LOGIN_SUBMIT_SELECTOR`
- `KGS_MFA_PROMPT_IN_DOWNLOAD` (`1` default)
- `KGS_ACCOUNT_URL` (default: `https://www.kansasgasservice.com/account`)
- `KGS_ADDRESS_VALUES` (comma-separated option values for native select)
- `KGS_ACCOUNT_TOKENS` (comma-separated account/address tokens for combobox fallback)
- `KGS_ACCOUNT_TEXT_TOKENS` (comma-separated exact text snippets for clickable account items)
- `KGS_ADDRESS_SELECT_SELECTOR`
- `KGS_ADDRESS_DROPDOWN_TRIGGER_SELECTOR`
- `KGS_ADDRESS_OPTION_SELECTOR`
- `KGS_ADDRESS_COMBOBOX_SELECTOR`
- `KGS_ANGULAR_DROPDOWN_TRIGGER_SELECTOR`
- `KGS_ANGULAR_DROPDOWN_MENU_SELECTOR`
- `KGS_ANGULAR_DROPDOWN_ITEM_SELECTOR`
- `KGS_ACCOUNT_ITEM_SELECTOR`
- `KGS_STATEMENTS_TAB_SELECTOR`
- `KGS_FIRST_STATEMENT_ROW_SELECTOR`
- `KGS_DOWNLOAD_TRIGGER_SELECTOR`
- `KGS_TIMEOUT_MS` (default: `20000`)
- `KGS_SETTLE_DELAY_MS` (default: `1500`)

Output folders:
- `automation-data/kgs-profile`
- `automation-data/kgs-bills`
