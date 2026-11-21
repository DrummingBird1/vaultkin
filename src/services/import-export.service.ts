/**
 * @file src/services/import-export.service.ts
 * Multi-format importer + CSV exporter. MVP: CSV import + Bitwarden JSON
 * import + CSV export. Other formats degrade to CSV-like parsing.
 */
import type { VaultEntry, CustomField } from "../core/vault/schema";

export type ImportFormat = "bitwarden" | "1password" | "lastpass" | "keepass" | "csv" | "unknown";

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
  entries: Partial<VaultEntry>[];
}

export const ImportExportService = {
  detectFormat(content: string): ImportFormat {
    const c = content.trim();
    if (c.startsWith("{") || c.startsWith("[")) {
      try {
        const parsed = JSON.parse(c);
        if (parsed.encrypted === false || Array.isArray(parsed.items)) return "bitwarden";
        if (Array.isArray(parsed) && parsed[0]?.tags) return "1password";
        return "bitwarden";
      } catch {
        return "unknown";
      }
    }
    if (c.startsWith("<?xml") || c.includes("<KeePassFile")) return "keepass";
    if (c.includes(",") && c.split("\n").length > 1) {
      const header = c.split("\n")[0].toLowerCase();
      if (header.includes("url") && header.includes("password")) {
        return header.includes("name") && header.includes("grouping") ? "lastpass" : "csv";
      }
      return "csv";
    }
    return "unknown";
  },

  async import(content: string, format: ImportFormat): Promise<ImportResult> {
    const errors: string[] = [];
    let entries: Partial<VaultEntry>[] = [];

    try {
      if (format === "bitwarden") entries = parseBitwarden(content);
      else if (format === "csv" || format === "lastpass") entries = parseCSV(content);
      else if (format === "keepass")
        errors.push("KeePass XML not yet supported in MVP — export to CSV instead.");
      else if (format === "1password")
        errors.push("1Password 1pux not yet supported in MVP — export to CSV instead.");
      else errors.push("Unknown format.");
    } catch (e: any) {
      errors.push(`Parse error: ${e?.message ?? String(e)}`);
    }

    return {
      imported: entries.length,
      skipped: 0,
      errors,
      entries,
    };
  },

  exportCSV(entries: VaultEntry[]): string {
    const header = "title,username,password,url,notes,totpSecret,category,tags";
    const rows = entries.map((e) =>
      [
        e.title,
        e.username ?? "",
        e.password ?? "",
        e.url ?? "",
        (e.notes ?? "").replace(/\n/g, "\\n"),
        e.totpSecret ?? "",
        e.category,
        e.tags.join("|"),
      ]
        .map(csvEscape)
        .join(","),
    );
    return [header, ...rows].join("\n");
  },
};

function csvEscape(v: string): string {
  if (v.includes(",") || v.includes('"') || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function parseCSV(content: string): Partial<VaultEntry>[] {
  const lines = content.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().trim());

  const col = (row: string[], name: string): string | undefined => {
    const idx = headers.indexOf(name);
    return idx >= 0 ? row[idx] : undefined;
  };

  const out: Partial<VaultEntry>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    out.push({
      type: "login",
      title: col(row, "name") ?? col(row, "title") ?? "Imported",
      username: col(row, "username") ?? col(row, "user") ?? col(row, "login"),
      password: col(row, "password") ?? col(row, "pass"),
      url: col(row, "url") ?? col(row, "uri") ?? col(row, "website"),
      notes: col(row, "notes") ?? col(row, "extra"),
      totpSecret: col(row, "totp") ?? col(row, "otpauth"),
      category: "websites",
      tags: (col(row, "tags") ?? col(row, "grouping") ?? "").split(/[|,]/).filter(Boolean),
      favorite: false,
      customFields: [] as CustomField[],
    });
  }
  return out;
}

function parseCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = "",
    inQ = false,
    i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 2;
        continue;
      }
      if (ch === '"') {
        inQ = false;
        i++;
        continue;
      }
      cur += ch;
      i++;
    } else {
      if (ch === '"') {
        inQ = true;
        i++;
        continue;
      }
      if (ch === ",") {
        out.push(cur);
        cur = "";
        i++;
        continue;
      }
      cur += ch;
      i++;
    }
  }
  out.push(cur);
  return out;
}

function parseBitwarden(content: string): Partial<VaultEntry>[] {
  const data = JSON.parse(content);
  const items: any[] = Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : [];
  return items.map((item) => ({
    type: "login" as const,
    title: item.name ?? "Imported",
    username: item.login?.username,
    password: item.login?.password,
    url: item.login?.uris?.[0]?.uri,
    notes: item.notes,
    totpSecret: item.login?.totp,
    category: "websites" as const,
    tags: Array.isArray(item.tags) ? item.tags : [],
    favorite: !!item.favorite,
    customFields: [],
  }));
}
