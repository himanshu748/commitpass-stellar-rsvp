import { expect, test } from "@playwright/test";
import {
  DEMO_ATTENDEE_ADDRESS,
  SEED_EVENT_ID,
} from "../src/lib/seed";

const demoAttendeePass = () =>
  `commitpass:pass:v1:${Buffer.from(
    JSON.stringify({
      kind: "commitpass-attendee-pass",
      version: 1,
      eventId: SEED_EVENT_ID,
      attendee: DEMO_ATTENDEE_ADDRESS,
      nonce: "a7".repeat(32),
      issuedAt: Math.floor(Date.now() / 1_000),
    }),
  ).toString("base64url")}`;

test("attendee reserves, checks in, and receives the full refund", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Reserve my spot" }).click();
  await page
    .getByRole("button", {
      name: "Use demo wallet Experience every state with simulated Testnet funds",
    })
    .click();
  await page
    .getByRole("button", { name: "Simulate 2 XLM reservation" })
    .click();

  await expect(
    page.getByRole("heading", { name: "Your spot is reserved" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open check-in pass" }).click();
  await page.getByRole("button", { name: "Simulate organizer scan" }).click();
  await expect(
    page.getByRole("heading", { name: "Check-in verified." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Simulate my 2 XLM refund" })
    .click();

  await expect(
    page.getByRole("heading", { name: "2 XLM returned" }),
  ).toBeVisible();
  await expect(page.getByText("Thanks for showing up.")).toBeVisible();
});

test("organizer publishes rules and uses the manual scanner fallback", async ({
  page,
}) => {
  await page.goto("/host");

  await page.getByRole("button", { name: "Review event" }).click();
  await expect(
    page.getByRole("dialog", { name: "Review the published rules" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create demo event" }).click();

  await expect(
    page.getByRole("heading", { name: "Check-in sandbox" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Enter code instead" }).click();
  await page
    .getByRole("textbox", { name: "One-time pass" })
    .fill("commitpass:not-a-pass");
  await page
    .getByRole("button", { name: "Verify and sign demo voucher" })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "malformed or unsupported",
  );

  const attendeePass = demoAttendeePass();
  await page
    .getByRole("textbox", { name: "One-time pass" })
    .fill(attendeePass);
  await page
    .getByRole("button", { name: "Verify and sign demo voucher" })
    .click();

  await expect(page.getByText("Riya · GCF2…6K8M")).toBeVisible();
  await expect(
    page.getByText("Demo voucher signed for Riya", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Enter code instead" }).click();
  await page
    .getByRole("textbox", { name: "One-time pass" })
    .fill(attendeePass);
  await page
    .getByRole("button", { name: "Verify and sign demo voucher" })
    .click();
  await expect(page.getByRole("alert")).toContainText("already been scanned");
});
