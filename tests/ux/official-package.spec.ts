/**
 * RUT-04 amendment B: the official routine package prints inside its sheets.
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

test("the draft package fits every sheet on screen and in print, in black and white", async ({ page }) => {
  await page.goto("/routine/official", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const sheets = page.locator(".official-sheet");
  await expect(sheets.first()).toBeVisible();
  const count = await sheets.count();
  expect(count).toBeGreaterThanOrEqual(4);
  await expect(page.getByRole("heading", { name: /^Weekly Class Routine: / }).first()).toBeVisible();
  await expect(page.getByText("DRAFT: NOT OFFICIAL").first()).toBeVisible();
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
  expect(await sheets.count()).toBe(count);
});
