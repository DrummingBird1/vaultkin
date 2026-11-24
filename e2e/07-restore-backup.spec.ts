/** E2E: an empty device is restored from a QR-text backup and from a file. */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";

const MASTER = "correct-horse-battery-staple-77!";

async function wipe(page: Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    localStorage.clear();
    for (const db of (await indexedDB.databases?.()) ?? [])
      if (db.name) indexedDB.deleteDatabase(db.name);
  });
  await page.reload();
  await expect(page.getByText(/no vault found/i)).toBeVisible();
}

test("restores a backup on an empty device", async ({ page }) => {
  await wipe(page);
  await page.getByRole("button", { name: /create.*vault/i }).click();
  await page.getByLabel(/^master password/i).fill(MASTER);
  await page.getByLabel(/confirm/i).fill(MASTER);
  await page.getByRole("button", { name: /create vault/i }).click();
  await expect(page.getByText(/your vault is empty/i)).toBeVisible({ timeout: 30_000 });
  const payload = await page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const req = indexedDB.open("securevault", 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const get = req.result.transaction("vault").objectStore("vault").get("vault");
          get.onsuccess = () => {
            req.result.close();
            resolve(get.result);
          };
        };
      }),
  );

  for (const kind of ["qr", "file"] as const) {
    await wipe(page);
    await page.getByRole("button", { name: /restore from backup/i }).click();
    if (kind === "qr") {
      const mid = Math.floor(payload.length / 2);
      await page.locator("#backup-text").fill(`SVQR:2/2:${payload.slice(mid)}`);
      await page.getByRole("button", { name: /continue/i }).click();
      await expect(page.getByText(/missing parts: 1/i)).toBeVisible();
      await page
        .locator("#backup-text")
        .fill(`SVQR:2/2:${payload.slice(mid)}\nSVQR:1/2:${payload.slice(0, mid)}`);
    } else {
      const f = test.info().outputPath("backup.svault");
      fs.writeFileSync(f, payload);
      await page.locator("#backup-file").setInputFiles(f);
    }
    await page.getByRole("button", { name: /continue/i }).click();
    await page.getByLabel(/backup password/i).fill("wrong-password");
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(page.getByText(/wrong password/i)).toBeVisible({ timeout: 30_000 });
    await page.getByLabel(/backup password/i).fill(MASTER);
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(page.getByText(/your vault is empty/i)).toBeVisible({ timeout: 30_000 });
  }
});
