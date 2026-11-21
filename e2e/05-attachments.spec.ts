/**
 * Attachments: add a file to an entry, check that only ciphertext is stored,
 * save a decrypted copy, then remove it.
 */
import { test, expect } from "@playwright/test";
import fs from "fs";

const MASTER = "correct-horse-battery-staple-77!";
const SECRET_TEXT = "TOP-SECRET recovery codes 1234-5678";

test("attach, store encrypted, save back, remove", async ({ page }) => {
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
  await page.getByLabel(/title/i).fill("Bank");
  await page
    .getByRole("dialog", { name: /add entry/i })
    .getByRole("button", { name: /^add entry$/i })
    .click();
  await page.getByText("Bank").first().click();

  await page.getByLabel(/^add file$/i).setInputFiles({
    name: "codes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(SECRET_TEXT),
  });
  await expect(page.getByText("codes.txt")).toBeVisible();

  // Only ciphertext in IndexedDB.
  const stored = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const req = indexedDB.open("securevault-attachments");
        req.onsuccess = () => {
          const all = req.result.transaction("blobs").objectStore("blobs").getAll();
          all.onsuccess = () =>
            resolve(all.result.map((b: Uint8Array) => new TextDecoder().decode(b)).join("|"));
        };
      }),
  );
  expect(stored.length).toBeGreaterThan(0);
  expect(stored).not.toContain("TOP-SECRET");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /^save codes\.txt$/i }).click();
  const file = await (await download).path();
  expect(fs.readFileSync(file, "utf8")).toBe(SECRET_TEXT);

  await page.getByRole("button", { name: /^remove codes\.txt$/i }).click();
  await expect(page.getByText("codes.txt")).toHaveCount(0);
});
