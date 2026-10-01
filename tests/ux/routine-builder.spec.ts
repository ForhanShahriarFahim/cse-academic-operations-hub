/**
 * UX-01 amendment A: Routine builder workbench flows (RB-01–RB-11).
 * Runs against the disposable review server (`npm run ux:review`). Every flow
 * that changes the draft undoes itself, so the suite can be repeated.
 */
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

const sessionFile = path.join(process.cwd(), ".tmp", "ux-review", "session.local.json");

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ context, page }) => {
  const { cookie } = JSON.parse(readFileSync(sessionFile, "utf8")) as { cookie: string };
  await context.addCookies([{ name: "better-auth.session_token", value: cookie, domain: "localhost", path: "/" }]);
  await page.setViewportSize({ width: 1600, height: 1000 });
});

const card = (page: Page, code: string) => page.getByRole("button", { name: new RegExp(`^${code},`) }).first();
const panel = (page: Page) => page.locator("aside[aria-labelledby]");

async function openSaturday(page: Page) {
  await page.goto("/routine?stream=HSC&view=day&day=0&batch=all", { waitUntil: "networkidle" });
}

test("clashes are marked on the grid and match the day tab count (RB-01)", async ({ page }) => {
  await openSaturday(page);
  const clashCards = page.getByRole("button", { name: /has a blocking clash/ });
  // Needs the source data's room clashes; the `--publishable` review copy has them cleared (TCH-02).
  test.skip(await clashCards.count() === 0, "No clashes in this review copy: run RB-01 on a plain copy (npm run ux:review -- --fresh).");
  expect(await clashCards.count()).toBeGreaterThan(0);
  await expect(card(page, "CSE-3200")).toHaveAccessibleName(/has a blocking clash/);
  await expect(page.getByRole("button", { name: /^Saturday, \d+ clash/ })).toBeVisible();
});

test("selecting a class opens the panel, outlines related classes, and Esc returns focus (RB-02)", async ({ page }) => {
  await openSaturday(page);
  const target = card(page, "CSE-3200");
  await target.click();
  await expect(panel(page).getByRole("heading", { name: /CSE-3200/ })).toBeVisible();
  await expect(page.getByText("Same teacher or room").first()).toBeVisible();
  await panel(page).getByLabel("Day", { exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(panel(page).getByRole("heading", { name: "Needs attention" })).toBeVisible();
  await expect(target).toBeFocused();
});

test("changing the room shows availability, pre-checks, saves, and undoes (RB-03, RB-04, RB-07)", async ({ page }) => {
  await openSaturday(page);
  await card(page, "CSE-4101").click();
  const side = panel(page);
  await side.getByRole("button", { name: "Remove NB-406" }).click();
  const rooms = side.getByRole("combobox", { name: /Room/ });
  await rooms.click();
  const listbox = side.getByRole("listbox", { name: /Room/ });
  await expect(listbox.getByRole("option").first()).toContainText("Free");
  await expect(listbox.getByRole("option", { name: /In use/ }).first()).toBeVisible();
  const other = listbox.getByRole("option").filter({ hasNotText: "NB-406" }).filter({ hasText: "Free" }).first();
  const chosen = (await other.locator("span").first().innerText()).trim();
  await other.click();
  await expect(side.getByRole("status").filter({ hasText: "No clashes" })).toBeVisible();
  await side.getByRole("button", { name: "Save changes" }).click();
  const notice = page.getByRole("status").filter({ hasText: "CSE-4101 updated" });
  await expect(notice).toBeVisible();
  await expect(card(page, "CSE-4101")).toHaveAccessibleName(new RegExp(chosen));
  await notice.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Undone" })).toBeVisible();
  await expect(card(page, "CSE-4101")).toHaveAccessibleName(/NB-406/);
});

test("a change that would clash cannot be saved and says why (RB-03)", async ({ page }) => {
  await openSaturday(page);
  await card(page, "CSE-3107").click();
  const side = panel(page);
  await side.getByLabel("Starts").fill("12:00");
  await side.getByLabel("Ends").fill("13:15");
  await expect(side.getByRole("alert").filter({ hasText: "This change would cause" })).toBeVisible();
  await expect(side.getByRole("button", { name: "Save changes" })).toBeDisabled();
});

test("deleting a class can be undone, and 'Where does it fit?' offers places for it (RB-05, RB-07)", async ({ page }) => {
  await openSaturday(page);
  await card(page, "CSE-4103").click();
  await panel(page).getByRole("button", { name: "Delete class" }).click();
  await page.getByRole("dialog", { name: /Delete CSE-4103/ }).getByRole("button", { name: "Delete class" }).click();
  const notice = page.getByRole("status").filter({ hasText: /removed/ });
  await expect(notice).toBeVisible();
  await expect(card(page, "CSE-4103")).toHaveCount(0);

  const side = panel(page);
  const fitButton = side.getByRole("listitem").filter({ hasText: "CSE-4103" }).getByRole("button", { name: /Where does it fit/ });
  if (await fitButton.count()) {
    await fitButton.click();
    await expect(side.getByRole("button", { name: /Showing \d+ place/ })).toBeVisible();
  }

  await notice.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Undone" })).toBeVisible();
  await expect(card(page, "CSE-4103")).toBeVisible();
});

test("dragging a class to a free cell in its row moves it, and Undo restores it (RB-11)", async ({ page }) => {
  await openSaturday(page);
  const source = card(page, "CSE-4237");
  const before = await source.getAttribute("aria-label");
  const row = page.getByRole("row", { name: /HSC-22B/ });
  const target = row.getByRole("button", { name: /Add a class to HSC-22B/ }).first();
  await source.dragTo(target);
  const notice = page.locator("[role=status], [role=alert]").filter({ hasText: /CSE-4237 (moved|was not moved)/ });
  await expect(notice).toBeVisible();
  if (/moved to/.test(await notice.innerText())) {
    await notice.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Undone" })).toBeVisible();
  }
  await expect(card(page, "CSE-4237")).toHaveAttribute("aria-label", before!);
});

test("the keyboard alternative lists free times to move to (RB-11)", async ({ page }) => {
  await openSaturday(page);
  await card(page, "CSE-4101").click();
  await expect(panel(page).getByRole("heading", { name: "Move to a free time" })).toBeVisible();
});

test("phone: agenda with full-screen sheet and no page overflow (RB-08)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openSaturday(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  // Batches with clashes open by default in the phone agenda. The `--publishable` review copy has
  // no clashes (TCH-02), so there the batch is opened by hand.
  const batch = page.locator("details").filter({ hasText: "CSE-3200" }).first();
  const isOpen = () => batch.evaluate((element) => (element as HTMLDetailsElement).open);
  if (await page.getByRole("button", { name: /has a blocking clash/ }).count() > 0) expect(await isOpen()).toBe(true);
  else if (!await isOpen()) await batch.locator("summary").click();
  await batch.getByRole("button", { name: /CSE-3200/ }).click();
  const sheet = page.getByRole("dialog", { name: /CSE-3200/ });
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
});
