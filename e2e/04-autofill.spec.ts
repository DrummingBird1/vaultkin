/**
 * The extension content script (built dist/extension/src/content.js) in real
 * Chromium pages, with chrome.* stubbed to play the background worker.
 * The overlay is a CLOSED shadow root, so the test drives it like a user:
 * keyboard (Alt+↓, Enter) and real mouse clicks at positions found through the
 * DevTools protocol (which can see inside closed shadow roots).
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const CONTENT = path.resolve(__dirname, "..", "dist", "extension", "src", "content.js");
const SITE = "https://github.com";

test.beforeAll(() => {
  if (!fs.existsSync(CONTENT))
    execSync("node scripts/build-extension.mjs", { cwd: path.resolve(__dirname, "..") });
});

type Reply = Record<string, unknown> | null;

/** Stub chrome.runtime/i18n; `replies` maps message type → response. Sent messages are recorded. */
async function setup(page: Page, html: string, replies: Record<string, Reply>) {
  await page.route(`${SITE}/**`, (r) => r.fulfill({ contentType: "text/html", body: html }));
  await page.addInitScript((rep) => {
    const sent: unknown[] = [];
    (window as unknown as { __sent: unknown[] }).__sent = sent;
    (window as unknown as { chrome: unknown }).chrome = {
      i18n: {
        getMessage: (k: string, s?: string | string[]) => (s ? `${k}:${[s].flat().join(",")}` : k),
        getUILanguage: () => "en",
      },
      runtime: {
        lastError: undefined,
        sendMessage: (msg: { type: string }, cb?: (r: unknown) => void) => {
          sent.push(msg);
          const r = (rep as Record<string, unknown>)[msg.type] ?? null;
          if (cb) setTimeout(() => cb(r), 0);
          return Promise.resolve(r);
        },
        onMessage: { addListener: () => {} },
      },
    };
  }, replies);
  await page.addInitScript({ path: CONTENT });
  await page.goto(`${SITE}/login`);
}

/** Click the centre of the n-th element inside the closed shadow root whose class contains `cls`. */
async function clickInOverlay(page: Page, cls: string, n = 0) {
  const cdp = await page.context().newCDPSession(page);
  const { root } = await cdp.send("DOM.getDocument", { depth: -1, pierce: true });
  const found: number[] = [];
  const walk = (node: {
    nodeId: number;
    attributes?: string[];
    children?: unknown[];
    shadowRoots?: unknown[];
  }) => {
    const attrs = node.attributes ?? [];
    const i = attrs.indexOf("class");
    if (i >= 0 && attrs[i + 1].split(" ").includes(cls)) found.push(node.nodeId);
    for (const c of [...(node.children ?? []), ...(node.shadowRoots ?? [])]) walk(c as typeof node);
  };
  walk(root as never);
  const { model } = await cdp.send("DOM.getBoxModel", { nodeId: found[n] });
  const [x1, y1, , , x3, y3] = model.content;
  await page.mouse.click((x1 + x3) / 2, (y1 + y3) / 2);
}

const FORM = `<!doctype html><form id="f" action="/session" onsubmit="event.preventDefault()">
  <div id="wrap"><input id="u" name="login" autocomplete="username"></div>
  <input id="p" type="password" name="password">
  <button id="go">Sign in</button></form>`;

const github = {
  id: "1",
  title: "GitHub",
  url: "https://github.com",
  username: "octo",
  password: "pw-1",
  hasTotp: true,
  exactHost: true,
};

