/**
 * SecureVault — Popup UI
 *
 * Desktop mode (preferred): talks to the SecureVault app over the encrypted
 * native-messaging bridge via the background worker. Shows connection state,
 * the pairing code to compare with the app, and the logins for the current
 * site only.
 *
 * Legacy mode (web build): the snapshot pushed with "Send to extension".
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const desktopView = $("desktopView");
  const desktopMessage = $("desktopMessage");
  const desktopAction = $("desktopAction");
  const pairCode = $("pairCode");
  const lockedView = $("lockedView");
  const unlockedView = $("unlockedView");
  const searchInput = $("searchInput");
  const entryList = $("entryList");
  const emptyState = $("emptyState");
  const siteLabel = $("siteLabel");
  const lockBtn = $("lockBtn");

  let allEntries = [];
  let activeTab = null;

  const MESSAGES = {
    "not-installed": [
      "The SecureVault app isn't connected to this browser yet.",
      "In the app: Settings → Browser extension → Set up browser connection.",
    ],
    "app-not-running": ["Open the SecureVault desktop app to fill logins.", null],
    connecting: ["Connecting to SecureVault…", null],
    disconnected: ["Not connected to the SecureVault app.", "Retry"],
    locked: ["SecureVault is locked. Unlock the app, then try again.", "Retry"],
    unpaired: ["Connect this browser to your SecureVault app.", "Connect"],
    rejected: ["The app rejected the connection.", "Try again"],
    pairing: ["Check that the SecureVault app shows this code, then approve it there.", null],
  };

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function show(view) {
    desktopView.hidden = view !== "desktop";
    lockedView.hidden = view !== "locked";
    unlockedView.hidden = view !== "unlocked";
  }

  function render(query) {
    const q = query.trim().toLowerCase();
    const filtered = !q
      ? allEntries
      : allEntries.filter(
          (e) =>
            (e.title || "").toLowerCase().includes(q) ||
            (e.username || "").toLowerCase().includes(q) ||
            (e.url || "").toLowerCase().includes(q),
        );
    entryList.innerHTML = "";
    emptyState.hidden = filtered.length > 0;
    for (const entry of filtered) {
      const li = document.createElement("li");
      li.className = "sv-entry";
      li.innerHTML = `
        <div class="sv-entry-info">
          <div class="sv-entry-title">${esc(entry.title || "(untitled)")}</div>
          <div class="sv-entry-user">${esc(entry.username || "")}</div>
        </div>
        <div class="sv-entry-actions">
          <button type="button" data-action="copy-user" title="Copy username" aria-label="Copy username">👤</button>
          <button type="button" data-action="copy-pass" title="Copy password" aria-label="Copy password">🔑</button>
          ${entry.hasTotp ? '<button type="button" data-action="copy-code" title="Copy one-time code" aria-label="Copy one-time code">⏱</button>' : ""}
          <button type="button" data-action="fill" title="Fill on this page" aria-label="Fill on this page">➜</button>
        </div>`;
      li.querySelector('[data-action="copy-user"]').addEventListener("click", () =>
        copy(entry.username),
      );
      li.querySelector('[data-action="copy-pass"]').addEventListener("click", () =>
        copy(entry.password),
      );
      li.querySelector('[data-action="copy-code"]')?.addEventListener("click", () =>
        chrome.runtime.sendMessage(
          { type: "SV_DESKTOP_TOTP", id: entry.id, url: activeTab?.url ?? "" },
          (r) => copy(r?.code),
        ),
      );
      li.querySelector('[data-action="fill"]').addEventListener("click", () =>
        fillOnActiveTab(entry),
      );
      entryList.appendChild(li);
    }
  }

  function copy(value) {
    if (!value) return;
    navigator.clipboard?.writeText(value).catch(() => {});
    // Clear after 30 s, like the app does.
    setTimeout(() => navigator.clipboard?.writeText("").catch(() => {}), 30_000);
  }

  function fillOnActiveTab(entry) {
    if (!activeTab?.id) return;
    chrome.tabs.sendMessage(
      activeTab.id,
      { type: "SV_FILL_ENTRY", entry },
      () => void chrome.runtime.lastError,
    );
  }

  function showDesktop(state) {
    show("desktop");
    const [text, action] = MESSAGES[state.kind] ?? ["", null];
    desktopMessage.textContent = text;
    pairCode.hidden = state.kind !== "pairing";
    if (state.kind === "pairing")
      pairCode.textContent = `${state.code.slice(0, 3)} ${state.code.slice(3)}`;
    const clickable =
      state.kind === "unpaired" ||
      state.kind === "rejected" ||
      state.kind === "disconnected" ||
      state.kind === "locked";
    desktopAction.hidden = !action || !clickable;
    if (state.kind === "not-installed") {
      desktopAction.hidden = true;
      desktopMessage.textContent = `${MESSAGES["not-installed"][0]} ${MESSAGES["not-installed"][1]}`;
    }
    desktopAction.textContent = action ?? "";
  }

  function loadDesktopEntries() {
    chrome.runtime.sendMessage({ type: "SV_FIND_FOR_URL", url: activeTab?.url ?? "" }, (resp) => {
      allEntries = resp?.matches ?? [];
      siteLabel.textContent = activeTab?.url ? new URL(activeTab.url).hostname : "";
      show("unlocked");
      render(searchInput.value);
    });
  }

  function refreshDesktop() {
    chrome.runtime.sendMessage({ type: "SV_DESKTOP_STATUS" }, (state) => {
      if (!state) return refreshLegacy();
      if (state.kind === "ready") return loadDesktopEntries();
      showDesktop(state);
      // Pairing finishes in the app; poll until it does.
      if (state.kind === "pairing") setTimeout(refreshDesktop, 1000);
    });
  }

  function refreshLegacy() {
    chrome.runtime.sendMessage({ type: "SV_GET_STATUS" }, (resp) => {
      if (!resp?.unlocked) return show("locked");
      chrome.runtime.sendMessage({ type: "SV_GET_ALL" }, (r) => {
        allEntries = r?.entries ?? [];
        show("unlocked");
        render(searchInput.value);
      });
    });
  }

  desktopAction.addEventListener("click", () => {
    const label = desktopAction.textContent;
    if (label === "Connect" || label === "Try again") {
      chrome.runtime.sendMessage({ type: "SV_DESKTOP_PAIR" }, (r) => {
        if (r?.ok) showDesktop({ kind: "pairing", code: r.code });
        setTimeout(refreshDesktop, 1000);
      });
    } else {
      refreshDesktop();
    }
  });

  searchInput.addEventListener("input", () => render(searchInput.value));
  lockBtn.addEventListener("click", () =>
    chrome.runtime.sendMessage({ type: "SV_LOCK" }, () => refreshDesktop()),
  );

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    activeTab = tabs[0] ?? null;
    refreshDesktop();
  });
})();
