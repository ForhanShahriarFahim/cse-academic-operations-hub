/**
 * BUG-32: the public viewer offers no dead-end actions while nothing is published.
 * Runs anonymously against the disposable review server (`npm run ux:review`):
 * `--fresh` has no publication, `--fresh --publishable` has one.
 */
import { expect, test } from "@playwright/test";

const actions = ["Official package", "Print / PDF", "CSV"];

for (const viewport of [{ width: 1366, height: 850 }, { width: 390, height: 844 }]) {
  test(`public viewer controls match the publication state at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/public/routine", { waitUntil: "networkidle" });
    const unpublished = await page.getByRole("heading", { name: "No published routine" }).isVisible();
    const controls = page.getByLabel("Routine view controls");
    if (unpublished) {
      await expect(page.getByText("once it has been reviewed and approved", { exact: false })).toBeVisible();
      await expect(controls).toHaveCount(0);
      for (const name of actions) await expect(page.getByText(name, { exact: true })).toHaveCount(0);
      await expect(page.getByRole("group", { name: "Stream" })).toHaveCount(0);
      await expect(page.getByLabel("Batch")).toHaveCount(0);
    } else {
      await expect(controls).toBeVisible();
      for (const name of actions) await expect(controls.getByText(name, { exact: true })).toBeVisible();
      await expect(page.getByRole("group", { name: "Stream" })).toBeVisible();
    }
  });
}

test("the public official package explains an empty state to visitors", async ({ page }) => {
  await page.goto("/public/routine/official", { waitUntil: "networkidle" });
  if (await page.getByRole("heading", { name: "No published routine" }).isVisible()) {
    await expect(page.getByText("once it has been reviewed and approved", { exact: false })).toBeVisible();
    await expect(page.getByText("Publish a validated routine", { exact: false })).toHaveCount(0);
    await page.getByRole("link", { name: "Back to viewer" }).click();
    await expect(page).toHaveURL(/\/public\/routine$/);
  } else {
    await expect(page.getByRole("heading", { name: "Official routine package" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to viewer" })).toBeVisible();
  }
});
