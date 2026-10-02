import { expect, test } from "@playwright/test";

test("public routine is anonymous and never substitutes a draft", async ({ page }) => {
  await page.goto("/public/routine?stream=HSC&view=day&day=0&batch=all");
  await expect(page.getByText("Official Class Routine")).toBeVisible();
  const unpublished = page.getByRole("heading", { name: "No published routine" });
  const controls = page.getByLabel("Routine view controls");
  if (await unpublished.isVisible()) {
    await expect(page.getByText("once it has been reviewed and approved", { exact: false })).toBeVisible();
    await expect(page.getByText("Draft schedules are never shown here.", { exact: false })).toBeVisible();
    // BUG-32: nothing to print, export or filter, so no dead-end controls.
    await expect(controls).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Print / PDF" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "CSV" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Official package" })).toHaveCount(0);
  } else {
    await expect(controls).toBeVisible();
    await expect(page.getByRole("button", { name: "Print / PDF" })).toBeVisible();
    await expect(page.getByRole("link", { name: "CSV" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Official package" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Class Routine/ }).first()).toBeVisible();
    await page.getByRole("button", { name: "Week", exact: true }).click();
    await expect(page).toHaveURL(/view=week/);
  }
});

test("internal draft export requires sign-in; public export requires a publication", async ({ request }) => {
  const draft = await request.get("/routine/export?stream=HSC&view=week&day=0&batch=all");
  expect(draft.status()).toBe(401);

  const published = await request.get("/public/routine/export?stream=HSC&view=week&day=0&batch=all");
  if (published.status() === 404) {
    expect(await published.json()).toEqual({ error: "No published routine." });
  } else {
    expect(published.ok()).toBeTruthy();
    expect(published.headers()["content-disposition"]).toMatch(/-v\d+\.csv/);
    expect(await published.text()).toContain("PUBLISHED");
  }

  const invalid = await request.get("/routine/export?stream=UNKNOWN&view=month&day=99&batch=999999");
  expect(invalid.status()).toBe(401);
});

test("uninvited visitors reach sign-in, while public routine remains responsive", async ({ page }) => {
  await page.goto("/attendance");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: /Sign in/i })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/public/routine?stream=DIPLOMA&view=week&day=6&batch=all");
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflows).toBe(false);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".no-print").first()).toBeHidden();
  if (await page.getByRole("heading", { name: "No published routine" }).isVisible()) {
    await expect(page.locator(".routine-print-day")).toHaveCount(0);
  } else {
    await expect(page.locator(".routine-print-day")).toHaveCount(2);
  }
});
