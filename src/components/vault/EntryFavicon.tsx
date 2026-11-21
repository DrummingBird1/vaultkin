/**
 * @file src/components/vault/EntryFavicon.tsx
 * Avatar for an entry: the first letter of its title.
 *
 * Deliberately no remote favicons. Earlier versions loaded
 * google.com/s2/favicons?domain=<site> for every entry, which told a third
 * party which sites are in the vault (contrary to invariant #1), and the
 * production CSP blocks remote images anyway. If icons come back, they must
 * be fetched only with the user's explicit opt-in, from a source the
 * privacy policy names.
 */
import React from "react";

export function EntryFavicon({
  title,
  className,
}: {
  title: string;
  url?: string;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`flex items-center justify-center font-bold text-(--accent-text) ${className ?? ""}`}
    >
      {title.trim()[0]?.toUpperCase() ?? "?"}
    </div>
  );
}
