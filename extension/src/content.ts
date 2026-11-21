/**
 * Vaultkin — content script (isolated world), runs in every frame.
 *
 *  - Inline menu: when a login field (username, password, one-time code) has
 *    focus, a small Vaultkin button appears at its inline end. It and the
 *    menu live in ONE closed shadow root attached to <html>, positioned over
 *    the page — the page's own DOM is never restructured (the old version
 *    wrapped every password input in a <span>, which broke some layouts).
 *  - Fill: logins come from the background (desktop app over the encrypted
 *    bridge). The background decides which site this frame is from using the
 *    browser-reported frame URL; this script never sends a URL of its own.
 *  - Safeguards: a login saved for a different host, or a form in a frame
 *    from another site than the page, needs a second, explicit click.
 *  - Save / update: after a login form is submitted, the background asks the
 *    app whether the login is new or changed and this script shows a small
 *    banner. The vault changes only after a trusted click on that banner.
 */
(() => {
  const w = window as unknown as { __svContent?: boolean };
  if (w.__svContent) return;
  w.__svContent = true;

  const t = (key: string, subs?: string | string[]) => chrome.i18n.getMessage(key, subs) || key;
  const isRtl = () => chrome.i18n.getUILanguage().startsWith("he");

  interface Match {
    id: string;
    title: string;
    url?: string;
    username?: string;
    password?: string;
    hasTotp: boolean;
    exactHost: boolean;
  }
  interface FindResponse {
    matches?: Match[];
    unlocked?: boolean;
    state?: string;
    crossSite?: { frameHost: string; topHost: string } | null;
  }

  // ── Field classification ───────────────────────────────────────────────
  const OTP_RE = /(one.?time|otp|totp|2fa|mfa|verification.?code|auth.?code|security.?code|token)/i;
  const USER_RE = /(user|login|email|e-mail|account|identifier)/i;
  type Kind = "password" | "username" | "otp";

  function visible(el: HTMLElement): boolean {
    const r = el.getBoundingClientRect();
    return r.width > 20 && r.height > 10 && getComputedStyle(el).visibility !== "hidden";
  }

  function kindOf(el: Element | null): Kind | null {
    if (!(el instanceof HTMLInputElement) || el.disabled || el.readOnly) return null;
    const type = el.type.toLowerCase();
    const hint = `${el.name} ${el.id} ${el.getAttribute("aria-label") ?? ""} ${el.placeholder}`;
    const ac = (el.autocomplete || "").toLowerCase();
    if (type === "password") return "password";
    if (
      ac === "one-time-code" ||
      (OTP_RE.test(hint) && (el.maxLength <= 8 || el.inputMode === "numeric"))
    )
      return "otp";
    if (
      ["text", "email", "tel", ""].includes(type) &&
      (ac === "username" || ac === "email" || USER_RE.test(hint))
    ) {
      // Only a username if there's a password field near it (or this is a
      // username-first step whose form has a submit button).
      const scope = el.form ?? el.closest("div, section, main") ?? document.body;
      if (scope.querySelector('input[type="password"]') || el.form) return "username";
    }
    return null;
  }

  function fieldsNear(anchor: HTMLInputElement) {
    const scope: ParentNode =
      anchor.form ?? anchor.closest("form, [role=dialog], main, body") ?? document.body;
    const inputs = [...scope.querySelectorAll("input")].filter((i) => visible(i));
    const password =
      anchor.type === "password" ? anchor : (inputs.find((i) => i.type === "password") ?? null);
    let username: HTMLInputElement | null = null;
    if (kindOf(anchor) === "username") username = anchor;
    else if (password) {
      const before = inputs.slice(0, inputs.indexOf(password)).reverse();
      username =
        before.find((i) => kindOf(i) === "username" || ["email", "text"].includes(i.type)) ?? null;
    }
    return { username, password };
  }

  function setValue(el: HTMLInputElement, value: string) {
    // Framework-friendly: native setter + input/change events.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // ── Overlay (closed shadow root) ───────────────────────────────────────
  const host = document.createElement("securevault-overlay");
  host.style.cssText =
    "all:initial;position:fixed;inset:0 auto auto 0;width:0;height:0;z-index:2147483647;";
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font-family: system-ui, "Segoe UI", "Heebo", sans-serif; }
      .btn { position: fixed; width: 24px; height: 24px; border: 0; border-radius: 6px; cursor: pointer;
        background: #6063f0; color: #fff; display: none; align-items: center; justify-content: center; padding: 0;
        box-shadow: 0 1px 3px rgb(0 0 0 / .3); }
      .btn:focus-visible, .item:focus-visible, .act:focus-visible { outline: 2px solid #8b8ef7; outline-offset: 2px; }
      .btn svg { width: 14px; height: 14px; }
      .menu, .banner { position: fixed; min-width: 260px; max-width: 360px; background: #15151b; color: #f4f4f6;
        border: 1px solid #2a2a36; border-radius: 12px; box-shadow: 0 16px 40px rgb(0 0 0 / .45); padding: 6px; display: none; }
      .head { font-size: 11px; color: #8c8c96; padding: 6px 8px; text-transform: uppercase; letter-spacing: .04em; }
      .item { width: 100%; text-align: start; background: transparent; border: 0; color: inherit; padding: 8px; border-radius: 8px;
        cursor: pointer; display: block; }
      .item:hover, .item[aria-selected="true"] { background: #232330; }
      .title { font-size: 13px; font-weight: 600; }
      .sub { font-size: 12px; color: #b5b5be; }
      .warn { font-size: 12px; color: #fbbf24; padding: 2px 0 0; }
      .msg { font-size: 13px; color: #d4d4dc; padding: 8px; line-height: 1.45; }
      .banner { top: 12px; inset-inline-end: 12px; padding: 12px; }
      .row { display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px; }
      .act { border: 0; border-radius: 8px; padding: 7px 12px; font-size: 13px; cursor: pointer; background: #232330; color: #f4f4f6; }
      .act.primary { background: #6063f0; color: #fff; font-weight: 600; }
    </style>
    <button class="btn" part="btn" type="button" tabindex="-1">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
    </button>
    <div class="menu" role="listbox"></div>
    <div class="banner" role="dialog" aria-live="polite"></div>`;
  const btn = root.querySelector(".btn") as HTMLButtonElement;
  const menu = root.querySelector(".menu") as HTMLDivElement;
  const banner = root.querySelector(".banner") as HTMLDivElement;
  btn.setAttribute("aria-label", t("openMenu"));
  btn.title = t("openMenu");
  for (const el of [btn, menu, banner]) el.dir = isRtl() ? "rtl" : "ltr";
  // Mounted lazily, only when there is something to show, and only under
  // <html> (never on the document itself, which would replace the page).
  function ensureMounted(): boolean {
    if (host.isConnected) return true;
    if (!document.documentElement) return false;
    document.documentElement.appendChild(host);
    return true;
  }

  let active: HTMLInputElement | null = null;
  let activeKind: Kind | null = null;
  let armed: string | null = null; // entry id awaiting the second, confirming click

  function place() {
    if (!active || !document.contains(active) || !visible(active)) return hideButton();
    if (!ensureMounted()) return;
    const r = active.getBoundingClientRect();
    const rtlField = getComputedStyle(active).direction === "rtl";
    const left = rtlField ? r.left + 6 : r.right - 30;
    btn.style.left = `${Math.round(left)}px`;
    btn.style.top = `${Math.round(r.top + (r.height - 24) / 2)}px`;
    btn.style.display = "flex";
    if (menu.style.display === "block") {
      menu.style.top = `${Math.round(r.bottom + 4)}px`;
      menu.style.left = `${Math.round(Math.max(8, Math.min(rtlField ? r.left : r.right - 280, innerWidth - 300)))}px`;
    }
  }
  function hideButton() {
    btn.style.display = "none";
    closeMenu();
  }
  function closeMenu() {
    menu.style.display = "none";
    menu.replaceChildren();
    armed = null;
  }

  // Track the focused login field.
  document.addEventListener(
    "focusin",
    (e) => {
      const target = e.composedPath()[0] as Element;
      if (target === host) return;
      const k = kindOf(target);
      if (k) {
        active = target as HTMLInputElement;
        activeKind = k;
        place();
      } else if (!host.contains(target)) {
        active = null;
        hideButton();
      }
    },
    true,
  );
  let raf = 0;
  const reposition = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(place);
  };
  addEventListener("scroll", reposition, true);
  addEventListener("resize", reposition);

  btn.addEventListener("mousedown", (e) => e.preventDefault()); // keep focus in the field
  btn.addEventListener("click", (e) => {
    if (!e.isTrusted) return;
    if (menu.style.display === "block") return closeMenu();
    void openMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && menu.style.display === "block") closeMenu();
    // Alt+ArrowDown on a login field opens the menu from the keyboard.
    if (e.isTrusted && e.altKey && e.key === "ArrowDown" && active && e.target === active) {
      e.preventDefault();
      void openMenu(true);
    }
  });
  document.addEventListener("mousedown", (e) => {
    if (!e.composedPath().includes(host)) closeMenu();
  });

  function message(text: string) {
    const p = document.createElement("p");
    p.className = "msg";
    p.textContent = text;
    menu.replaceChildren(p);
  }

  async function openMenu(focusFirst = false) {
    if (!active) return;
    menu.style.display = "block";
    place();
    message(t("loading"));
    const resp: FindResponse | undefined = await chrome.runtime
      .sendMessage({ type: "SV_FIND_FOR_URL" })
      .catch(() => undefined);
    if (!resp) return message(t("notConnected"));
    if (resp.state === "locked") return message(t("locked"));
    if (resp.state && resp.state !== "ready" && !resp.unlocked) return message(t("notConnected"));
    const matches = resp.matches ?? [];
    if (matches.length === 0) return message(t("noLogins"));

    const head = document.createElement("div");
    head.className = "head";
    head.textContent = t("menuTitle", location.hostname.replace(/^www\./, ""));
    const items = matches.map((m) => menuItem(m, resp.crossSite ?? null));
    menu.replaceChildren(head, ...items);
    place();
    if (focusFirst) items[0]?.focus();
  }

  function menuItem(m: Match, crossSite: FindResponse["crossSite"]) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "item";
    b.setAttribute("role", "option");
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = m.title || t("untitled");
    const sub = document.createElement("div");
    sub.className = "sub";
    sub.textContent = activeKind === "otp" ? t("fillCode") : (m.username ?? "");
    b.append(title, sub);

    const needsConfirm = !m.exactHost || !!crossSite;
    if (needsConfirm) {
      const warn = document.createElement("div");
      warn.className = "warn";
      warn.hidden = true;
      let hostOfEntry = "";
      try {
        hostOfEntry = new URL(m.url ?? "").hostname;
      } catch {
        /* no url */
      }
      warn.textContent = crossSite
        ? t("thirdPartyFrame", crossSite.frameHost)
        : t("otherSite", hostOfEntry || "?");
      b.append(warn);
    }
    b.addEventListener("click", async (e) => {
      if (!e.isTrusted) return;
      if (needsConfirm && armed !== m.id) {
        armed = m.id;
        (b.querySelector(".warn") as HTMLElement).hidden = false;
        b.setAttribute("aria-selected", "true");
        return;
      }
      await fill(m);
      closeMenu();
    });
    return b;
  }

  async function fill(m: Match) {
    if (!active) return;
    if (activeKind === "otp") {
      const r = await chrome.runtime
        .sendMessage({ type: "SV_DESKTOP_TOTP", id: m.id })
        .catch(() => null);
      if (r?.code) setValue(active, r.code);
      return;
    }
    const { username, password } = fieldsNear(active);
    if (username && m.username) setValue(username, m.username);
    if (password && m.password) setValue(password, m.password);
    (password ?? username)?.focus();
  }

  // ── Save / update after submit ─────────────────────────────────────────
  function capture(form: ParentNode) {
    const pw = [...form.querySelectorAll<HTMLInputElement>('input[type="password"]')].filter(
      (i) => i.value,
    );
    if (pw.length === 0) return;
    // Sign-up / change-password forms: the LAST filled password is the new one.
    const password = pw[pw.length - 1].value;
    const { username } = fieldsNear(pw[0]);
    void chrome.runtime
      .sendMessage({ type: "SV_CAPTURE", username: username?.value ?? "", password })
      .catch(() => undefined);
  }
  document.addEventListener(
    "submit",
    (e) => e.isTrusted && capture(e.target as HTMLFormElement),
    true,
  );
  // Many SPAs don't submit a <form>: also capture on Enter in a password field
  // and on clicks of submit-looking buttons near one.
  document.addEventListener(
    "keydown",
    (e) => {
      const el = e.target as HTMLInputElement;
      if (e.isTrusted && e.key === "Enter" && el?.type === "password")
        capture(el.form ?? el.closest("div, section, main") ?? document);
    },
    true,
  );
  document.addEventListener(
    "click",
    (e) => {
      if (!e.isTrusted) return;
      const b = (e.target as Element)?.closest?.('button, input[type="submit"], [role="button"]');
      if (!b) return;
      const scope = (b as HTMLButtonElement).form ?? b.closest("form, [role=dialog], main, body");
      if (scope?.querySelector('input[type="password"]')) capture(scope);
    },
    true,
  );

  async function offerSave() {
    if (window.top !== window) return; // banner only in the top frame
    const p = await chrome.runtime.sendMessage({ type: "SV_PENDING_CAPTURE" }).catch(() => null);
    if (!p || (p.status !== "new" && p.status !== "changed")) return;
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = p.status === "new" ? t("saveTitle") : t("updateTitle", p.username || "—");
    const sub = document.createElement("div");
    sub.className = "sub";
    sub.textContent = [p.site, p.username].filter(Boolean).join(" · ");
    const row = document.createElement("div");
    row.className = "row";
    const later = document.createElement("button");
    later.className = "act";
    later.textContent = t("notNow");
    const ok = document.createElement("button");
    ok.className = "act primary";
    ok.textContent = p.status === "new" ? t("save") : t("update");
    row.append(later, ok);
    banner.replaceChildren(title, sub, row);
    if (!ensureMounted()) return;
    banner.style.display = "block";
    later.addEventListener("click", (e) => {
      if (!e.isTrusted) return;
      banner.style.display = "none";
      void chrome.runtime.sendMessage({ type: "SV_DISMISS_CAPTURE" });
    });
    ok.addEventListener("click", async (e) => {
      if (!e.isTrusted) return;
      const r = await chrome.runtime.sendMessage({ type: "SV_SAVE_LOGIN" }).catch(() => null);
      if (r?.ok) {
        title.textContent = t("saved");
        sub.textContent = "";
        row.remove();
        setTimeout(() => (banner.style.display = "none"), 2000);
      } else banner.style.display = "none";
    });
  }
  // After a full navigation the new page asks; SPAs get a delayed check too.
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", () => void offerSave(), { once: true });
  else void offerSave();
  addEventListener("popstate", () => setTimeout(offerSave, 800));
  document.addEventListener("submit", () => setTimeout(offerSave, 1500), true);

  // ── Popup "fill" and passkey relay ─────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "SV_FILL_ENTRY" || window.top !== window) return;
    const pw = document.querySelector<HTMLInputElement>('input[type="password"]');
    const target =
      pw ??
      document.querySelector<HTMLInputElement>(
        'input[autocomplete="username"], input[type="email"]',
      );
    if (!target) return sendResponse({ ok: false });
    active = target;
    activeKind = kindOf(target) ?? "password";
    const m = msg.entry as Match;
    let entryHost = "";
    try {
      entryHost = new URL(m.url ?? "").hostname.replace(/^www\./, "");
    } catch {
      /* none */
    }
    if (entryHost && entryHost !== location.hostname.replace(/^www\./, "")) {
      // From the popup, the click already happened in extension UI; still warn.
      if (!confirm(t("otherSite", entryHost))) return sendResponse({ ok: false });
    }
    void fill(m).then(() => sendResponse({ ok: true }));
    return true;
  });

  // Passkey requests from webauthn-inject (page world) → background → app.
  // The background derives the origin from the browser (sender.url).
  window.addEventListener("message", (ev) => {
    if (ev.source !== window || ev.data?.__sv !== "passkey-req") return;
    const { id, kind, options } = ev.data;
    if (kind !== "create" && kind !== "get") return;
    chrome.runtime.sendMessage({ type: "SV_PASSKEY", kind, options }, (result) => {
      void chrome.runtime.lastError;
      window.postMessage(
        { __sv: "passkey-res", id, result: result ?? null },
        window.location.origin,
      );
    });
  });
})();
