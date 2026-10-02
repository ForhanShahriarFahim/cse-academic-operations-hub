/**
 * TCH-01 (#4) teacher records: add with field errors, edit with the rename
 * warning, on leave, deactivate and undo, delete, and the teacher role's view.
 * Runs against the disposable review server from `npm run ux:review`; every
 * record it adds is synthetic and deleted again.
 */
import { expect, test, type BrowserContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

const sessionFile = path.join(process.cwd(), ".tmp", "ux-review", "session.local.json");

async function signIn(context: BrowserContext, as: "admin" | "teacher") {
  const saved = JSON.parse(readFileSync(sessionFile, "utf8")) as { cookie: string; teacherCookie?: string };
  const value = as === "admin" ? saved.cookie : saved.teacherCookie;
  if (!value) throw new Error("No review session. Restart `npm run ux:review`.");
  await context.addCookies([{ name: "better-auth.session_token", value, domain: "localhost", path: "/", sameSite: "Lax" }]);
}

/** A fresh synthetic code each run, so reruns on the same review database do not collide. */
const code = () => `Q${Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 4).toUpperCase().padEnd(4, "X")}`;

test("add a teacher: every field error at once, focus on the summary, typed values kept", async ({ context, page }) => {
  await signIn(context, "admin");
  await page.goto("/teachers/new", { waitUntil: "networkidle" });
  await page.getByLabel("Short code").fill("aks");
  await page.getByLabel("Full name").fill("Synthetic UX Teacher");
  await page.getByLabel("Email (optional)").fill("ux@example");
  await page.getByLabel("Workload limit (optional)").fill("41");
  await page.getByRole("button", { name: "Add teacher" }).click();

  const summary = page.getByRole("alert").filter({ hasText: "to fix before saving" });
  await expect(summary).toContainText("3 things to fix");
  await expect(summary).toContainText("AKS is already used by");
  await expect(page.getByLabel("Short code")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Full name")).toHaveValue("Synthetic UX Teacher");
  await summary.getByRole("link", { name: /^Email/ }).click();
  await expect(page.getByLabel("Email (optional)")).toBeFocused();
});

test("edit, on leave, deactivate with undo, then delete a synthetic teacher", async ({ context, page }) => {
  await signIn(context, "admin");
  const first = code();
  const second = code();
  await page.goto("/teachers/new", { waitUntil: "networkidle" });
  await page.getByLabel("Short code").fill(first);
  await page.getByLabel("Full name").fill("Synthetic Lifecycle Teacher");
  await page.getByLabel("Workload limit (optional)").fill("12.5");
  await page.getByRole("button", { name: "Add teacher" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Teacher added" })).toBeVisible();

  await page.getByRole("link", { name: "Edit" }).first().click();
  await page.getByLabel("Short code").fill(second);
  await expect(page.getByText(`Changing the code from ${first}.`)).toBeVisible();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Changes saved" })).toBeVisible();

  await page.getByText("More", { exact: true }).click();
  await page.getByRole("button", { name: /Set on leave/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Set on leave" })).toBeVisible();

  await page.getByText("More", { exact: true }).click();
  await page.getByRole("link", { name: /Deactivate/ }).click();
  await expect(page.getByRole("heading", { name: `Deactivate ${second}?` })).toBeVisible();
  await page.getByLabel(/Reason/).fill("Synthetic UX check");
  await page.getByRole("button", { name: `Deactivate ${second}` }).click();
  await expect(page.getByRole("status").filter({ hasText: "Deactivated" })).toBeVisible();
  await page.getByRole("button", { name: "Undo — reactivate" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Active again" })).toBeVisible();

  const changes = page.locator("section").filter({ hasText: "Who changed this record" });
  for (const entry of ["Reactivated", "Deactivated", "Set on leave", "Edited", "Added"]) await expect(changes).toContainText(entry);
  await expect(changes).toContainText("Synthetic UX check");

  await page.getByText("More", { exact: true }).click();
  await page.getByRole("link", { name: /Delete/ }).click();
  await page.getByLabel(/Type the short code/).fill(second.toLowerCase());
  await page.getByRole("button", { name: `Delete ${second} permanently` }).click();
  await expect(page.getByRole("status").filter({ hasText: `${second} deleted` })).toBeVisible();
});

test("a used teacher cannot be deleted, and deactivation lists the work to reassign", async ({ context, page }) => {
  await signIn(context, "admin");
  await page.goto("/teachers/1/delete", { waitUntil: "networkidle" });
  await expect(page.getByRole("alert").filter({ hasText: "can’t be deleted" })).toBeVisible();
  await page.goto("/teachers/1/deactivate", { waitUntil: "networkidle" });
  await expect(page.getByText("in the working routine")).toBeVisible();
  await expect(page.getByRole("button", { name: "Deactivate", exact: true })).toBeDisabled();
});

test("the teacher role sees no edit controls and no Changes, and cannot open the editor", async ({ context, page }) => {
  await signIn(context, "teacher");
  await page.goto("/teachers", { waitUntil: "networkidle" });
  await expect(page.getByRole("link", { name: "Add teacher" })).toHaveCount(0);
  await page.goto("/teachers/1", { waitUntil: "networkidle" });
  await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0);
  await expect(page.getByText("Who changed this record")).toHaveCount(0);
  await expect(page.getByText("Private phone")).toHaveCount(0);
  await page.goto("/teachers/1/edit", { waitUntil: "networkidle" });
  await expect(page).toHaveURL(/\/forbidden/);
});
