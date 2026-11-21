# פתרון תקלות — Vaultkin

## תוכן עניינים
- [המסך שחור / לבן ריק](#המסך-שחור--לבן-ריק)
- [שגיאות בהתקנה](#שגיאות-בהתקנה)
- [`npm install` נכשל](#npm-install-נכשל)
- [סיסמה שגויה / "Incorrect master password"](#סיסמה-שגויה)
- [ה-vault לא נטען](#ה-vault-לא-נטען)
- [Sync לא עובד](#sync-לא-עובד)
- [Browser Extension לא רואה entries](#browser-extension-לא-רואה-entries)
- [Biometric Unlock לא עובד](#biometric-unlock-לא-עובד)
- [TOTP code שגוי](#totp-code-שגוי)
- [Tests נכשלים](#tests-נכשלים)
- [Electron לא עולה](#electron-לא-עולה)

---

## המסך שחור / לבן ריק

**תוקן בגרסה זו**. השרשרת של imports שבורים בין `engine.ts`, `serializer.ts`, ו-`session.store.ts` נסגרה, וה-`ErrorBoundary` עוטף עכשיו את כל האפליקציה.

אם בכל זאת המסך שחור:
1. **רענון חזק**: `Ctrl+Shift+R` (`⌘+Shift+R` ב-Mac).
2. **DevTools** (F12) → Console: האם יש שגיאות אדומות? צלם וצרף ל-issue.
3. **localStorage corrupt**?
   ```js
   // ב-DevTools console:
   localStorage.clear();
   indexedDB.deleteDatabase("securevault");
   location.reload();
   ```
   ⚠️ זה ימחק את ה-vault המקומי. אם יש לך גיבוי בענן (WebDAV) — תיטען משם בלוגין הבא.
4. **Cache של service worker מקולקל**:
   - `chrome://serviceworker-internals/` → unregister
   - או DevTools → Application → Service Workers → Unregister.

---

## שגיאות בהתקנה

### `npm install` נכשל

**סימפטומים נפוצים:**
- שגיאה ב-`argon2-browser` או `keytar`.
- שגיאת native compile (`gyp ERR!`).

**פתרונות:**
```bash
# 1. ודא Node 20+
node -v

# 2. נקה cache + node_modules
rm -rf node_modules package-lock.json
npm cache clean --force
npm install

# 3. אם keytar נכשל (בעיה נפוצה ב-Linux):
sudo apt install libsecret-1-dev  # Debian/Ubuntu
sudo dnf install libsecret-devel  # Fedora

# 4. אם argon2-browser נכשל — ודא שיש python3 + make + g++:
sudo apt install build-essential python3
```

### "ERESOLVE could not resolve" / peer dependency conflicts
```bash
npm install --legacy-peer-deps
```

---

## סיסמה שגויה

### "Incorrect master password"

**אפשרויות:**
1. **באמת הקלדת לא נכון** — בדוק Caps Lock, פריסת מקלדת, רווחים.
2. **יש לך duress password מוגדר** — אם הקלדת *אותו* בטעות, ה-vault שלך **כבר נמחק מהמכשיר הזה**. בדוק ב-Settings → Security אם יש banner אדום של duress trigger.
3. **ה-payload פגום** — אם פתחת את ה-DB ב-IndexedDB inspector ושינית בייטים, ה-HMAC ייכשל ונקבל שגיאה זו (גם אם הסיסמה נכונה).

**שחזור:**
- אם יש לך WebDAV backup: מחק את ה-vault המקומי (`localStorage.clear()` + `indexedDB.deleteDatabase("securevault")`), היכנס מחדש, וה-app ימשוך מהענן.
- אם אין: **אין שחזור**. צור vault חדש מאפס.

### שכחתי לחלוטין את הסיסמה
אין שחזור. זה הרי מה שעושה את האפליקציה zero-knowledge — אם היה backdoor, היא לא הייתה zero-knowledge.

האפשרויות:
1. בדוק ב-password managers אחרים שאולי שמרת שם את הסיסמה.
2. בדוק ב-Settings אם הגדרת **hint** (מוצג מעל שדה הסיסמה).
3. ייבא את הנתונים מהמקור המקורי (Bitwarden/1Password וכו') והתחל vault חדש.

---

## ה-vault לא נטען

### סימפטום: לוחצים Unlock וכלום לא קורה
- DevTools → Network: האם יש קריאה ל-`indexedDB`?
- DevTools → Application → IndexedDB: האם יש DB בשם `securevault`?
  - אם כן: בדוק אם ב-`vault` store יש עצם.
  - אם לא: צור vault חדש.

### סימפטום: "Failed to unlock vault. The file may be corrupted."
- ה-`headerMac` נכשל. או שהvault שונה ידנית, או ש-Argon2 מחזיר ערך שונה (קרה בעבר עם בעיות ב-WASM).
- נסה את הvault המגובה בענן.

---

## Sync לא עובד

### "Sync failed"
- שמירה לוקאלית **הצליחה** — ה-vault שלך מאובטח. ה-sync יעיף ניסיון נוסף בשמירה הבאה.
- בדוק:
  1. **WebDAV URL** נכון ומסתיים ב-`/`.
  2. **Credentials** נכונים. עם 2FA בנקסטקלאוד — חייבים **App Password**, לא הסיסמה הראשית.
  3. CORS — אם השרת לא שולח `Access-Control-Allow-Origin` נכון, יש בעיה. לרוב זה Nextcloud/ownCloud ובהם מספיק להיכנס דרך Electron במקום דרך הדפדפן.

### "Sync conflict"
- שניכם (אתה והמכשיר השני) שיניתם את ה-vault מאז ה-sync האחרון.
- פתח את ה-Conflict Resolution modal (Settings → Sync → Resolve) ובחר אסטרטגיה.

---

## Browser Extension לא רואה entries

### Checklist
1. ✅ ה-extension מותקן (`chrome://extensions/`)?
2. ✅ ה-Extension ID מוזן ב-Settings → Security → Browser Extension?
3. ✅ ב-`manifest.json` של ה-extension, `externally_connectable.matches` כולל את ה-origin שלך (`http://localhost:5173/*`)?
4. ✅ לחצת **"Send entries to extension"**?
5. ✅ ה-cache לא פג (5 דקות מאז שליחה)?

### Debug
1. פתח את ה-extension service worker:
   - `chrome://extensions/` → Vaultkin → "Service worker" link → DevTools.
2. ב-Console חפש logs: `[SV-Ext] Received N entries from main app`.
3. אם אין הודעה — ה-message לא הגיע. בדוק `externally_connectable`.

### האייקון 🔐 לא מופיע על שדות password
- ה-content script לא רץ. בדוק:
  - `chrome://extensions/` → "Errors" → אם יש שגיאות.
  - דף עם CSP מאוד נוקשה (Banking sites, GitHub) יחסום inline script — זה ידוע.

---

## Biometric Unlock לא עובד

**ידוע**: בגרסה הנוכחית, biometrics דורש שתפתח עם הסיסמה הראשית בפעם הראשונה אחרי התקנה. הזרימה המלאה (decrypt-with-keys-only) עדיין בפיתוח.

לעקיפה: בכל startup, פתח עם סיסמה. בכניסה הזאת biometrics יוצע — אבל לא יעבוד.

---

## TOTP code שגוי

### ה-code שלי לא מתקבל באתר
- **שעון**: TOTP מסתמך על שעון מסונכרן. אם המכשיר שלך לא מסונכרן — הקודים יהיו שגויים.
  - macOS: `sudo sntp -sS time.apple.com`
  - Windows: Settings → Time & Language → Sync now
  - Linux: `timedatectl set-ntp true`
- **Drift**: אם הזמן בסדר אבל עדיין שגוי, בדוק שה-Base32 secret תואם בדיוק (אותיות גדולות, בלי רווחים).
- **חלון זמן**: ברירת המחדל 30 שניות. רוב האתרים מקבלים ±1 חלון (60 שניות סהכ). אם האתר רגיש מאוד, נסה להגיש מהר יותר.

### "Invalid Base32"
- Base32 RFC 4648 בלבד: A-Z, 2-7, ולפעמים `=` ל-padding.
- חלק מהאתרים נותנים secret עם רווחים (`ABCD EFGH IJKL`) — האפליקציה תסיר אותם.
- חלק נותנים lowercase — מומר אוטומטית.

---

## Tests נכשלים

### `npm test` — vitest fails on crypto
- Node 20+ צריך להכיל `globalThis.crypto.subtle`. אם לא:
  ```bash
  node -v   # ודא 20+
  ```
- רץ ב-jsdom. אם יש בעיה ב-IndexedDB mock — בדוק ב-`tests/setup.ts`.

### `npm run test:e2e` — Playwright timeouts
- Vite dev server לא רץ:
  ```bash
  # רץ בטרמינל נפרד
  npm run dev
  # ואז
  npx playwright test
  ```
- הסביבה איטית — הגדל timeouts ב-`playwright.config.ts` (נמצא כעת על 60s).

### Coverage נמוך מהסף
- `vitest.config.ts` דורש 80% lines + 80% functions + 75% branches + 80% statements.
- שגיאת CI? הוסף בדיקות, אל תוריד את הסף.

---

## Electron לא עולה

### `npm run electron:dev` נכשל
- האם Vite רץ קודם? ב-`electron:dev` רצים שניהם דרך concurrently. בדוק שאין port conflict על 5173.
- macOS Catalina+: צריך `Codesign` או disable Gatekeeper (`spctl --master-disable`) **רק לפיתוח**.

### "Cannot find module 'keytar'"
```bash
cd node_modules/keytar && npm run rebuild
# או:
npm rebuild keytar
```

### חלון פותח אבל ריק
- בדוק את ה-Electron DevTools: `View → Toggle Developer Tools`.
- וודא שה-CSP לא חוסם משהו (`Content Security Policy directive: "default-src 'self'"...`).

---

## עוד תקלות?

- 🐛 פתח issue ב-GitHub
- 📋 תכלול: גרסה (`Vaultkin Settings → About`), OS, browser, וצילום מסך של ה-Console.
- 🔒 **אל תכלול**: את ה-vault שלך, סיסמאות, או כל credential.
