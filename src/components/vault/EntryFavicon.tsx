/**
 * @file src/components/vault/EntryFavicon.tsx
 * Best-effort favicon for an entry's domain, falling back to a letter
 * avatar. Domains that have already failed to load a favicon are cached
 * module-wide (not per-component) so scrolling a long list doesn't repeat
 * the same failing network request over and over, and a newly-mounted card
 * for a domain we already know fails skips straight to the fallback instead
 * of flashing a broken-image state first.
 */
import React, { useState } from "react";

const knownFailedDomains = new Set<string>();

function extractDomain(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    // Entries commonly have a bare domain without a scheme ("github.com").
    try {
      return new URL(`https://${url}`).hostname;
    } catch {
      return null;
    }
  }
}

export function EntryFavicon({
  title,
  url,
  className,
}: {
  title: string;
  url?: string;
  className?: string;
}) {
  const domain = extractDomain(url);
  const [failed, setFailed] = useState(() => !!domain && knownFailedDomains.has(domain));

  if (!domain || failed) {
    return (
      <div
        className={`flex items-center justify-center font-bold text-(--accent-text) ${className ?? ""}`}
      >
        {title[0]?.toUpperCase() ?? "?"}
      </div>
    );
  }

  return (
    <img
      src={`https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domain)}`}
      alt=""
      aria-hidden="true"
      className={`object-contain ${className ?? ""}`}
      onError={() => {
        knownFailedDomains.add(domain);
        setFailed(true);
      }}
    />
  );
}
