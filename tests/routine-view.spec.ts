import { expect, test } from "@playwright/test";

test("public routine keeps URL filters and renders a usable weekly view", async ({ page }) => {
  await page.goto("/public/routine?stream=HSC&view=day&day=0&batch=all");
  await expect(page.getByRole("heading", { name: /Class Routine/ }).first()).toBeVisible();

  await page.getByRole("button", { name: "Week", exact: true }).click();
  await expect(page).toHaveURL(/view=week/);
  await expect(page.getByRole("heading", { name: /Class Routine/ })).toHaveCount(5);
  await expect(page.getByRole("heading", { name: /Saturday/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Friday/ })).toBeVisible();

  const batch = page.getByLabel("Batch");
  const optionValues = await batch.locator("option").evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  const selectedBatch = optionValues.find((value) => value !== "all");
  expect(selectedBatch).toBeTruthy();
  await batch.selectOption(selectedBatch!);
  await expect(page).toHaveURL(new RegExp(`batch=${selectedBatch}`));
  await page.reload();
  await expect(page.getByLabel("Batch")).toHaveValue(selectedBatch!);
});

test("draft and published CSV endpoints agree with selected source semantics", async ({ request }) => {
  const draft = await request.get("/routine/export?stream=HSC&view=week&day=0&batch=all");
  expect(draft.ok()).toBeTruthy();
  expect(draft.headers()["content-type"]).toContain("text/csv");
  expect(draft.headers()["content-disposition"]).toContain("draft.csv");
  const draftBody = await draft.text();
  expect(draftBody.charCodeAt(0)).toBe(0xfeff);
  expect(draftBody).toContain("DRAFT — NOT OFFICIAL");

  const published = await request.get("/public/routine/export?stream=HSC&view=week&day=0&batch=all");
  expect(published.ok()).toBeTruthy();
  expect(published.headers()["content-disposition"]).toMatch(/-v\d+\.csv/);
  expect(await published.text()).toContain("PUBLISHED");

  const invalid = await request.get("/routine/export?stream=UNKNOWN&view=month&day=99&batch=999999");
  expect(invalid.status()).toBe(400);
});

test("weekly routine is responsive and print media hides controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/public/routine?stream=DIPLOMA&view=week&day=6&batch=all");
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflows).toBe(false);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".no-print").first()).toBeHidden();
  await expect(page.locator(".routine-print-day")).toHaveCount(2);
});
