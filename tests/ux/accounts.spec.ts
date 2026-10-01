/**
 * AUTH-02 (#36): account flows in the browser against the disposable review server
 * (`npm run ux:review`). Each run creates its own synthetic accounts in that copy.
 * Covers the browser side of AC-01, AC-02, AC-04, AC-07, AC-08, AC-09, AC-14 and AC-18.
 * Password sign-in is throttled to 10 tries a minute per client, so this file stays under that.
 */
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

const sessionFile = path.join(process.cwd(), ".tmp", "ux-review", "session.local.json");
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const REFUSED = "Email or password not accepted. After 5 failed tries, wait 15 minutes.";
const LINK_GONE = "This link can no longer be used. Ask the portal administrator for a new one.";
const PASSWORD = "river otter lantern 7";

async function asAdmin(browser: Browser): Promise<BrowserContext> {
  const { cookie } = JSON.parse(readFileSync(sessionFile, "utf8")) as { cookie: string };
  const context = await browser.newContext();
  await context.addCookies([{ name: "better-auth.session_token", value: cookie, domain: "localhost", path: "/", sameSite: "Lax" }]);
  return context;
}

async function axe(page: Page) {
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async () => {
    const result = await (window as unknown as { axe: { run: (context: Document, options: object) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } })
      .axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] });
    return result.violations.map((violation) => `${violation.id} (${violation.nodes.length}): ${violation.nodes[0]?.target.join(" ")}`);
  });
}

/** Creates an account through the form and returns its page URL and the one-time link. */
async function createAccount(page: Page, name: string, email: string, role = "Read-only viewer") {
  await page.goto("/access/new", { waitUntil: "networkidle" });
  await page.getByLabel("Full name").fill(name);
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByLabel("First role").selectOption({ label: role });
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("status").filter({ hasText: `Account created for ${name}.` })).toBeVisible();
  const link = (await page.getByLabel("Setup link", { exact: true }).textContent())!.trim();
  expect(link).toMatch(/^http:\/\/localhost:3100\/set-password#t=[A-Za-z0-9_-]{43}$/);
  const accountUrl = await page.getByRole("link", { name: "Open the account" }).getAttribute("href");
  return { link, accountUrl: accountUrl! };
}

const unique = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

test.beforeAll(async ({ request }) => {
  const health = await request.get("/api/health").catch(() => null);
  if (!health?.ok()) throw new Error("Review server is not running on :3100. Start it with `npm run ux:review`.");
});

