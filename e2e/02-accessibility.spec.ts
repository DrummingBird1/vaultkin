/**
 * E2E: automated accessibility (axe-core, WCAG 2.2 A/AA rules) on every page,
 * in English and in Hebrew (RTL), plus the main dialogs and the command palette.
 * Fails on any violation of serious or critical impact.
 */
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const MASTER = "correct-horse-battery-staple-77!";

async function audit(page: Page, label: string) {
  // Let entry animations finish so contrast is measured on final colors.
  // A fixed delay was not enough on slow CI WebKit (axe caught a dialog
  // mid-fade), so wait for every running animation to actually end.
  await page.waitForTimeout(100);
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    ),
  );
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  const summary = serious.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.nodes.length} × ${v.nodes[0]?.target.join(" ")} — ${v.nodes[0]?.any[0]?.message ?? ""}`,
  );
  expect(summary, `${label}: axe violations`).toEqual([]);
}

async function freshVault(page: Page, lang: "en" | "he") {
  await page.goto("/");
  await page.evaluate(async (l) => {
    localStorage.clear();
    localStorage.setItem("sv_language", l);
    for (const db of (await indexedDB.databases?.()) ?? [])
      if (db.name) indexedDB.deleteDatabase(db.name);
  }, lang);
  await page.reload();
}

for (const lang of ["en", "he"] as const) {
  test.describe.serial(`accessibility (${lang})`, () => {
    test("unlock and create-vault screens", async ({ page }) => {
      await freshVault(page, lang);
      await expect(page.locator("html")).toHaveAttribute("dir", lang === "he" ? "rtl" : "ltr");
      await audit(page, "first run");
      await page
        .locator("main button, button")
        .filter({ hasText: /create|יצירת|צור/i })
        .first()
        .click();
      await audit(page, "create vault dialog");
    });

    test("every page, the add-entry dialog and the command palette", async ({ page }) => {
      // Any uncaught page error (e.g. a render loop) fails the test.
      const pageErrors: string[] = [];
      page.on("pageerror", (e) => pageErrors.push(e.message));
      await freshVault(page, lang);
      await page
        .locator("button")
        .filter({ hasText: /create|יצירת|צור/i })
        .first()
        .click();
      const pw = page.locator('[role="dialog"] input[type="password"]');
      await pw.nth(0).fill(MASTER);
      await pw.nth(1).fill(MASTER);
      await page.locator('[role="dialog"] button').last().click();
      await expect(page.locator("main")).toBeVisible({ timeout: 30_000 });

      // First-run guide: audit each step, then finish it.
      const guide = page.getByRole("dialog");
      await expect(guide).toBeVisible();
      for (let i = 0; i < 3; i++) {
        await audit(page, `onboarding step ${i + 1}`);
        await guide.locator("button").last().click();
      }
      await expect(guide).toHaveCount(0);

      for (const p of ["vault", "authenticator", "generator", "health", "settings"]) {
        await page.evaluate((h) => (location.hash = h), `#/${p}`);
        await audit(page, `page ${p}`);
      }

      await page.evaluate(() => (location.hash = "#/vault"));
      await page.keyboard.press("Control+N");
      await expect(page.getByRole("dialog")).toBeVisible();
      await audit(page, "add entry dialog");
      await page.keyboard.press("Escape");

      await page.keyboard.press("Control+K");
      await expect(page.getByRole("combobox")).toBeVisible();
      await audit(page, "command palette");
      expect(pageErrors).toEqual([]);
    });
  });
}
