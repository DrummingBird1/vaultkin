# פתרון תקלות — Vaultkin

## תוכן עניינים
- [המסך שחור / לבן ריק](#המסך-שחור--לבן-ריק)
- [שגיאות בהתקנה](#שגיאות-בהתקנה)
- [`pnpm install` נכשל](#pnpm-install-נכשל)
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
3. **אל תנקה את נתוני האתר ואל תמחק את מסד הנתונים כדי לפתור את זה.** זה מוחק את ה-vault המקומי, והוא לא חוזר מעצמו.
4. **Cache של service worker מקולקל**:
   - `chrome://serviceworker-internals/` → unregister
   - או DevTools → Application → Service Workers → Unregister.

---

## שגיאות בהתקנה

### `pnpm install` נכשל

ודא Node 20+ ו-pnpm 9+, ואז התקן לפי ה-lockfile:
```bash
node -v
pnpm -v
pnpm install --frozen-lockfile
```

---

## סיסמה שגויה

### "Incorrect master password"

**אפשרויות:**
1. **באמת הקלדת לא נכון** — בדוק Caps Lock, פריסת מקלדת, רווחים.
2. **יש לך duress password מוגדר** — אם הקלדת *אותו* בטעות, ה-vault שלך **כבר נמחק מהמכשיר הזה**. בדוק ב-Settings → Security אם יש banner אדום של duress trigger.
3. **ה-payload פגום** — אם פתחת את ה-DB ב-IndexedDB inspector ושינית בייטים, ה-HMAC ייכשל ונקבל שגיאה זו (גם אם הסיסמה נכונה).

**שחזור:**
- אם יש לך גיבוי WebDAV: השאר את ה-vault המקומי במקומו ושחזר במכשיר אחר או בפרופיל דפדפן נפרד, לפי [שחזור מ-WebDAV](USER_GUIDE.he.md#שחזור-מ-webdav-במכשיר-חדש). דרושה סיסמת המאסטר של ה-vault המגובה.
- אם אין גיבוי והסיסמה אבדה, אי אפשר לשחזר את ה-vault.

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
  - אם לא: אין vault במכשיר הזה. אם יש גיבוי, שחזר אותו לפני הוספת נתונים חדשים.

### סימפטום: "Failed to unlock vault. The file may be corrupted."
- ה-`headerMac` נכשל. או שהvault שונה ידנית, או ש-Argon2 מחזיר ערך שונה (קרה בעבר עם בעיות ב-WASM).
- שחזר קודם גיבוי WebDAV במכשיר אחר או בפרופיל דפדפן נפרד ([השלבים](USER_GUIDE.he.md#שחזור-מ-webdav-במכשיר-חדש)). אל תמחק את ה-vault המקומי.

---

## Sync לא עובד

### "Sync failed"
- Push או Pull שנכשלו לא משנים את ה-vault המקומי. הסנכרון ידני, ואין ניסיון חוזר אוטומטי.
- בדוק:
  1. **WebDAV URL** מתחיל ב-`https://` והוא הכתובת המלאה של קובץ ה-vault.
  2. **Credentials** נכונים. עם 2FA בנקסטקלאוד — חייבים **App Password**, לא הסיסמה הראשית.
  3. CORS — אם השרת לא שולח `Access-Control-Allow-Origin` נכון, יש בעיה. לרוב זה Nextcloud/ownCloud ובהם מספיק להיכנס דרך Electron במקום דרך הדפדפן.

### "Sync conflict"
- **Pull** מציג את ההבדלים בין ה-vault המקומי לזה שבשרת.
- בחר שם אסטרטגיה. **Push** לא בודק קונפליקטים ודורס את הקובץ בשרת, לכן קודם Pull.

---

## Browser Extension לא רואה entries

### Checklist
1. האפליקציה פתוחה וה-vault לא נעול.
2. ה-extension מותקן ומופעל (`chrome://extensions/`).
3. ה-Extension ID נכון ב-Settings → Browser extension, ולחצת **Set up browser connection**.
4. לחצת **Connect** בחלון ה-extension ואישרת באפליקציה.
5. בגרסת הדפדפן: שלחת שוב **Send entries to extension** (העותק נמחק אחרי 5 דקות חוסר פעילות).

### Debug
`chrome://extensions/` → Vaultkin → "Service worker" → Console.

### האייקון 🔐 לא מופיע על שדות password
- ה-content script לא רץ. בדוק:
  - `chrome://extensions/` → "Errors" → אם יש שגיאות.
  - דף עם CSP מאוד נוקשה (Banking sites, GitHub) יחסום inline script — זה ידוע.

---

## Biometric Unlock לא עובד

הפעל **Remember this device** ב-Settings → Security (אפליקציית הדסקטופ). סיסמת המאסטר נדרשת לפחות פעם ב-14 ימים. ב-Windows, חלון Windows Hello עלול להיפתח מאחורי החלון של האפליקציה.

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

### `pnpm test` — vitest fails on crypto
- Node 20+ צריך להכיל `globalThis.crypto.subtle`. אם לא:
  ```bash
  node -v   # ודא 20+
  ```
- רץ ב-jsdom. אם יש בעיה ב-IndexedDB mock — בדוק ב-`tests/setup.ts`.

### `pnpm test:e2e` — Playwright timeouts
- Vite dev server לא רץ:
  ```bash
  # רץ בטרמינל נפרד
  pnpm dev
  # ואז
  pnpm test:e2e
  ```
- הסביבה איטית — הגדל timeouts ב-`config/playwright.config.ts` (נמצא כעת על 60s).

### Coverage נמוך מהסף
- `config/vitest.config.ts` דורש 80% lines + 80% functions + 75% branches + 80% statements.
- שגיאת CI? הוסף בדיקות, אל תוריד את הסף.

---

## Electron לא עולה

### `pnpm electron:dev` נכשל
- האם Vite רץ קודם? ב-`electron:dev` רצים שניהם דרך concurrently. בדוק שאין port conflict על 5173.

### חלון פותח אבל ריק
- בדוק את ה-Electron DevTools: `View → Toggle Developer Tools`.
- וודא שה-CSP לא חוסם משהו (`Content Security Policy directive: "default-src 'self'"...`).

---

## עוד תקלות?

- 🐛 פתח issue ב-GitHub
- 📋 תכלול: גרסה (`Vaultkin Settings → About`), OS, browser, וצילום מסך של ה-Console.
- 🔒 **אל תכלול**: את ה-vault שלך, סיסמאות, או כל credential.
