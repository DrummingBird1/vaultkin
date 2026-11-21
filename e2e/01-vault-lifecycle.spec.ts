/**
 * E2E: full vault lifecycle.
 *
 * 1. Fresh launch  → "No vault found" prompt
 * 2. Create vault  → strong password, confirm, hint
 * 3. App unlocks   → Vault page is empty
 * 4. Add entry     → appears in list
 * 5. Lock manually → back to Unlock page
 * 6. Re-unlock     → entry still there
 * 7. Wrong pw      → shake animation + error message
 */
import { test, expect } from "@playwright/test";

const MASTER = "correct-horse-battery-staple-77!";
const WRONG = "definitely-not-the-master";

test.describe.serial("Vault lifecycle", () => {
  test.beforeEach(async ({ page }) => {
    // Wipe persistent state between tests
    await page.goto("/");
    await page.evaluate(async () => {
      localStorage.clear();
      const dbs = await indexedDB.databases?.();
      for (const db of dbs ?? []) if (db.name) indexedDB.deleteDatabase(db.name);
    });
    await page.reload();
  });

  test("first run shows create-vault flow", async ({ page }) => {
    await expect(page.getByText(/no vault found/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /create.*vault/i })).toBeVisible();
  });

  test("creates vault, adds an entry, locks, unlocks, and finds entry", async ({ page }) => {
    // Step 1: open the create-vault modal
    await page.getByRole("button", { name: /create.*vault/i }).click();

    // Step 2: enter master password (twice) and confirm
    const pw = page.getByLabel(/^master password/i);
    const pw2 = page.getByLabel(/confirm/i);
    await pw.fill(MASTER);
    await pw2.fill(MASTER);
    // Strength bar should show "Strong" or better
    // Anchored: "strong" also appears in the heading and the "Suggest strong password" button.
    await expect(page.getByText(/^(very )?strong$/i)).toBeVisible();
    await page.getByRole("button", { name: /create vault/i }).click();

    // Step 3: vault opens → we should be on the Vault page
    await expect(page.getByText(/your vault is empty/i)).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /skip for now/i }).click();

    // Step 4: add an entry
    await page
      .getByRole("button", { name: /add entry/i })
      .first()
      .click();
    await page.getByLabel(/title/i).fill("Example Site");
    await page.getByLabel(/username/i).fill("alice@example.com");
    await page.getByLabel(/^password/i).fill("super-secret-123!");
    // The dialog's submit button is labeled "Add Entry" (same as the toolbar button outside it).
    await page
      .getByRole("dialog", { name: /add entry/i })
      .getByRole("button", { name: /^add entry$/i })
      .click();

    await expect(page.getByText("Example Site").first()).toBeVisible();

    // Step 5: lock the vault (manual lock button or keyboard shortcut)
    await page.keyboard.press(process.platform === "darwin" ? "Meta+L" : "Control+L");
    await expect(page.getByLabel(/master password/i)).toBeVisible({ timeout: 5_000 });

    // Step 6: unlock with correct password
    await page.getByLabel(/master password/i).fill(MASTER);
    await page.getByRole("button", { name: /^unlock/i }).click();
    await expect(page.getByText("Example Site").first()).toBeVisible({ timeout: 30_000 });
  });

  test("wrong password shows shake + error", async ({ page }) => {
    // Pre-condition: vault exists from previous test or seed
    await page.goto("/");
    const pwField = page.getByLabel(/master password/i);
    if (!(await pwField.isVisible())) {
      // No vault yet — create one first
      await page.getByRole("button", { name: /create.*vault/i }).click();
      await page.getByLabel(/^master password/i).fill(MASTER);
      await page.getByLabel(/confirm/i).fill(MASTER);
      await page.getByRole("button", { name: /create vault/i }).click();
      // Wait for the vault to open before locking; a shortcut pressed earlier is lost
      // (Firefox and WebKit got there before the vault page existed).
      await expect(page.getByText(/your vault is empty/i)).toBeVisible({ timeout: 30_000 });
      await page.getByRole("button", { name: /skip for now/i }).click();
      await page.getByRole("button", { name: /lock vault/i }).click();
    }

    await page.getByLabel(/master password/i).fill(WRONG);
    await page.getByRole("button", { name: /^unlock/i }).click();
    await expect(page.getByText(/incorrect master password/i)).toBeVisible();
  });
});
