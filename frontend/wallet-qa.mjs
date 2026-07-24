import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const source =
  "GDVEU3DD4KOFECV66VIHWEZOYX4ZKR3WV27L464SIIPOU2IUI3JCZA57";
const destination =
  "GABAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEJXA";
const passphrase = "Test SDF Network ; September 2015";
const screenshotRoot =
  process.env.COMMITPASS_QA_OUTPUT_DIR ??
  fileURLToPath(new URL("../work/", import.meta.url));
await mkdir(screenshotRoot, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
});
await context.addInitScript(
  ({ address, networkPassphrase }) => {
    Object.defineProperty(window, "freighter", {
      value: true,
      configurable: true,
    });
    window.addEventListener("message", (event) => {
      const request = event.data;
      if (request?.source !== "FREIGHTER_EXTERNAL_MSG_REQUEST") return;
      let response = {};
      if (
        request.type === "REQUEST_ACCESS" ||
        request.type === "REQUEST_PUBLIC_KEY"
      ) {
        response = { publicKey: address };
      } else if (request.type === "REQUEST_NETWORK_DETAILS") {
        response = {
          networkDetails: {
            network: "TESTNET",
            networkUrl: "https://horizon-testnet.stellar.org",
            networkPassphrase,
            sorobanRpcUrl: "https://soroban-testnet.stellar.org",
          },
        };
      } else if (request.type === "REQUEST_CONNECTION_STATUS") {
        response = { isConnected: true };
      }
      window.postMessage(
        {
          source: "FREIGHTER_EXTERNAL_MSG_RESPONSE",
          messagedId: request.messageId,
          ...response,
        },
        window.location.origin,
      );
    });
  },
  { address: source, networkPassphrase: passphrase },
);

const page = await context.newPage();
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
await page.route(
  "https://horizon-testnet.stellar.org/accounts/**",
  async (route) => {
    const accountId = route.request().url().split("/").pop();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        _links: {
          self: { href: route.request().url() },
          transactions: {
            href: "https://horizon-testnet.stellar.org/accounts/x/transactions{?cursor,limit,order}",
            templated: true,
          },
          operations: {
            href: "https://horizon-testnet.stellar.org/accounts/x/operations{?cursor,limit,order}",
            templated: true,
          },
          payments: {
            href: "https://horizon-testnet.stellar.org/accounts/x/payments{?cursor,limit,order}",
            templated: true,
          },
          effects: {
            href: "https://horizon-testnet.stellar.org/accounts/x/effects{?cursor,limit,order}",
            templated: true,
          },
          offers: {
            href: "https://horizon-testnet.stellar.org/accounts/x/offers{?cursor,limit,order}",
            templated: true,
          },
          trades: {
            href: "https://horizon-testnet.stellar.org/accounts/x/trades{?cursor,limit,order}",
            templated: true,
          },
          data: {
            href: "https://horizon-testnet.stellar.org/accounts/x/data/{key}",
            templated: true,
          },
        },
        id: accountId,
        paging_token: "1",
        account_id: accountId,
        sequence: "41",
        subentry_count: 0,
        last_modified_ledger: 1,
        last_modified_time: "2026-07-24T00:00:00Z",
        thresholds: {
          low_threshold: 0,
          med_threshold: 0,
          high_threshold: 0,
        },
        flags: {
          auth_required: false,
          auth_revocable: false,
          auth_immutable: false,
          auth_clawback_enabled: false,
        },
        balances: [
          {
            asset_type: "native",
            balance: "12.3450000",
            buying_liabilities: "0.0000000",
            selling_liabilities: "0.0000000",
          },
        ],
        signers: [],
        num_sponsoring: 0,
        num_sponsored: 0,
        data_attr: {},
      }),
    });
  },
);

await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Connect wallet" }).click();
await page.getByRole("button", { name: /Connect Testnet wallet/ }).click();
await page
  .getByRole("heading", { name: "Testnet wallet & live proof" })
  .waitFor();
await page.getByText("12.345 XLM", { exact: true }).waitFor();
await page.screenshot({
  path: `${screenshotRoot}/wallet-live-desktop.png`,
  fullPage: true,
});

const dialog = page.getByRole("dialog");
const dialogText = await dialog.innerText();
assert.match(dialogText, /main RSVP demo remains no-funds/i);
assert.match(dialogText, /only after you confirm/i);
assert.match(dialogText, /Destination G-address/);

await page
  .getByRole("textbox", { name: "Destination G-address" })
  .fill(destination);
await page
  .getByRole("textbox", { name: "Amount (Testnet XLM)" })
  .fill("1e2");
await page.getByRole("button", { name: /Send Testnet XLM/ }).click();
await page.getByText("Transaction failed", { exact: true }).waitFor();
await dialog.getByText(/plain decimal with at most 7 places/i).waitFor();
const dismissButtons = page.getByRole("button", {
  name: "Dismiss notification",
});
while ((await dismissButtons.count()) > 0) {
  await dismissButtons.first().click();
}

await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({
  path: `${screenshotRoot}/wallet-live-mobile.png`,
});
const modalWidth = await dialog.evaluate((element) => ({
  client: element.clientWidth,
  scroll: element.scrollWidth,
}));
assert.ok(
  modalWidth.scroll <= modalWidth.client,
  `mobile modal overflowed: ${JSON.stringify(modalWidth)}`,
);

await page.getByRole("button", { name: "Disconnect" }).click();
await page.getByRole("button", { name: "Connect wallet" }).waitFor();
assert.equal(consoleErrors.length, 0, consoleErrors.join("\n"));

await browser.close();
console.log("wallet modal desktop/mobile, validation failure, and disconnect passed");
