/**
 * RUT-04 Days & periods flows (AC-03, AC-04, AC-06, AC-07, AC-11). Runs against
 * the disposable review server (`npm run ux:review`). Every flow removes what it
 * adds, so the suite can be repeated.
 */
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

const sessionFile = path.join(process.cwd(), ".tmp", "ux-review", "session.local.json");

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ context, page }) => {
  const { cookie } = JSON.parse(readFileSync(sessionFile, "utf8")) as { cookie: string };
  await context.addCookies([{ name: "better-auth.session_token", value: cookie, domain: "localhost", path: "/" }]);
  await page.setViewportSize({ width: 1440, height: 1000 });
});

const editor = (page: Page) => page.getByRole("complementary", { name: "Editor" });
const result = (page: Page) => page.getByRole("status").filter({ hasText: /saved|created|deleted|removed/i }).first();

async function open(page: Page) {
  await page.goto("/routine/periods", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "HSC week" })).toBeVisible();
}

test("the week, exceptions, patterns and preview are shown; editing is keyboard reachable (AC-11)", async ({ page }) => {
  await open(page);
  for (const day of ["Saturday", "Sunday", "Monday", "Tuesday"]) {
    await expect(page.getByRole("button", { name: `Edit ${day} for HSC` })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Add classes on Friday for HSC" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Period patterns" })).toBeVisible();
  const trigger = page.getByRole("button", { name: "Edit HSC Saturday" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(editor(page).getByRole("heading", { name: "Edit periods: HSC Saturday" })).toBeFocused();
  await editor(page).getByRole("button", { name: "Cancel" }).click();
  await expect(trigger).toBeFocused();
});

test("invalid periods show errors on their fields and save nothing (AC-07)", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "New pattern" }).click();
  const side = editor(page);
  await side.getByLabel("Name", { exact: true }).fill("HSC Saturday");
  await side.getByRole("button", { name: "Fill", exact: true }).click();
  await side.getByLabel("Period 2 start").fill("10:00");
  await side.getByRole("button", { name: "Create pattern" }).click();
  await expect(side.getByLabel("Name", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(side.getByText("Another pattern in this term already has this name.")).toBeVisible();
  await expect(side.getByLabel("Period 2 start")).toHaveAttribute("aria-invalid", "true");
  await expect(side.getByText(/Period 2 overlaps Period 1|Period 1 overlaps Period 2/).first()).toBeVisible();
  await side.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Edit HSC Saturday" })).toHaveCount(1);
});

test("an extra Friday for one batch appears only for that batch, then is removed (AC-03)", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Add exception" }).click();
  const side = editor(page);
  await side.getByRole("combobox", { name: "Batch", exact: true }).selectOption({ label: "HSC-25B" });
  await side.getByRole("combobox", { name: "Day", exact: true }).selectOption({ label: "Friday" });
  await side.getByRole("combobox", { name: "What happens that day" }).selectOption({ label: "Classes, using HSC Tuesday" });
  await side.getByLabel("Class hours start").fill("09:00");
  await side.getByLabel("Class hours end").fill("12:00");
  await expect(side.getByText("Shown as:")).toContainText("Extra day");
  await side.getByLabel("Reason").fill("UX check: replacement slot");
  await side.getByRole("button", { name: "Save" }).click();
  await expect(result(page)).toContainText("Batch exception saved for Friday");
  await expect(page.getByRole("status").filter({ hasText: "Batch exception saved" })).toBeVisible();

  await page.goto("/routine?stream=HSC&view=day&day=6&batch=all", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: /^Friday/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Friday is an extra teaching day for HSC-25B only.")).toBeVisible();
  const rows = page.getByRole("region", { name: "Routine grid for the selected day" }).locator("tbody th[scope=row]");
  await expect(rows.first()).toContainText("HSC-25B");
  await expect(rows).toHaveCount(2); // HSC-25B and the other departments' bookings row

  await open(page);
  await page.getByRole("button", { name: "Edit the Friday exception for HSC-25B" }).click();
  await editor(page).getByRole("button", { name: "Remove exception" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove exception" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Exception removed" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit the Friday exception for HSC-25B" })).toHaveCount(0);
});

test("a batch with its own periods gets its own header group, and changes show their impact first (AC-04, AC-06)", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "New pattern" }).click();
  let side = editor(page);
  await side.getByLabel("Name", { exact: true }).fill("UX lab block");
  await side.getByLabel("First starts").fill("09:00");
  await side.getByLabel("Minutes each").fill("150");
  await side.getByLabel("How many").fill("2");
  await side.getByLabel("Break after period").fill("0");
  await side.getByRole("button", { name: "Fill", exact: true }).click();
  await side.getByRole("button", { name: "Create pattern" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Pattern created: UX lab block." })).toBeVisible();

  await page.getByRole("button", { name: "Add exception" }).click();
  side = editor(page);
  await side.getByRole("combobox", { name: "Batch", exact: true }).selectOption({ label: "HSC-24B" });
  await side.getByRole("combobox", { name: "Day", exact: true }).selectOption({ label: "Tuesday" });
  await side.getByRole("combobox", { name: "What happens that day" }).selectOption({ label: "Classes, using UX lab block" });
  await side.getByLabel("Reason").fill("UX check: lab block");
  await expect(side.getByText("Shown as:")).toContainText("Own periods");
  await expect(side.getByRole("status")).toContainText("Before you save");
  await side.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Batch exception saved for Tuesday" })).toBeVisible();

  await page.goto("/routine?stream=HSC&view=day&day=3&batch=all", { waitUntil: "networkidle" });
  await expect(page.getByRole("region", { name: "Routine grid, UX lab block periods" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Routine grid, HSC Tuesday periods" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Routine grid, UX lab block periods" }).locator("tbody th[scope=row]").first()).toContainText("HSC-24B");

  await open(page);
  await page.getByRole("button", { name: "Edit the Tuesday exception for HSC-24B" }).click();
  await editor(page).getByRole("button", { name: "Remove exception" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove exception" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Exception removed" })).toBeVisible();
  await page.getByRole("button", { name: "Edit UX lab block" }).click();
  await editor(page).getByRole("button", { name: "Delete pattern" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete pattern" }).click();
  await expect(page.getByRole("status").filter({ hasText: "UX lab block deleted." })).toBeVisible();
});

test("phone: the page stacks with no page-wide overflow (AC-11)", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  await page.getByRole("button", { name: "Edit Sunday for HSC" }).click();
  await expect(editor(page).getByRole("heading", { name: "Sunday for HSC" })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
});
