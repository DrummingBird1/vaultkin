/**
 * Secure sharing round trip: share an entry (file + separate code), open it
 * again with the code, add it to the vault. A wrong code is refused.
 */
import { test, expect } from "@playwright/test";
import fs from "fs";

const MASTER = "correct-horse-battery-staple-77!";

test("share an entry as file + code, then open it", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    localStorage.clear();
    for (const db of (await indexedDB.databases?.()) ?? [])
      if (db.name) indexedDB.deleteDatabase(db.name);
  });
  await page.reload();
  await page.getByRole("button", { name: /create.*vault/i }).click();
  await page.getByLabel(/^master password/i).fill(MASTER);
  await page.getByLabel(/confirm/i).fill(MASTER);
  await page.getByRole("button", { name: /create vault/i }).click();
  await expect(page.getByText(/your vault is empty/i)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /skip for now/i }).click();

  await page
    .getByRole("button", { name: /add entry/i })
    .first()
    .click();
  await page.getByLabel(/title/i).fill("Home Wi-Fi");
  await page.getByLabel(/username/i).fill("guest");
  await page.getByLabel(/^password/i).fill("wifi-pass-987");
  await page
    .getByRole("dialog", { name: /add entry/i })
    .getByRole("button", { name: /^add entry$/i })
    .click();
  await page.getByText("Home Wi-Fi").first().click();

  await page.getByRole("button", { name: /^share$/i }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /create share file/i }).click();
  const d = await download;
  // WebKit replaces spaces in download names with underscores.
  expect(d.suggestedFilename()).toMatch(/^Home[ _]Wi-Fi\.svshare$/);
  const filePath = await d.path();
  const file = fs.readFileSync(filePath, "utf8");
  expect(file).not.toMatch(/wifi-pass|guest|Home Wi-Fi/);
  const code = (await page.getByTestId("share-code").textContent())!.trim();
  expect(code).toMatch(/^svk1-/);
  await page.getByRole("button", { name: /^done$/i }).click();

  await page.getByRole("button", { name: /open shared item/i }).click();
  await page.getByLabel(/share file/i).setInputFiles(filePath);
  await page.getByLabel(/^code$/i).fill("svk1-" + "A".repeat(43));
  await page.getByRole("button", { name: /^open$/i }).click();
  await expect(page.getByText(/wrong code/i)).toBeVisible();
  await page.getByLabel(/^code$/i).fill(code);
  await page.getByRole("button", { name: /^open$/i }).click();
  const before = await page.getByText("Home Wi-Fi", { exact: true }).count();
  await page.getByRole("button", { name: /add to my vault/i }).click();
  await expect(page.getByText(/added to your vault/i)).toBeVisible();
  // A second entry with the same title now exists.
  await expect
    .poll(() => page.getByText("Home Wi-Fi", { exact: true }).count())
    .toBeGreaterThan(before);
});
