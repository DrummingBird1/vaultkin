import { describe, expect, it } from "vitest";
import en from "./locales/en.json";
import he from "./locales/he.json";

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix + key;
    if (typeof value === "string") out.set(path, value);
    else for (const [k, v] of flatten(value, path + ".")) out.set(k, v);
  }
  return out;
}

const placeholders = (s: string) => [
  ...new Set([...s.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1])),
];

// Plural forms may spell the number out (Hebrew "פעם אחת", "פעמיים"), so there the Hebrew
// string may drop placeholders, but must never introduce one English doesn't provide.
const PLURAL_KEY = /_(zero|one|two|few|many|other)$/;
function placeholdersMatch(key: string, enValue: string, heValue: string): boolean {
  const enP = placeholders(enValue);
  const heP = placeholders(heValue);
  if (PLURAL_KEY.test(key)) return heP.every((p) => enP.includes(p));
  return enP.sort().join() === heP.sort().join();
}

describe("locales", () => {
  const enKeys = flatten(en as Tree);
  const heKeys = flatten(he as Tree);

  it("en and he have exactly the same keys", () => {
    expect([...heKeys.keys()].sort()).toEqual([...enKeys.keys()].sort());
  });

  it("no Hebrew string is empty", () => {
    expect([...heKeys].filter(([, v]) => v.trim() === "").map(([k]) => k)).toEqual([]);
  });

  it("interpolation placeholders match between en and he", () => {
    const mismatched = [...enKeys]
      .filter(([k, v]) => heKeys.has(k) && !placeholdersMatch(k, v, heKeys.get(k)!))
      .map(([k]) => k);
    expect(mismatched).toEqual([]);
  });
});
