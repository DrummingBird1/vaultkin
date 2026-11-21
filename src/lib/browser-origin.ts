/** Human label for a paired extension origin (Chrome-family id or Firefox add-on id). */
export function describeExtensionOrigin(origin: string): string {
  if (origin.startsWith("moz-extension-id:"))
    return `Firefox · ${origin.slice("moz-extension-id:".length)}`;
  return origin.replace(/^chrome-extension:\/\//, "").replace(/\/$/, "");
}
