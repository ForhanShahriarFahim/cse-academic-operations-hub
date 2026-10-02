/**
 * RUT-04 amendment B: the official routine package prints inside its sheets. BUG-54: so does its
 * contacts appendix, however many teachers are listed (run on a --long-teacher-list copy too).
 * Runs against the disposable review server (`npm run ux:review`).
 */
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

const sessionFile = path.join(process.cwd(), ".tmp", "ux-review", "session.local.json");

test.beforeEach(async ({ context, page }) => {
  const { cookie } = JSON.parse(readFileSync(sessionFile, "utf8")) as { cookie: string };
  await context.addCookies([{ name: "better-auth.session_token", value: cookie, domain: "localhost", path: "/" }]);
  await page.setViewportSize({ width: 1440, height: 1000 });
});

/** Lists anything that runs past a sheet's body, outside its side margins, under its footer, or is clipped. */
function fitProblems(page: Page) {
  return page.evaluate(() => {
    const problems: string[] = [];
    document.querySelectorAll<HTMLElement>(".official-sheet").forEach((sheet, index) => {
      const body = sheet.querySelector<HTMLElement>(".official-sheet-body")!;
      if (body.scrollHeight > body.clientHeight + 1) problems.push(`page ${index + 1}: body overflows by ${body.scrollHeight - body.clientHeight}px`);
      const box = sheet.getBoundingClientRect();
      const style = getComputedStyle(sheet);
      const left = box.left + parseFloat(style.paddingLeft) - 0.5;
      const right = box.right - parseFloat(style.paddingRight) + 0.5;
      const bottom = sheet.querySelector(".official-sheet-foot")!.getBoundingClientRect().top + 0.5;
      for (const element of body.querySelectorAll<HTMLElement>("table, th, td")) {
        const rect = element.getBoundingClientRect();
        if (rect.left < left || rect.right > right || rect.bottom > bottom) { problems.push(`page ${index + 1}: ${element.tagName} "${element.textContent?.slice(0, 40)}" is outside the frame`); break; }
        if (element.tagName !== "TABLE" && element.scrollWidth > element.clientWidth + 1) { problems.push(`page ${index + 1}: clipped "${element.textContent?.slice(0, 40)}"`); break; }
      }
    });
    return problems;
  });
}

/** Contacts appendix (BUG-54): estimates hold, the legend names its page, and continued sheets are whole and numbered. */
async function contactsProblems(page: Page) {
  return page.evaluate(() => {
    const problems: string[] = [];
    const sheets = [...document.querySelectorAll<HTMLElement>(".official-sheet")];
    const title = (sheet: HTMLElement) => sheet.querySelector("h2")?.textContent ?? "";
    const contacts = sheets.filter((sheet) => title(sheet) === "Teachers, Class Representatives and Query Contacts");
    if (!contacts.length) return ["no contacts sheet"];

    for (const element of document.querySelectorAll<HTMLElement>(".official-sheet [data-estimate-mm]")) {
      if (element.matches("table.official-routine")) continue;
      const real = element.getBoundingClientRect().height * 25.4 / 96;
      if (real > Number(element.dataset.estimateMm) + 1.5) problems.push(`page ${sheets.indexOf(element.closest(".official-sheet")!) + 1}: ${element.className} is ${real.toFixed(1)} mm, estimated ${element.dataset.estimateMm}`);
    }

    const first = sheets.indexOf(contacts[0]) + 1;
    for (const sheet of sheets) {
      if (!/^Weekly Class Routine/.test(title(sheet))) continue;
      if (!sheet.querySelector(".official-sheet-foot")?.textContent?.includes(`Teacher codes are listed on page ${first}.`)) problems.push(`page ${sheets.indexOf(sheet) + 1}: legend does not name page ${first}`);
    }
    sheets.forEach((sheet, index) => {
      if (!sheet.querySelector(".official-page")?.textContent?.includes(`Page ${index + 1} of ${sheets.length}`)) problems.push(`page ${index + 1}: wrong page number`);
    });

    contacts.forEach((sheet, index) => {
      const note = sheet.querySelector(".official-sheet-title span")?.textContent ?? null;
      const expected = contacts.length > 1
        ? `Sheet ${index + 1} of ${contacts.length} · ${index + 1 < contacts.length ? "continued on the next sheet" : "continued from the previous sheet"}`
        : null;
      if (note !== expected) problems.push(`contacts sheet ${index + 1}: note "${note}", expected "${expected}"`);
    });
    const labels = contacts.flatMap((sheet) => [...sheet.querySelectorAll(".official-section-label")].map((label) => label.textContent));
    const teacherLabels = labels.filter((label) => label?.startsWith("Teachers"));
    if (teacherLabels.some((label, index) => label !== (index ? "Teachers (continued)" : "Teachers"))) problems.push(`teacher labels ${teacherLabels.join(", ")}`);
    for (const label of ["Class representatives, B.Sc. in CSE (HSC)", "Class representatives, B.Sc. in CSE (Diploma)"]) {
      if (labels.filter((text) => text === label).length !== 1) problems.push(`"${label}" is not printed exactly once`);
    }
    if (labels.filter((text) => text === "For any query").length > 1) problems.push("query contacts are split");
    const serials = contacts.flatMap((sheet) => [...sheet.querySelectorAll(".official-teacher-columns table")].flatMap((table) => {
      if (!table.querySelector("thead th")) problems.push("a teacher table has no header");
      return [...table.querySelectorAll("tbody tr td:first-child")].map((cell) => Number(cell.textContent));
    }));
    if (serials.some((serial, index) => serial !== index + 1)) problems.push("teacher SL numbers are not continuous");
    return problems;
  });
}