test("fills username and password from the inline menu without restructuring the page", async ({
  page,
}) => {
  await setup(page, FORM, {
    SV_FIND_FOR_URL: { matches: [github], unlocked: true, state: "ready", crossSite: null },
  });
  await page.focus("#p");
  await page.keyboard.press("Alt+ArrowDown");
  await page.waitForTimeout(100);
  await page.keyboard.press("Enter");
  await expect(page.locator("#u")).toHaveValue("octo");
  await expect(page.locator("#p")).toHaveValue("pw-1");
  // The page's own DOM is untouched: no wrapper around the inputs.
  expect(await page.evaluate(() => document.getElementById("p")!.parentElement!.id)).toBe("f");
  expect(await page.evaluate(() => document.getElementById("u")!.parentElement!.id)).toBe("wrap");
  // The lookup didn't send a URL: the background uses the browser-reported one.
  const find = (
    await page.evaluate(
      () => (window as unknown as { __sent: Array<Record<string, unknown>> }).__sent,
    )
  ).find((m) => m.type === "SV_FIND_FOR_URL");
  expect(find).toEqual({ type: "SV_FIND_FOR_URL" });
});

test("a login saved for another host needs a second, explicit click", async ({ page }) => {
  const gist = { ...github, url: "https://gist.github.com", exactHost: false };
  await setup(page, FORM, {
    SV_FIND_FOR_URL: { matches: [gist], unlocked: true, state: "ready", crossSite: null },
  });
  await page.focus("#p");
  await page.keyboard.press("Alt+ArrowDown");
  await page.waitForTimeout(100);
  await clickInOverlay(page, "item");
  await expect(page.locator("#p")).toHaveValue(""); // first click only arms it
  await clickInOverlay(page, "item");
  await expect(page.locator("#p")).toHaveValue("pw-1");
});

test("one-time-code fields get the current code", async ({ page }) => {
  await setup(
    page,
    `<!doctype html><input id="otp" autocomplete="one-time-code" inputmode="numeric" maxlength="6">`,
    {
      SV_FIND_FOR_URL: { matches: [github], unlocked: true, state: "ready", crossSite: null },
      SV_DESKTOP_TOTP: { code: "123456", remaining: 20 },
    },
  );
  await page.focus("#otp");
  await page.keyboard.press("Alt+ArrowDown");
  await page.waitForTimeout(100);
  await page.keyboard.press("Enter");
  await expect(page.locator("#otp")).toHaveValue("123456");
});

test("submitting a login is captured and offered for saving; only a trusted click saves", async ({
  page,
}) => {
  await setup(page, FORM, {
    SV_PENDING_CAPTURE: { status: "new", username: "octo", site: "github.com" },
    SV_SAVE_LOGIN: { ok: true },
    SV_CAPTURE: { ok: true },
  });
  await page.fill("#u", "octo");
  await page.fill("#p", "brand-new-pw");
  await page.click("#go");
  await page.waitForTimeout(1800);
  const sent = () =>
    page.evaluate(() =>
      (window as unknown as { __sent: Array<Record<string, unknown>> }).__sent.map((m) => m.type),
    );
  expect(await sent()).toContain("SV_CAPTURE");
  const cap = (
    await page.evaluate(
      () => (window as unknown as { __sent: Array<Record<string, unknown>> }).__sent,
    )
  ).find((m) => m.type === "SV_CAPTURE");
  expect(cap).toMatchObject({ username: "octo", password: "brand-new-pw" });

  // A page script can't press the banner's button (closed shadow + isTrusted).
  expect(await sent()).not.toContain("SV_SAVE_LOGIN");
  await clickInOverlay(page, "primary");
  await page.waitForTimeout(100);
  expect(await sent()).toContain("SV_SAVE_LOGIN");
});

test("locked and not-connected states explain themselves instead of failing silently", async ({
  page,
}) => {
  await setup(page, FORM, { SV_FIND_FOR_URL: { matches: [], unlocked: false, state: "locked" } });
  await page.focus("#p");
  await page.keyboard.press("Alt+ArrowDown");
  await page.waitForTimeout(150);
  const cdp = await page.context().newCDPSession(page);
  const { root } = await cdp.send("DOM.getDocument", { depth: -1, pierce: true });
  expect(JSON.stringify(root)).toContain('"locked"'); // i18n key rendered as text by the stub
  await expect(page.locator("#p")).toHaveValue("");
});
