/**
 * OD-01A (#13) cross-department commitments: guided form with field errors and the
 * impact preview, verify with a note, edit returning to Pending, archive with a
 * reason, reactivate, history, resolve a note and delete a mistaken entry.
 * Runs against the disposable review server from `npm run ux:review`; every record
 * it adds is synthetic and deleted again. Screenshots go to .tmp/ux-review/od-01a.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const sessionFile = path.join(process.cwd(), ".tmp", "ux-review", "session.local.json");
const shots = path.join(process.cwd(), ".tmp", "ux-review", "od-01a");
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
mkdirSync(shots, { recursive: true });

async function signIn(context: BrowserContext, as: "admin" | "teacher") {
  const saved = JSON.parse(readFileSync(sessionFile, "utf8")) as { cookie: string; teacherCookie?: string };
  const value = as === "admin" ? saved.cookie : saved.teacherCookie;
  if (!value) throw new Error("No review session. Restart `npm run ux:review`.");
  await context.addCookies([{ name: "better-auth.session_token", value, domain: "localhost", path: "/", sameSite: "Lax" }]);
}
async function axe(page: Page) {
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async () => {
    const result = await (window as unknown as { axe: { run: (c: Document, o: object) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] });
    return result.violations.map((v) => `${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(" ")}`);
  });
}
async function review(page: Page, name: string) {
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(150);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${name} at ${width}px has no page-wide horizontal scroll`).toBe(0);
    expect(await axe(page), `${name} at ${width}px`).toEqual([]);
    await page.screenshot({ path: path.join(shots, `${name}-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}
const department = () => `SYN-${Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 5).toUpperCase()}`;
const row = (page: Page, text: string) => page.locator("tbody tr").filter({ hasText: text });

test("register: renamed, explains the OD row, filters and counts", async ({ context, page }) => {
  await signIn(context, "admin");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/od", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1, name: "Cross-department commitments" })).toBeVisible();
  await expect(page.getByText("OD row", { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation").getByRole("link", { name: "Cross-department commitments" })).toBeVisible();
  for (const header of ["Blocks", "Completeness", "Verification"]) await expect(page.getByRole("columnheader", { name: header })).toBeVisible();
  // Imported Summer rows are room-only: "Room … only" and completeness C.
  await expect(page.locator("tbody tr").first()).toContainText(/Room .+ only/);
  await review(page, "register");
  await page.getByLabel("State").selectOption("archived");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/state=archived/);
});

test("guided form: field errors keep input; impact preview shows blocks, level and clashes", async ({ context, page }) => {
  await signIn(context, "admin");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/od/new", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: /Record commitment/ })).toBeDisabled();
  await page.getByLabel("Another department uses one of our rooms").check();
  await expect(page.getByLabel("Teacher *")).toHaveCount(0);
  await page.getByLabel("Other department *").fill("SYN-PREVIEW");
  await page.getByLabel("Day *").selectOption({ label: "Sunday" });
  await page.getByLabel("Start *").fill("08:00");
  await page.getByLabel("End *").fill("07:30");
  await page.getByRole("button", { name: /Record commitment/ }).click();
  await expect(page.getByRole("form", { name: "Commitment details" }).getByRole("alert")).toContainText("Check the highlighted fields");
  await expect(page.getByLabel("Room *")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("End must be after the start.")).toBeVisible();
  await expect(page.getByLabel("Other department *")).toHaveValue("SYN-PREVIEW");
  await page.getByLabel("Room *").selectOption({ index: 1 });
  await page.getByLabel("End *").fill("20:00");
  const preview = page.getByRole("complementary", { name: "Impact preview" });
  await expect(preview).toContainText(/Will block: Room .+ only on Sunday/);
  await expect(preview).toContainText("Completeness C");
  await expect(preview).toContainText(/Clashes in the working draft \([1-9]\d*\)/);
  const from = page.getByLabel("From", { exact: true });
  const through = page.getByLabel("Through", { exact: true });
  const firstDay = await from.getAttribute("min");
  expect(firstDay).toBeTruthy();
  const sunday = new Date(`${firstDay}T00:00:00Z`);
  sunday.setUTCDate(sunday.getUTCDate() + (7 - sunday.getUTCDay()) % 7);
  const date = sunday.toISOString().slice(0, 10);
  await from.fill(date);
  await expect(preview).toContainText("Enter valid effective dates");
  await through.fill(date);
  await expect(preview).toContainText(date);
  await review(page, "form-room-preview");
  await page.getByRole("button", { name: /Record commitment/ }).click();
  await expect(row(page, "SYN-PREVIEW")).toContainText(date);
  await page.goto("/routine/official", { waitUntil: "networkidle" });
  await expect(page.locator(".official-od").filter({ hasText: "SYN-PREVIEW" }).first()).toContainText(date);
  await page.pdf({ path: path.join(shots, "dated-od-routine.pdf"), preferCSSPageSize: true });
  await page.goto("/od", { waitUntil: "networkidle" });
  await row(page, "SYN-PREVIEW").getByText("More ▾").click();
  await row(page, "SYN-PREVIEW").getByRole("button", { name: "Delete mistaken entry" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete mistaken entry" }).click();
  await expect(row(page, "SYN-PREVIEW")).toHaveCount(0);
});

test("lifecycle: create, verify with note, edit returns to Pending, archive, reactivate, history, delete", async ({ context, page }) => {
  await signIn(context, "admin");
  await page.setViewportSize({ width: 1440, height: 900 });
  const dept = department();
  await page.goto("/od/new", { waitUntil: "networkidle" });
  await page.getByLabel("Our teacher teaches for another department").check();
  await page.getByLabel("Other department *").fill(dept);
  await page.getByLabel("Teacher *").selectOption({ index: 1 });
  await page.getByLabel("Day *").selectOption({ label: "Thursday" });
  await page.getByLabel("Start *").fill("16:00");
  await page.getByLabel("End *").fill("17:00");
  await page.getByLabel("Course", { exact: true }).fill("SYN-1101");
  await expect(page.getByRole("complementary", { name: "Impact preview" })).toContainText(/Credits.*add to raise the level/);
  await page.getByRole("button", { name: /Record commitment/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Commitment recorded as Pending" })).toBeVisible();
  await expect(row(page, dept)).toContainText("B · credits missing");
  await expect(row(page, dept)).toContainText("Pending");
  await row(page, dept).getByRole("link", { name: "Link teaching group" }).click();
  await expect(page.getByRole("heading", { name: "Link to a formal teaching group" })).toBeVisible();
  await review(page, "formal-group-link");
  await page.getByRole("link", { name: "← Cross-department commitments" }).click();

  // Verify needs a note.
  await row(page, dept).getByRole("button", { name: /^Verify/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Mark verified" }).click();
  await expect(dialog.getByLabel("How was this confirmed? *")).toBeFocused();
  await dialog.getByLabel("How was this confirmed? *").fill("Synthetic phone confirmation");
  await review(page, "verify-dialog");
  await dialog.getByRole("button", { name: "Mark verified" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Commitment verified." })).toBeVisible();
  await expect(row(page, dept)).toContainText("Verified");

  // Editing a planning fact returns it to Pending; adding credits raises the level to A.
  await row(page, dept).getByRole("link", { name: /^Edit/ }).click();
  await expect(page.getByText(/This commitment is verified/)).toBeVisible();
  await page.getByLabel("End *").fill("17:30");
  await page.getByLabel("Credits").fill("3.0");
  await review(page, "edit-verified");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "returned to Pending" })).toBeVisible();
  await expect(row(page, dept)).toContainText("A · complete");
  await expect(row(page, dept)).toContainText("Pending");

  // Archive with a reason; it leaves Active and planning.
  await row(page, dept).getByText("More ▾").click();
  await row(page, dept).getByRole("button", { name: "Archive" }).click();
  await page.getByRole("dialog").getByLabel("Reason *").fill("Synthetic arrangement ended");
  await review(page, "archive-dialog");
  await page.getByRole("dialog").getByRole("button", { name: "Archive commitment" }).click();
  await expect(page.getByRole("status").filter({ hasText: "archived" })).toBeVisible();
  await expect(row(page, dept)).toHaveCount(0);
  await page.goto("/od?state=archived", { waitUntil: "networkidle" });
  await expect(row(page, dept)).toContainText("Archived");
  await expect(row(page, dept)).toContainText("Nothing — archived");

  // Reactivate returns it as Pending.
  await row(page, dept).getByRole("button", { name: /^Reactivate/ }).click();
  await page.getByRole("dialog").getByLabel("Reason *").fill("Synthetic arrangement resumed");
  await page.getByRole("dialog").getByRole("button", { name: "Reactivate as Pending" }).click();
  await expect(page.getByRole("status").filter({ hasText: "reactivated as Pending" })).toBeVisible();

  // History lists every event, newest first, with field changes and reasons.
  await page.goto("/od", { waitUntil: "networkidle" });
  await row(page, dept).getByText("More ▾").click();
  await row(page, dept).getByRole("link", { name: "History" }).click();
  const events = page.getByRole("list", { name: "Change history" }).locator(":scope > li");
  await expect(events).toHaveCount(5);
  await expect(events.nth(0)).toContainText("Reactivated");
  await expect(events.nth(1)).toContainText("Archived");
  await expect(events.nth(1)).toContainText("Synthetic arrangement ended");
  await expect(events.nth(2)).toContainText("Edited");
  await expect(events.nth(2)).toContainText("returned to Pending");
  await expect(events.nth(3)).toContainText("Synthetic phone confirmation");
  await expect(events.nth(4)).toContainText("Created");
  await review(page, "history");

  // Delete the mistaken synthetic entry.
  await page.goto("/od", { waitUntil: "networkidle" });
  await row(page, dept).getByText("More ▾").click();
  await row(page, dept).getByRole("button", { name: "Delete mistaken entry" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete mistaken entry" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Mistaken entry deleted" })).toBeVisible();
  await expect(row(page, dept)).toHaveCount(0);
});

test("an unresolved note blocks nothing, cannot be verified, and resolves into a Pending record", async ({ context, page }) => {
  await signIn(context, "admin");
  await page.setViewportSize({ width: 1440, height: 900 });
  const dept = department();
  await page.goto("/od/new", { waitUntil: "networkidle" });
  await page.getByLabel("Only a note — the details are not known yet").check();
  await expect(page.getByLabel("Day *")).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "Impact preview" })).toContainText("Will block: Nothing — unresolved note");
  await page.getByLabel("Other department *").fill(dept);
  await page.getByLabel("Note *").fill("Synthetic: may need a CSE room on Mondays");
  await page.getByRole("button", { name: /Record commitment/ }).click();
  await expect(row(page, dept)).toContainText("Nothing — unresolved note");
  await expect(row(page, dept).getByRole("button", { name: /^Verify/ })).toHaveCount(0);
  await review(page, "register-with-note");

  await row(page, dept).getByRole("link", { name: /^Resolve note/ }).click();
  await expect(page.getByLabel("Only a note — the details are not known yet")).toHaveCount(0);
  await page.getByLabel("Another department uses one of our rooms").check();
  await page.getByLabel("Room *").selectOption({ index: 2 });
  await page.getByLabel("Day *").selectOption({ label: "Monday" });
  await page.getByLabel("Start *").fill("16:30");
  await page.getByLabel("End *").fill("17:30");
  await review(page, "resolve-form");
  await page.getByRole("button", { name: "Resolve note" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Note resolved" })).toBeVisible();
  await expect(row(page, dept)).toContainText(/Room .+ only/);
  await expect(row(page, dept)).toContainText("Pending");

  await row(page, dept).getByText("More ▾").click();
  await row(page, dept).getByRole("link", { name: "History" }).click();
  await expect(page.getByText("Resolved from note")).toBeVisible();
  await expect(page.getByText("What is committed: Note only → Another department uses our room")).toBeVisible();

  await page.goto("/od", { waitUntil: "networkidle" });
  await row(page, dept).getByText("More ▾").click();
  await row(page, dept).getByRole("button", { name: "Delete mistaken entry" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete mistaken entry" }).click();
  await expect(row(page, dept)).toHaveCount(0);
});

test("a teacher cannot open the register, the form, link page or history", async ({ context, page }) => {
  await signIn(context, "teacher");
  for (const route of ["/od", "/od/new", "/od/1/edit", "/od/1/link", "/od/1/history"]) {
    await page.goto(route, { waitUntil: "networkidle" });
    await expect(page, route).toHaveURL(/\/forbidden/);
  }
});

test("term preparation previews and records a selected commitment as Pending", async ({ context, page }) => {
  await signIn(context, "admin");
  await page.setViewportSize({ width: 1440, height: 900 });
  const term = `Spring ${department()}`;
  await page.goto("/terms/new");
  await page.getByLabel("Term name").fill(term);
  await page.getByLabel("Academic year").fill("2027");
  await page.getByLabel("Start date", { exact: true }).fill("2027-01-01");
  await page.getByLabel("End date", { exact: true }).fill("2027-05-01");
  await page.getByRole("button", { name: "Save draft & set policy" }).click();
  await expect(page).toHaveURL(/\/terms\/\d+\/setup/);
  const targetUrl = new URL(page.url()).pathname.replace(/\/setup$/, "");
  const policyInputs = page.locator('fieldset input[type="number"]');
  for (let index = 0; index < await policyInputs.count(); index++) await policyInputs.nth(index).fill("1");
  await page.getByRole("button", { name: "Save policy & review activation" }).click();
  await expect(page).toHaveURL(/\/activate$/);
  await page.goto(`${targetUrl}/rollover`);
  await page.getByLabel("Source term").selectOption({ label: "Summer 2026 · active" });
  await page.getByRole("button", { name: "Load source placements" }).click();
  const choices = page.locator("section").filter({ has: page.getByRole("heading", { name: "Cross-department commitments", exact: true }) });
  await expect(choices).toBeVisible();
  const commitment = choices.locator('input[type="checkbox"]:enabled').first();
  await expect(commitment).not.toBeChecked();
  await commitment.check();
  const holdReasons = page.locator('input[id^="cohort-"][id$="-reason"]');
  for (let index = 0; index < await holdReasons.count(); index++) await holdReasons.nth(index).fill("Synthetic cohort hold for review");
  await page.getByLabel("Reason for preparation").fill("Synthetic review of the carried booking");
  await page.getByRole("button", { name: "Review preparation" }).click();
  await expect(page.getByRole("list", { name: "Commitments to carry" })).toContainText("Pending");
  await review(page, "rollover-commitments");
  await page.getByLabel(/Type destination identity/).fill(`${term} · 2027`);
  await page.getByLabel(/I reviewed these decisions/).check();
  await page.getByRole("button", { name: `Prepare ${term}`, exact: true }).click();
  await page.getByRole("link", { name: "View saved preparation receipt" }).click();
  await expect(page.getByRole("list", { name: "Carried commitments" })).toContainText("Copied as Pending");
});