test("setup link: rules at the field, one use, then password sign-in and sign-out (AC-01, AC-02, AC-04, AC-07)", async ({ browser }) => {
  const admin = await asAdmin(browser);
  const id = unique();
  const email = `flow-${id}@example.test`;
  const { link } = await createAccount(await admin.newPage(), `Flow Person ${id}`, email);

  const person = await browser.newContext();
  const page = await person.newPage();
  await page.goto(link, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Choose your password" })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
  expect(page.url(), "the token leaves the address bar").not.toContain("#t=");

  await page.getByLabel("New password", { exact: true }).fill("too short");
  await page.getByLabel("Type it again", { exact: true }).fill("too short");
  await page.getByRole("button", { name: "Save password and sign in" }).click();
  await expect(page.getByText("Use at least 12 characters. This one has 9.")).toBeVisible();
  await expect(page.getByLabel("New password", { exact: true })).toHaveAttribute("aria-invalid", "true");

  await page.getByLabel("New password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Type it again", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Save password and sign in" }).click();
  await page.waitForURL("http://localhost:3100/");
  await expect(page.getByRole("button", { name: "Sign out" }).first()).toBeAttached();

  const again = await (await browser.newContext()).newPage();
  await again.goto(link, { waitUntil: "networkidle" });
  await expect(again.getByRole("alert").filter({ hasText: LINK_GONE })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).first().click();
  await page.waitForURL(/\/login/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("not the password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: REFUSED })).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("http://localhost:3100/");
  await admin.close();
});

test("an unknown link and a page without a link explain themselves (AC-02)", async ({ page }) => {
  await page.goto("/set-password#t=" + "A".repeat(43), { waitUntil: "networkidle" });
  await expect(page.getByRole("alert").filter({ hasText: LINK_GONE })).toBeVisible();
  await page.goto("/set-password", { waitUntil: "networkidle" });
  await expect(page.getByText("This page needs the link your administrator sent you.")).toBeVisible();
});

test("administrator actions confirm, then report in place (AC-09, AC-11, AC-14)", async ({ browser }) => {
  const admin = await asAdmin(browser);
  const page = await admin.newPage();
  const id = unique();
  const name = `Action Person ${id}`;
  const { accountUrl } = await createAccount(page, name, `action-${id}@example.test`);
  await page.goto(accountUrl, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();

  // A new setup link replaces the waiting one, after a confirmation that names the person.
  await page.getByRole("button", { name: "Issue a new setup link…" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(`Issue a new setup link for ${name}?`);
  await dialog.getByRole("button", { name: "Issue link" }).click();
  await expect(page.getByLabel("Setup link", { exact: true })).toContainText("/set-password#t=");
  await page.getByRole("button", { name: "Revoke the open link" }).click();
  await expect(page.getByRole("status").filter({ hasText: "no longer works" })).toBeVisible();

  // Suspend: cancel first changes nothing; confirming suspends and says so.
  await page.getByRole("button", { name: "Suspend account…" }).click();
  await expect(dialog).toContainText(`Suspend ${name}?`);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Suspend account…" })).toBeVisible();
  await page.getByRole("button", { name: "Suspend account…" }).click();
  await dialog.getByRole("button", { name: "Suspend" }).click();
  await expect(page.getByRole("status").filter({ hasText: `${name} is suspended` })).toBeVisible();
  await page.getByRole("button", { name: "Reactivate" }).click();
  await expect(page.getByRole("status").filter({ hasText: `${name} is active again.` })).toBeVisible();

  // A role scheduled for a later date shows as scheduled, and can be cancelled.
  const later = new Date(Date.now() + 10 * 86_400_000 + 6 * 3_600_000).toISOString().slice(0, 10);
  await page.getByLabel("Add a role").selectOption({ label: "Routine coordinator" });
  await page.getByLabel("Starts").fill(later);
  await page.getByRole("button", { name: "Add role" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Routine coordinator scheduled" })).toBeVisible();
  await expect(page.getByText(/From .*, also/)).toBeVisible();
  await page.getByRole("button", { name: `Cancel the scheduled Routine coordinator role for ${name}` }).click();
  await dialog.getByRole("button", { name: "Cancel role" }).click();
  await expect(page.getByRole("status").filter({ hasText: "is cancelled" })).toBeVisible();

  // Turning off the only method is refused with a reason.
  await page.getByRole("switch", { name: `Password sign-in for ${name}` }).click();
  await dialog.getByRole("button", { name: "Turn off Password" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Keep at least one sign-in method on" })).toBeVisible();
  await admin.close();
});

test("five wrong passwords lock sign-in; the administrator sees and clears the lock (AC-08)", async ({ browser }) => {
  const admin = await asAdmin(browser);
  const adminPage = await admin.newPage();
  const id = unique();
  const email = `lock-${id}@example.test`;
  const { link, accountUrl } = await createAccount(adminPage, `Lock Person ${id}`, email);
  const person = await (await browser.newContext()).newPage();
  await person.goto(link, { waitUntil: "networkidle" });
  await person.getByLabel("New password", { exact: true }).fill(PASSWORD);
  await person.getByLabel("Type it again", { exact: true }).fill(PASSWORD);
  await person.getByRole("button", { name: "Save password and sign in" }).click();
  await person.waitForURL("http://localhost:3100/");

  const login = await (await browser.newContext()).newPage();
  await login.goto("/login", { waitUntil: "networkidle" });
  for (let attempt = 0; attempt < 5; attempt++) {
    await login.getByLabel("Email").fill(email);
    await login.getByLabel("Password", { exact: true }).fill(`wrong password ${attempt}`);
    // Wait for this attempt's response: the refusal text from the previous one is still on screen.
    await Promise.all([
      login.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/login"),
      login.getByRole("button", { name: "Sign in", exact: true }).click(),
    ]);
    await expect(login.getByRole("alert").filter({ hasText: REFUSED })).toBeVisible();
    // React resets the form when the action settles; typing before that loses the next attempt's input.
    await expect(login.getByLabel("Password", { exact: true })).toHaveValue("");
  }
  await adminPage.goto(accountUrl, { waitUntil: "networkidle" });
  await expect(adminPage.getByText(/Password sign-in is locked until/)).toBeVisible();
  await expect(adminPage.getByText("Password sign-in locked after 5 failed tries")).toBeVisible();
  await adminPage.getByRole("button", { name: "Clear lock" }).click();
  await expect(adminPage.getByRole("status").filter({ hasText: "can try a password again now" })).toBeVisible();
  await admin.close();
});

test("changing my password keeps this device and signs out the others (AC-09)", async ({ browser }) => {
  const admin = await asAdmin(browser);
  const id = unique();
  const email = `self-${id}@example.test`;
  const { link } = await createAccount(await admin.newPage(), `Self Person ${id}`, email);
  const laptop = await (await browser.newContext()).newPage();
  await laptop.goto(link, { waitUntil: "networkidle" });
  await laptop.getByLabel("New password", { exact: true }).fill(PASSWORD);
  await laptop.getByLabel("Type it again", { exact: true }).fill(PASSWORD);
  await laptop.getByRole("button", { name: "Save password and sign in" }).click();
  await laptop.waitForURL("http://localhost:3100/");

  const phone = await (await browser.newContext()).newPage();
  await phone.goto("/login", { waitUntil: "networkidle" });
  await phone.getByLabel("Email").fill(email);
  await phone.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await phone.getByRole("button", { name: "Sign in", exact: true }).click();
  await phone.waitForURL("http://localhost:3100/");

  await laptop.goto("/account", { waitUntil: "networkidle" });
  await expect(laptop.getByText("1 other besides this one")).toBeVisible();
  await laptop.getByLabel("Current password", { exact: true }).fill("not my password");
  await laptop.getByLabel("New password", { exact: true }).fill("a brand new long phrase");
  await laptop.getByLabel("Type the new password again", { exact: true }).fill("a brand new long phrase");
  await laptop.getByRole("button", { name: "Change password" }).click();
  await expect(laptop.getByText("Your current password is not correct.")).toBeVisible();
  await laptop.getByLabel("Current password", { exact: true }).fill(PASSWORD);
  await laptop.getByLabel("New password", { exact: true }).fill("a brand new long phrase");
  await laptop.getByLabel("Type the new password again", { exact: true }).fill("a brand new long phrase");
  await laptop.getByRole("button", { name: "Change password" }).click();
  await expect(laptop.getByRole("status").filter({ hasText: "1 other device was signed out" })).toBeVisible();

  await phone.goto("/account");
  await expect(phone).toHaveURL(/\/login/);
  await laptop.goto("/account", { waitUntil: "networkidle" });
  await expect(laptop.getByText("Only this device")).toBeVisible();
  await admin.close();
});

test("keyboard: sign-in order, and confirmations focus Cancel and return focus (AC-18)", async ({ browser, page }) => {
  await page.goto("/login", { waitUntil: "networkidle" });
  const order: string[] = [];
  for (let step = 0; step < 6; step++) {
    await page.keyboard.press("Tab");
    order.push(await page.evaluate(() => {
      const element = document.activeElement as HTMLInputElement;
      return element.getAttribute("aria-label") ?? (element.labels?.[0]?.textContent ?? element.textContent ?? "").trim();
    }));
  }
  expect(order).toEqual(["Skip to content", "View the published routine", "Email", "Password", "Show password", "Sign in"]);

  const admin = await asAdmin(browser);
  const adminPage = await admin.newPage();
  const id = unique();
  const { accountUrl } = await createAccount(adminPage, `Keys Person ${id}`, `keys-${id}@example.test`);
  await adminPage.goto(accountUrl, { waitUntil: "networkidle" });
  const suspend = adminPage.getByRole("button", { name: "Suspend account…" });
  await suspend.focus();
  await adminPage.keyboard.press("Enter");
  const dialog = adminPage.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await adminPage.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(suspend).toBeFocused();
  await admin.close();
});

test("account screens: no axe violations and no page-wide overflow (AC-14, AC-18)", async ({ browser }) => {
  const admin = await asAdmin(browser);
  const page = await admin.newPage();
  await page.goto("/access", { waitUntil: "networkidle" });
  const person = await page.getByRole("link", { name: /^UX Teacher/ }).first().getAttribute("href");
  const anonymous = await (await browser.newContext()).newPage();
  for (const viewport of [{ width: 1366, height: 850 }, { width: 390, height: 844 }]) {
    for (const [target, route] of [[page, "/access"], [page, "/access/new"], [page, person!], [page, "/account"], [anonymous, "/login"], [anonymous, "/set-password"]] as const) {
      await target.setViewportSize(viewport);
      await target.goto(route, { waitUntil: "networkidle" });
      expect(await axe(target), `${route} at ${viewport.width}px`).toEqual([]);
      const overflow = await target.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${route} at ${viewport.width}px`).toBe(0);
    }
  }
  await admin.close();
});
