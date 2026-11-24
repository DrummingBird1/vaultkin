# מדריך משתמש מלא — Vaultkin

## מה זה Vaultkin?

מנהל סיסמאות ומאמת 2FA עם **הצפנה מקומית בלבד** (zero-knowledge):
הסיסמה המאסטר שלך אף פעם לא יוצאת מהמכשיר, וגם המידע מוצפן לפני שהוא נכתב לדיסק. אם תשכח את סיסמת המאסטר — אין שחזור. זו הצורה היחידה לוודא שאף אחד מלבדך יכול לראות את המידע.

---

## תוכן עניינים

1. [התקנה והרצה](#התקנה-והרצה)
2. [יצירת ה-Vault הראשון](#יצירת-ה-vault-הראשון)
3. [שימוש יומיומי](#שימוש-יומיומי)
4. [קיצורי מקלדת](#קיצורי-מקלדת)
5. [Password Health Dashboard](#password-health-dashboard)
6. [Duress Password — סיסמת מצוקה](#duress-password--סיסמת-מצוקה)
7. [Browser Extension](#browser-extension)
8. [QR Backup](#qr-backup)
9. [Conflict Resolution](#conflict-resolution)
10. [סנכרון WebDAV](#סנכרון-webdav)
11. [ייצוא וייבוא](#ייצוא-וייבוא)
12. [אבטחה תחת המכסה](#אבטחה-תחת-המכסה)
13. [פתרון בעיות](#פתרון-בעיות)
14. [פיתוח ובדיקות](#פיתוח-ובדיקות)
15. [רישוי](#רישוי)

---

## התקנה והרצה

### דרישות
- **Node.js 20+** (`node -v`)
- **pnpm 9+**
- macOS / Windows / Linux

### התקנת תלויות
```bash
git clone https://github.com/DrummingBird1/vaultkin.git
cd vaultkin
pnpm install
```

### הרצה במצב פיתוח (דפדפן)
```bash
pnpm dev
```
פתח `http://localhost:5173`.

### הרצה כאפליקציית דסקטופ
```bash
pnpm electron:dev
```
חלון עצמאי + תמיכה ב-TouchID/FaceID + טריי + גישה ל-keychain של המערכת.

### בנייה לפרודקשן
```bash
pnpm build                  # PWA (לדפדפן)
pnpm electron:dist:mac      # macOS DMG (Universal)
pnpm electron:dist:win      # Windows NSIS installer
pnpm electron:dist:linux    # AppImage / deb / rpm
```

---

## יצירת ה-Vault הראשון

1. בהפעלה ראשונה תראה **"No vault found"**.
2. לחץ **"Create New Vault"**.
3. בחר **Master Password**:
   - מד החוזק חייב להראות "Strong" ומעלה (3 מתוך 4).
   - לא בטוח? לחץ **"Suggest strong password"** — נוצרת סיסמה אקראית של 24 תווים.
4. *(אופציונלי)* **Hint** — רמז שיוצג לך אם תשכח. **אל תכתוב את הסיסמה עצמה!** הרמז נשמר ב-localStorage לא מוצפן.
5. **Create Vault** — Argon2id יקח 1-2 שניות.

> ⚠️ **אזהרה**: שמור את הסיסמה במקום בטוח (kdf בשירותי ענן, פתק בכספת, וכו'). אין שחזור.

---

## שימוש יומיומי

### ניווט
| 🎨 | מסך | מה הוא נותן לך |
|----|-----|---------------|
| 🔑 | **Vault** | רשימת כל ה-entries — סיסמאות, נוטים, כרטיסי אשראי |
| 🛡️ | **Authenticator** | קודי 2FA חיים (TOTP) עם רענון אוטומטי |
| 🔄 | **Generator** | יצירת סיסמאות חזקות מותאמות אישית |
| 🛡️ | **Password Health** | בדיקת בריאות + סריקת פריצות |
| ☁️ | **Sync** | הגדרת WebDAV |
| ⚙️ | **Settings** | ערכת נושא, צבע, ביטחון, שינוי סיסמה |

### הוספת entry חדש
- לחץ **+ Add Entry** או `Ctrl/⌘+N`.
- מלא את הטופס:
  - **Title** (חובה)
  - **Username / Email**
  - **Password** — אייקון לייצור אוטומטי, מד חוזק חי
  - **URL** — חסר https? יוסיף לבד
  - **TOTP Secret** — Base32 שמתאמת בזמן אמת
  - **Notes** — Markdown נתמך! ([ראה דוגמה](#markdown-בנוטס))
  - **Custom Fields** — לחץ **"Use template"** לבחירה מ-8 תבניות מוכנות

### תבניות Custom Fields
לחץ "Use template" כדי להזין שדות מותאמים בלחיצה אחת:
- 💳 Credit Card
- 🔑 SSH Key
- 🌐 API Credentials
- 📶 Wi-Fi
- 📘 Passport
- 🏦 Bank Account
- 📜 Software License
- ₿ Crypto Wallet

### חיפוש
- `Ctrl/⌘+K` או `/` — מקפיץ את שדה החיפוש.
- מחפש בכותרת, שם משתמש, URL, וקטגוריה (לא רגיש לאותיות גדולות).
- `Esc` מנקה.

### העתקה מהירה (Quick Copy)
- לחץ על שדה כלשהו ב-detail panel → מועתק ל-clipboard.
- ה-clipboard מתנקה אוטומטית אחרי **30 שניות** (קונפיגורבילי ב-Settings).

### Drag & Drop
- בתצוגת רשימה (לא חיפוש): גרור entries כדי לסדר אותם מחדש.
- הסדר נשמר ב-vault והוא הסדר שיוצג בכל פתיחה.

### Markdown בנוטס
שדה ה-Notes תומך ב:
```markdown
## Recovery Codes
- **123456** (used)
- 789012

## Steps to reset
1. Visit https://example.com/account
2. Click *Reset password*
3. Check email

> Quote: keep this secure!

`code snippet`
```

### Version History
כל פעם שאתה עורך entry, הגרסה הקודמת נשמרת **בזיכרון** (לא בדיסק). כשאתה פותח entry קיים, תראה כפתור **"History (3)"** שמראה את 10 הגרסאות האחרונות. לחץ על גרסה כדי לשחזר אותה.
> **חשוב**: ה-history נמחק ב-lock. הוא לא חוצה sessions.

### Bulk Actions
לחץ **"Select"** ב-toolbar → סמן כמה entries → תוכל למחוק את כולם, להעביר ל-folder, וכו'.

---

## קיצורי מקלדת

| קיצור | פעולה |
|-------|-------|
| `Ctrl/⌘+K` | פוקוס לחיפוש |
| `Ctrl/⌘+N` | Entry חדש |
| `Ctrl/⌘+L` | נעילה מיידית |
| `Ctrl/⌘+G` | Generator |
| `Ctrl/⌘+,` | Settings |
| `/` | חיפוש (כשלא בשדה טקסט) |
| `?` | רשימת קיצורים |
| `Esc` | סגירת modal / ניקוי חיפוש |

---

## Password Health Dashboard

מסך חדש: **🛡️ Password Health**.

### מה זה מראה?
- **Compromised passwords** — סיסמאות שנמצאו במאגרי פריצות.
- **Weak passwords** — אנטרופיה < 60 ביט.
- **Reused passwords** — אותה סיסמה בכמה entries.
- **Old passwords** — לא עודכנו 90+ ימים.
- **Missing passwords** — login entries בלי סיסמה.
- **No 2FA enabled** — login עם URL בלי TOTP.

### ציון כולל
חישוב 0-100 על בסיס יחס בעיות / סך login entries:
- **80-100** — Excellent (ירוק)
- **60-79** — Good (צהוב)
- **40-59** — Fair (כתום)
- **0-39** — Poor (אדום)

### Scan for breaches
לחץ הכפתור → בדיקה מול **Have I Been Pwned**.

> 🔒 **פרטיות**: רק 5 התווים הראשונים של ה-SHA-1 hash נשלחים. שאר ה-hash מושווה לוקאלית מול 500+ candidates שמוחזרים. הסיסמה עצמה אף פעם לא יוצאת. זה המודל שבו משתמשים Bitwarden, 1Password, ו-Firefox Lockwise.

---

## Duress Password — סיסמת מצוקה

### מה זה?
סיסמה שניה שאתה מגדיר. אם מישהו מאלץ אותך לפתוח את ה-vault, אתה מקליד את ה-duress password במקום הסיסמה האמיתית.

### מה קורה?
1. ה-vault האמיתי **נמחק לחלוטין** מהמכשיר.
2. נוצר vault ריק חדש עם ה-duress password כמסטר.
3. נראה ל-attacker שהsuccessfully unlocked — אבל אין שם כלום.
4. בפעם הבאה שתפתח את האפליקציה לבד, תראה אזהרה אדומה: **"Duress unlock was triggered on [תאריך]"**.

### הגדרה
1. **Settings → Security → Duress password**.
2. בחר סיסמה (6+ תווים, חייבת להיות שונה מהמסטר).
3. אשר את הסיסמה הנוכחית.
4. **Enroll**.

### חשוב לדעת
- ה-duress רק מוחק את ה-**העותק המקומי**. אם יש לך גיבוי בענן (WebDAV) — הוא לא נוגע.
- ה-attacker יכול בטרוריה לזהות את התופעה — אבל זה plausible deniability, לא הסתרה מושלמת.

---

## Browser Extension

### התקנה (פיתוח)
1. הרץ `pnpm build:extension`.
2. פתח `chrome://extensions/` והפעל **Developer mode**.
3. **Load unpacked** → בחר את התיקייה `dist/extension/`.
4. העתק את **Extension ID** מהדף.

Firefox 128+: ראה [extension/README.md](../extension/README.md).

### חיבור לאפליקציית הדסקטופ
1. ב-Vaultkin: **Settings → Browser extension**, הדבק את ה-Extension ID.
2. לחץ **Set up browser connection**.
3. פתח את חלון ה-extension ולחץ **Connect**.
4. אשר באפליקציה רק אם הקוד בן 6 הספרות זהה בשני הצדדים.

בגרסת הדפדפן (ללא דסקטופ) יש במקום זה **Send entries to extension**: עותק בזיכרון שנמחק אחרי 5 דקות חוסר פעילות.

### אבטחה
- ה-extension לא מפענח את ה-vault בעצמו.
- החיבור לאפליקציית הדסקטופ מוצפן מקצה לקצה, והוא מקבל רק את הפרטים של האתר הנוכחי.

---

## QR Backup

ייצוא ה-vault **המוצפן** כסדרת QR codes.

### מתי להשתמש?
- גיבוי פיזי מודפס (הקפד על מקום מאובטח!).

### איך?
1. **Settings → Export → "Show as QR codes"**.
2. כל QR מכיל ~240 בייט. ל-vault ממוצע יוצאים 5-15 QR codes.
3. גלול / חצים שמאלה-ימינה כדי לראות את כולם.
4. לשחזור, סרוק את כל הקודים באפליקציית סריקה והדבק את הטקסט שלהם ב-**Restore from backup** (בכל סדר). האפליקציה לא סורקת במצלמה.

### חשוב
- ה-QR מכיל את ה-vault **מוצפן**. גם קריאה שלו בחזרה דורשת את סיסמת המאסטר.
- כל QR מסומן `SVQR:N/M:` לפי מקומו בסדרה.

### שחזור מגיבוי
זמין במסך הראשון כשאין vault, וב-**Settings → Sync** למיזוג לתוך vault פתוח. אפשר לפתוח:
- קובץ `.svault`, כולל Recovery Kit (מקלידים את משפט השחזור שלו);
- טקסט של קודי QR סרוקים.

במכשיר ריק, סיסמת הגיבוי הופכת לסיסמת המאסטר. אחרי שחזור Recovery Kit, החלף אותה בהגדרות. קבצים מצורפים לא נכללים בגיבויים האלה.

---

## Conflict Resolution

כשמורידים vault מ-WebDAV או מתיקיית סנכרון, שום דבר לא מוחלף עד שבוחרים:
1. הקלד את סיסמת המאסטר של ה-vault המרוחק, ואז תיפתח ההשוואה.
2. תראה רשימה:
   - 🔴 **Conflicts** — אותו entry עם שינויים בשני הצדדים
   - 🟡 **Local only** — קיים אצלך, לא במרוחק
   - 🔵 **Remote only** — קיים במרוחק, לא אצלך
   - ⚪ **Identical** — תואם בשני הצדדים
3. בחר אסטרטגיה:
   - **Merge (recommended)** — מאחד הכל, ולקונפליקטים בוחר את ה-`updatedAt` המאוחר יותר.
   - **Keep local** — ה-vault המקומי נשאר כמו שהוא. לעדכון השרת לחץ **Push**.
   - **Keep remote** — דורסים את המקומי.
4. **Apply resolution**.

---

## סנכרון WebDAV

### הגדרה
1. **Settings → Sync**.
2. הזן:
   - **WebDAV URL** — הכתובת המלאה של קובץ ה-vault (למשל `https://nextcloud.example.com/remote.php/webdav/vaultkin.svault`)
   - **Username**
   - **Password** (App password אם יש 2FA)
3. לחץ **Connect**.

### איך זה עובד?
- סנכרון WebDAV הוא ידני. השמירה האוטומטית לא מעלה אליו.
- **Push** מעלה את ה-vault המוצפן השמור. אם העותק בשרת השתנה מאז שה-vault הזה ראה אותו, האפליקציה מבקשת קודם Pull או אישור לדריסה. גם ה-Push הראשון לקובץ קיים מבקש זאת.
- **Pull** מוריד את הקובץ מהשרת, מבקש את סיסמת המאסטר שלו ופותח את מסך המיזוג.
- קבצים מצורפים לא מסונכרנים דרך WebDAV.

### שחזור מ-WebDAV במכשיר חדש
כתובת השרת ופרטי הכניסה שמורים בתוך ה-vault, ולכן מכשיר חדש לא מכיר אותם.
1. צור vault חדש.
2. ב-**Settings → Sync** הזן את ה-WebDAV URL, שם המשתמש והסיסמה, ולחץ **Connect**.
3. לחץ **Pull**. אל תבחר **Overwrite server copy**: זה יחליף את הגיבוי.
4. הקלד את סיסמת המאסטר של ה-vault המגובה.
5. בחר **Keep remote** ואשר. הרשומות יישמרו תחת סיסמת המאסטר של ה-vault החדש.
6. בדוק את הרשומות לפני Push.

### Credentials
- נשמרים **בתוך הכספת המוצפנת** (בהגדרות שלה), ולכן זמינים רק כשהכספת פתוחה ונמחקים מהזיכרון בנעילה.
- לא נשמרים ב-localStorage או ב-sessionStorage. גרסאות ישנות שמרו אותם ב-sessionStorage; הם מועברים לכספת ונמחקים משם אוטומטית.
- רק כתובות `https://`. סנכרון ב-http רגיל נחסם, כדי שסיסמת ה-WebDAV לא תישלח בגלוי.

---

## ייצוא וייבוא

### ייבוא
**Vault → Import**:
- **Bitwarden JSON**
- **LastPass CSV**
- **Generic CSV** (גם ל-1Password ול-KeePass: ייצא מהם ל-CSV. קובצי 1PUX ו-KeePass XML עדיין לא נתמכים)

זיהוי פורמט אוטומטי. בקונפליקטים: **Skip / Overwrite / Keep both**.

### ייצוא
- **Encrypted backup** (JSON) — אי אפשר לפתוח בלי הסיסמה. שמור בענן בלי דאגה.
- **CSV (לא מוצפן!)** — **רק לשימוש זמני להעברה**. מחק אחרי השימוש!
- **QR codes** — ראה למעלה.

---

## אבטחה תחת המכסה

```
Master Password
     │
     ▼
Argon2id (64 MiB, t=3, p=1)  ←──  random 32-byte salt
     │
     ▼ derives 64 bytes
┌────┴────┐
│ encKey  │ AES-256-GCM (vault encryption)
│ macKey  │ HMAC-SHA256  (header integrity)
└─────────┘

Encrypt-then-MAC:
    Vault JSON → AES-256-GCM(encKey, IV) → ciphertext
    Header (version, IV, salt, kdfParams) → HMAC-SHA256(macKey) → headerMac

VaultPayload = { version, magic, kdf, kdfParams, salt, iv, vaultId,
                 updatedAt, data: ciphertext, headerMac }

Verification on unlock:
    HMAC verify FIRST → fast-fail on tampering before decryption
    Then AES decrypt → JSON parse → return VaultData
```

### תכונות מרכזיות
- **TOTP**: RFC 6238 (תואם Google Authenticator, Authy).
- **CSP** ב-Electron: `default-src 'self'`, אין eval, אין iframes.
- **Sandbox + contextIsolation + nodeIntegration: false** ב-Electron.
- **Service Worker** לא מאחסן vault data — רק app shell.
- **Auto-lock** ב-5 דקות חוסר פעילות (קונפיגורבילי).
- **Memory wipe** של מפתחות סשן ב-lock (`Uint8Array.fill(0)`).

---

## פתרון בעיות

### "מסך שחור" כשפותחים את האפליקציה
**תוקן בגרסה הזו!** האפליקציה כעת עוטפת הכל ב-`ErrorBoundary` שיציג הודעה ידידותית במקום מסך ריק.
אם בכל זאת קורה:
1. `Ctrl+Shift+R` — refresh חזק.
2. F12 → Console — מה השגיאה?
3. בדוק ש-`pnpm install` רץ בהצלחה (יש לפעמים בעיות עם native modules).

### "Incorrect master password"
- וודא שאתה משתמש בסיסמה הנכונה.
- אם יש hint — הוא מוצג מעל השדה.
- אם הקלדת את ה-**duress password** בטעות — ה-vault שלך נמחק. בדוק את ה-trigger banner ב-Settings → Security.

### "Sync failed"
- שמירה לוקאלית הצליחה — ה-vault שלך מאובטח.
- בדוק WebDAV URL וcredentials.
- נסה שוב **Push** או **Pull**. אין ניסיון חוזר אוטומטי.

### פתיחה עם Windows Hello / Touch ID לא מוצעת
- הפעל **Remember this device** ב-Settings → Security.
- סיסמת המאסטר נדרשת לפחות פעם ב-14 ימים.

### Browser extension לא רואה entries
- בדוק שה-Extension ID נכון, לחץ שוב **Set up browser connection** ואז **Connect** בחלון ה-extension.
- וודא שהאפליקציה פתוחה וה-vault לא נעול.

---

## פיתוח ובדיקות

### Tests
```bash
pnpm test
pnpm test:coverage
```

### E2E
```bash
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:e2e:headed
pnpm test:e2e:electron
```

### Lint + typecheck
```bash
pnpm lint
pnpm typecheck
```

### CI
- כל push ל-`master` → typecheck + lint + tests + build (Linux/macOS/Windows).
- כל tag `v*.*.*` → builds Electron לכל הפלטפורמות + GitHub Release (draft).

---

## רישוי

**GPL-3.0-only**. ראה [LICENSE](../LICENSE).

באגים / הצעות → פתח issue ב-GitHub.

🔐 **Stay safe.**