/** The fit, estimate, colour and contacts checks for one package route, on screen and in print. */
async function checkPackage(page: Page, route: string) {
  await page.goto(route, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const sheets = page.locator(".official-sheet");
  await expect(sheets.first()).toBeVisible();
  const count = await sheets.count();
  expect(count).toBeGreaterThanOrEqual(5);
  await expect(page.getByRole("heading", { name: /^Weekly Class Routine: / }).first()).toBeVisible();
  expect(await fitProblems(page)).toEqual([]);

  // Sheets are filled from height estimates; a table must never be taller than estimated.
  const underestimated = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("table.official-routine")]
    .map((table) => ({ estimate: Number(table.dataset.estimateMm), real: table.getBoundingClientRect().height * 25.4 / 96 }))
    .filter(({ estimate, real }) => real > estimate + 1.5));
  expect(underestimated).toEqual([]);

  // Only black, white and greys: no validation colour anywhere in the package.
  const colours = await page.evaluate(() => {
    const found = new Set<string>();
    for (const element of document.querySelectorAll<HTMLElement>(".official-package *")) {
      const style = getComputedStyle(element);
      for (const value of [style.color, style.backgroundColor, style.borderTopColor]) {
        const match = value.match(/rgba?\((\d+), (\d+), (\d+)/);
        if (match && !(match[1] === match[2] && match[2] === match[3])) found.add(value);
      }
    }
    return [...found];
  });
  expect(colours).toEqual([]);

  await page.emulateMedia({ media: "print" });
  expect(await fitProblems(page)).toEqual([]);
  expect(await contactsProblems(page)).toEqual([]);
  expect(await sheets.count()).toBe(count);
}

test("the draft package fits every sheet on screen and in print, in black and white", async ({ page }) => {
  await checkPackage(page, "/routine/official");
  await expect(page.getByText("DRAFT: NOT OFFICIAL").first()).toBeVisible();
});

test("the published package fits every sheet on screen and in print, in black and white", async ({ page }) => {
  await page.goto("/public/routine/official", { waitUntil: "networkidle" });
  test.skip(await page.getByText("No published routine").count() > 0, "Nothing published in this review copy: use npm run ux:review -- --fresh --publishable.");
  await checkPackage(page, "/public/routine/official");
  await expect(page.getByText("DRAFT: NOT OFFICIAL")).toHaveCount(0);
});
