/**
 * UX-01 baseline (AC-01–AC-04, AC-06). Runs against the disposable review
 * server from `npm run ux:review`; see playwright.ux.config.ts.
 */
import { expect, test, type Page } from "@playwright/test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const sessionFile = path.join(root, ".tmp", "ux-review", "session.local.json");
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const internalRoutes = [
  "/", "/routine", "/routine?view=week", "/attendance", "/extra-load", "/conflicts", "/teachers", "/workload",
  "/rooms", "/batches", "/courses", "/od", "/publications", "/settings", "/access", "/routine/official", "/routine/periods",
  "/my-routine", "/teachers/routines", "/teachers/1/routine",
];
const publicRoutes = ["/public/routine", "/public/routine?view=week"];
/** Known violations with an owner or a recorded reason: route → axe rule ids. */
const deferred: Record<string, string[]> = {
  "/access": ["select-name"], // #31
};

test.beforeAll(async ({ request }) => {
  const health = await request.get("/api/health").catch(() => null);
  if (!health?.ok()) throw new Error("Review server is not running on :3100. Start it with `npm run ux:review`.");
  if (!existsSync(sessionFile)) throw new Error("No review session. Run `npm run ux:review` first.");
});

test.beforeEach(async ({ context }) => {
  const { cookie } = JSON.parse(readFileSync(sessionFile, "utf8")) as { cookie: string };
  await context.addCookies([{ name: "better-auth.session_token", value: cookie, domain: "localhost", path: "/", sameSite: "Lax" }]);
});

async function axeViolations(page: Page, route: string) {
  await page.addScriptTag({ content: axeSource });
  const violations = await page.evaluate(async () => {
    const result = await (window as unknown as { axe: { run: (context: Document, options: object) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } })
      .axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] });
    return result.violations.map((violation) => ({ id: violation.id, count: violation.nodes.length, first: violation.nodes[0]?.target.join(" ") }));
  });
  return violations.filter((violation) => !deferred[route]?.includes(violation.id));
}

for (const route of [...internalRoutes, ...publicRoutes]) {
  test(`no page-wide overflow at narrow widths: ${route}`, async ({ page }) => {
    for (const width of [360, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(route, { waitUntil: "networkidle" });
      expect(page.url(), "reviewer session must reach the page").not.toMatch(/\/(login|forbidden)/);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${route} at ${width}px`).toBe(0);
    }
  });

  test(`WCAG 2 A/AA (axe) at desktop and phone: ${route}`, async ({ page }) => {
    for (const viewport of [{ width: 1366, height: 850 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.goto(route, { waitUntil: "networkidle" });
      expect(await axeViolations(page, route), `${route} at ${viewport.width}px`).toEqual([]);
    }
  });
}

test("skip link is the first tab stop and moves focus to main content", async ({ page }) => {
  await page.goto("/workload", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#main")).toBeFocused();
});

test("navigation drawer is keyboard operable below 1024px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/workload", { waitUntil: "networkidle" });
  const menu = page.getByRole("button", { name: "Open navigation" });
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  const drawer = page.getByRole("dialog", { name: "Navigation" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("link", { name: "Workload" })).toHaveAttribute("aria-current", "page");
  expect(await drawer.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(menu).toBeFocused();

  await menu.click();
  await drawer.getByRole("link", { name: "Rooms" }).click();
  await expect(page).toHaveURL(/\/rooms$/);
  await expect(drawer).toBeHidden();
});

test("no native confirm() remains in application code", () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const file = path.join(dir, name);
      if (statSync(file).isDirectory()) walk(file);
      else if (/\.(tsx?|jsx?)$/.test(name) && /(^|[^.\w])confirm\(/.test(readFileSync(file, "utf8"))) offenders.push(path.relative(root, file));
    }
  };
  walk(path.join(root, "src"));
  expect(offenders).toEqual([]);
});

test("print uses the full page width at A4 landscape (the sidebar column must not remain)", async ({ page }) => {
  await page.setViewportSize({ width: 1123, height: 794 });
  await page.emulateMedia({ media: "print" });
  for (const route of ["/routine", "/workload", "/conflicts"]) {
    await page.goto(route, { waitUntil: "networkidle" });
    const width = await page.evaluate(() => document.querySelector("main")!.getBoundingClientRect().width);
    expect(width, `${route} main width in print`).toBeGreaterThan(1000);
  }
});
