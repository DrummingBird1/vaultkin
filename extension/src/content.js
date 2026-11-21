/**
 * SecureVault — Content Script
 * Injected into all pages. Detects password inputs, overlays a 🔐 trigger,
 * and offers click-to-fill via the background service worker.
 */
(function () {
  if (window.__svExtensionInjected) return;
  window.__svExtensionInjected = true;

  function attachTrigger(input) {
    if (input.dataset.svAttached === "1") return;
    if (input.type !== "password") return;
    input.dataset.svAttached = "1";

    const wrapper = document.createElement("span");
    wrapper.className = "sv-input-wrapper";
    wrapper.style.cssText = "position:relative;display:inline-block;width:100%;";
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const btn = document.createElement("button");
    btn.className = "sv-trigger";
    btn.type = "button";
    btn.title = "SecureVault";
    btn.tabIndex = -1;
    btn.textContent = "🔐";
    wrapper.appendChild(btn);

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleTriggerClick(input, btn);
    });
  }

  function handleTriggerClick(input, btn) {
    const url = window.location.href;
    chrome.runtime.sendMessage({ type: "SV_FIND_FOR_URL", url }, (resp) => {
      if (chrome.runtime.lastError) {
        showTooltip(btn, "Extension error. Open the popup and unlock first.");
        return;
      }
      if (!resp?.unlocked) {
        showTooltip(btn, "SecureVault is locked. Click the toolbar icon.");
        return;
      }
      if (!resp.matches?.length) {
        showTooltip(btn, "No saved credentials for this domain.");
        return;
      }
      if (resp.matches.length === 1) fillInput(input, resp.matches[0]);
      else showPicker(btn, input, resp.matches);
    });
  }

  const USERNAME_SELECTOR =
    'input[type="email"], input[type="text"][name*="user" i], ' +
    'input[type="text"][name*="email" i], input[autocomplete="username"], ' +
    'input[autocomplete="email"]';

  function findUsernameInput(passwordInput) {
    // Preferred: same form (handles classic markup correctly).
    const form = passwordInput.closest("form");
    if (form) {
      const inForm = form.querySelector(USERNAME_SELECTOR);
      if (inForm) return inForm;
    }
    // Fallback for SPAs that don't wrap inputs in a <form>: walk up to common
    // containers and search for the closest preceding-or-sibling input. Stop
    // at <body> to avoid picking up unrelated inputs from elsewhere on the page.
    let scope = passwordInput.parentElement;
    while (scope && scope !== document.body) {
      const candidates = scope.querySelectorAll(USERNAME_SELECTOR);
      for (const c of candidates) {
        // Skip hidden / disabled / readonly inputs.
        if (c.offsetParent === null || c.disabled || c.readOnly) continue;
        return c;
      }
      scope = scope.parentElement;
    }
    return null;
  }

  // ── Phishing protection ────────────────────────────────────────────────────
  // The background's domain matcher (findMatchingEntries) is intentionally
  // generous — it'll match `github.com` against an entry saved as `gist.github.com`
  // for usability. But when we're about to AUTOFILL, we want stricter matching:
  // if the entry's URL hostname differs from the page hostname (after stripping
  // www.), require the user to confirm. This protects against opening a phish
  // tab that visually looks like github.com but is hosted at github.com.evil.io.
  function normalizeHost(h) {
    return String(h || "")
      .toLowerCase()
      .replace(/^www\./, "");
  }
  function urlHost(u) {
    try {
      return normalizeHost(new URL(u).hostname);
    } catch {
      return "";
    }
  }
  function isExactDomainMatch(entry) {
    if (!entry?.url) return false;
    return normalizeHost(window.location.hostname) === urlHost(entry.url);
  }

  function fillInput(passwordInput, entry) {
    if (!isExactDomainMatch(entry)) {
      const pageHost = normalizeHost(window.location.hostname);
      const entryHost = urlHost(entry.url) || "(no URL set)";
      const proceed = window.confirm(
        "⚠ SecureVault — Possible phishing\n\n" +
          `You're on: ${pageHost}\n` +
          `Entry was saved for: ${entryHost}\n\n` +
          "Domains don't match. This may be a phishing page.\n\n" +
          "Fill anyway?",
      );
      if (!proceed) return;
    }
    const usernameInput = findUsernameInput(passwordInput);
    if (usernameInput && entry.username) setReactValue(usernameInput, entry.username);
    if (entry.password) setReactValue(passwordInput, entry.password);
  }

  function setReactValue(el, value) {
    const proto = Object.getPrototypeOf(el);
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function showTooltip(anchor, message) {
    document.querySelectorAll(".sv-tooltip").forEach((t) => t.remove());
    const tip = document.createElement("div");
    tip.className = "sv-tooltip";
    tip.textContent = message;
    document.body.appendChild(tip);
    const rect = anchor.getBoundingClientRect();
    tip.style.top = rect.bottom + window.scrollY + 4 + "px";
    tip.style.left = rect.left + window.scrollX + "px";
    setTimeout(() => tip.remove(), 2500);
  }

  function showPicker(anchor, input, matches) {
    document.querySelectorAll(".sv-picker").forEach((el) => el.remove());
    const picker = document.createElement("div");
    picker.className = "sv-picker";
    matches.forEach((m) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "sv-picker-item";
      item.innerHTML = `<strong>${esc(m.title)}</strong><br><span>${esc(m.username || "")}</span>`;
      item.addEventListener("click", () => {
        fillInput(input, m);
        picker.remove();
      });
      picker.appendChild(item);
    });
    document.body.appendChild(picker);
    const rect = anchor.getBoundingClientRect();
    picker.style.top = rect.bottom + window.scrollY + 4 + "px";
    picker.style.left = rect.left + window.scrollX + "px";
    setTimeout(() => {
      document.addEventListener("click", function close(e) {
        if (!picker.contains(e.target)) {
          picker.remove();
          document.removeEventListener("click", close);
        }
      });
    }, 0);
  }

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function scan() {
    document.querySelectorAll('input[type="password"]').forEach(attachTrigger);
  }

  // Debounce + rAF coalesce — busy SPAs (chat, social feeds) mutate the DOM
  // every few ms; running a full querySelectorAll on each mutation is wasted
  // work because attachTrigger is idempotent (dataset.svAttached guard).
  let scanQueued = false;
  function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(() => {
      scanQueued = false;
      scan();
    });
  }

  scan();
  new MutationObserver(queueScan).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // Fill requested from the popup (as opposed to the inline 🔐 trigger
  // above) — same fillInput() path, so it gets the same exact-domain-match
  // phishing confirmation. Falls back to the first password field on the
  // page since the popup doesn't know which input the user meant.
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "SV_FILL_ENTRY") {
      const passwordInput = document.querySelector('input[type="password"]');
      if (!passwordInput) {
        sendResponse({ ok: false, error: "No password field on this page." });
        return;
      }
      fillInput(passwordInput, msg.entry);
      sendResponse({ ok: true });
    }
  });

  // Passkey requests from webauthn-inject (page world) → background → app.
  // Only this window's own messages; the background derives the origin from
  // the browser (sender.url), not from anything the page says.
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
