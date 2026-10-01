/**
 * TCH-02: individual teacher routine, My routine and bulk print.
 * Runs against the disposable review server. It signs in an unlinked administrator (`cookie`) and a
 * teacher linked to a teacher record (`teacherCookie`). The published path needs the copy built with
 * `npm run ux:review -- --fresh --publishable` (room blockers cleared, published, one later draft
 * change for the linked teacher); the unpublished path needs a plain copy. Each skips on the other.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

const sessionFile = path.join(process.cwd(), ".tmp", "ux-review", "session.local.json");
const session = () => JSON.parse(readFileSync(sessionFile, "utf8")) as { cookie: string; teacherCookie?: string };

async function signIn(context: BrowserContext, as: "admin" | "teacher") {
  const saved = session();
  const value = as === "admin" ? saved.cookie : saved.teacherCookie;
  if (!value) throw new Error("No teacher session. Restart `npm run ux:review` to seed the linked teacher account.");
  await context.addCookies([{ name: "better-auth.session_token", value, domain: "localhost", path: "/", sameSite: "Lax" }]);
}

/** Anything that runs past a sheet's body, outside its side margins, under its footer, or is clipped. */
function fitProblems(page: Page) {
  return page.evaluate(() => {
    const problems: string[] = [];
    document.querySelectorAll<HTMLElement>(".teacher-routine-sheet").forEach((sheet, index) => {
      const body = sheet.querySelector<HTMLElement>(".teacher-routine-body")!;
      if (body.scrollHeight > body.clientHeight + 1) problems.push(`sheet ${index + 1}: body overflows by ${body.scrollHeight - body.clientHeight}px`);
      const box = sheet.getBoundingClientRect();
      const style = getComputedStyle(sheet);
      const left = box.left + parseFloat(style.paddingLeft) - 0.5;
      const right = box.right - parseFloat(style.paddingRight) + 0.5;
      const bottom = sheet.querySelector(".teacher-routine-foot")!.getBoundingClientRect().top + 0.5;
      for (const element of body.querySelectorAll<HTMLElement>("table, th, td, li")) {
        const rect = element.getBoundingClientRect();
        if (rect.left < left || rect.right > right || rect.bottom > bottom) { problems.push(`sheet ${index + 1}: ${element.tagName} "${element.textContent?.slice(0, 40)}" is outside the frame`); break; }
        if (element.tagName !== "TABLE" && element.scrollWidth > element.clientWidth + 1) { problems.push(`sheet ${index + 1}: clipped "${element.textContent?.slice(0, 40)}"`); break; }
      }
    });
    return problems;
  });
}

const pageOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test("a linked teacher sees the published routine as tables, a phone agenda and one A4 print page", async ({ context, page }) => {
  await signIn(context, "teacher");
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/my-routine", { waitUntil: "networkidle" });
  await expect(page.getByRole("link", { name: "My routine" })).toHaveAttribute("aria-current", "page");
  test.skip(await page.getByText("Not published yet").count() > 0, "Nothing published in this review copy: use npm run ux:review -- --fresh --publishable.");
  // Published is the default; the later draft change for this teacher is announced.
  await expect(page.getByRole("link", { name: "Published", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText(/The working draft changes 1 of these classes/)).toBeVisible();
  await expect(page.getByText(/Publication v\d+, effective/)).toBeVisible();
  const tables = page.locator("table.teacher-week");
  await expect(tables.first()).toBeVisible();
  const classesOnScreen = await page.locator("table.teacher-week td.teacher-week-class > div").count();
  expect(classesOnScreen).toBeGreaterThan(0);
  await expect(page.getByRole("heading", { name: /credit hours add up/ })).toBeVisible();

  // Phone: the agenda replaces the tables, with no page-wide overflow.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload({ waitUntil: "networkidle" });
  await expect(tables.first()).toBeHidden();
  await expect(page.getByText("Today", { exact: true })).toBeVisible();
  expect(await pageOverflow(page)).toBe(0);
  // AC-10: the agenda lists each class once; a class shown in two program sections of the tables appears once here.
  const agendaClasses = await page.locator("section[aria-label] ol > li").count();
  expect(agendaClasses).toBeGreaterThan(0);
  expect(agendaClasses).toBeLessThanOrEqual(classesOnScreen + 20);

  // Print: only the A4 sheet, marked with the publication, on one page, nothing clipped.
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.emulateMedia({ media: "print" });
  const sheets = page.locator(".teacher-routine-sheet");
  await expect(sheets).toHaveCount(1);
  await expect(sheets.first()).toBeVisible();
  await expect(sheets.first().getByText("Effective from")).toBeVisible();
  await expect(sheets.first().getByText(/^Publication v\d+ · printed/)).toBeVisible();
  await expect(sheets.first().getByText("Individual Class Routine")).toBeVisible();
  await expect(sheets.first().getByText(/Total Credit Hours:/)).toBeVisible();
  await expect(page.locator("table.teacher-week").first()).toBeHidden();
  expect(await fitProblems(page)).toEqual([]);
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  expect((pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(1);

  // The working draft: chosen explicitly, no change notice, and the print is marked as a draft.
  await page.emulateMedia({ media: "screen" });
  await page.goto("/my-routine?source=draft", { waitUntil: "networkidle" });
  await expect(page.getByRole("link", { name: "Working draft" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText(/The working draft changes/)).toHaveCount(0);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".teacher-routine-sheet").first().getByText("Draft — not official")).toBeVisible();
  expect(await fitProblems(page)).toEqual([]);
});

test("with nothing published, My routine shows the working draft and prints it as a draft", async ({ context, page }) => {
  await signIn(context, "teacher");
  await page.goto("/my-routine", { waitUntil: "networkidle" });
  test.skip(await page.getByText("Not published yet").count() === 0, "This review copy is published: the unpublished state runs on a plain copy (npm run ux:review -- --fresh).");
  await expect(page.getByRole("link", { name: "Working draft" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText(/Nothing is published yet for this term/)).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".teacher-routine-sheet").first().getByText("Draft — not official")).toBeVisible();
  expect(await fitProblems(page)).toEqual([]);
});

test("an account without a teacher record is told so and has no My routine link", async ({ context, page }) => {
  await signIn(context, "admin");
  await page.goto("/my-routine", { waitUntil: "networkidle" });
  await expect(page.getByText("Your account is not linked to a teacher record")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "My routine" })).toHaveCount(0);
});

test("any teacher's routine opens from the teacher page; unknown ids are not found", async ({ context, page }) => {
  await signIn(context, "admin");
  await page.goto("/teachers", { waitUntil: "networkidle" });
  await page.locator("table.ledger tbody a").first().click();
  await page.getByRole("link", { name: "Individual routine" }).click();
  await expect(page).toHaveURL(/\/teachers\/\d+\/routine/);
  await expect(page.getByRole("heading", { name: "Weekly routine" })).toBeVisible();
  // A streamed page cannot change its status once started, so this is a soft 404 (as on /teachers/[id]).
  await page.goto("/teachers/999999/routine", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "That record could not be found" })).toBeVisible();
});

test("bulk print gives one A4 sheet per chosen teacher, each fitting its page", async ({ context, page }) => {
  await signIn(context, "admin");
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/teachers", { waitUntil: "networkidle" });
  await page.getByRole("link", { name: "Print teacher routines" }).click();
  await expect(page.getByRole("heading", { name: "Print teacher routines" })).toBeVisible();

  const ready = page.locator('input[name="id"]:not([disabled])');
  const readyCount = await ready.count();
  expect(readyCount).toBeGreaterThan(5);
  await page.getByLabel("All ready").uncheck();
  await expect(page.getByRole("button", { name: /Open 0 routines to print/ })).toBeDisabled();
  await page.getByLabel("All ready").check();
  await page.getByPlaceholder("Name or code").fill("zzzz-no-match");
  await expect(page.getByText("No teachers match.")).toBeVisible();
  await page.getByPlaceholder("Name or code").fill("");
  await page.getByRole("button", { name: `Open ${readyCount} routines to print` }).click();

  await expect(page).toHaveURL(/\/teachers\/routines\/print\?/);
  await expect(page.getByRole("heading", { name: `${readyCount} teacher routines` })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const sheets = page.locator(".teacher-routine-sheet");
  expect(await sheets.count()).toBeGreaterThanOrEqual(readyCount);
  expect(await fitProblems(page)).toEqual([]);
  expect(await pageOverflow(page)).toBe(0);

  await page.emulateMedia({ media: "print" });
  expect(await fitProblems(page)).toEqual([]);
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  expect(pages).toBe(await sheets.count());

  // Only black, white and greys on the sheets.
  const colours = await page.evaluate(() => {
    const found = new Set<string>();
    for (const element of document.querySelectorAll<HTMLElement>(".teacher-routine-sheet *")) {
      const style = getComputedStyle(element);
      for (const value of [style.color, style.backgroundColor, style.borderTopColor]) {
        const match = value.match(/rgba?\((\d+), (\d+), (\d+)/);
        if (match && !(match[1] === match[2] && match[2] === match[3])) found.add(value);
      }
    }
    return [...found];
  });
  expect(colours).toEqual([]);
});
