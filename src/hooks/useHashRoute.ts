/**
 * @file useHashRoute.ts
 * Keeps ui.store's activePage/activeSection in sync with location.hash:
 * reads the hash on mount (deep link / reload) and on Back/Forward.
 * Writing happens in ui.store.setActivePage.
 */
import { useEffect } from "react";
import { useUIStore } from "../store/ui.store";
import { formatHash, parseHash } from "../lib/route";

export function useHashRoute(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const sync = () => {
      const r = parseHash(window.location.hash);
      const { activePage, activeSection, applyRoute } = useUIStore.getState();
      if (r) {
        if (r.page !== activePage || (r.section ?? null) !== activeSection)
          applyRoute(r.page, r.section);
      } else {
        // Unknown/empty hash: reflect current state without adding history.
        window.history.replaceState(
          null,
          "",
          formatHash({ page: activePage, section: activeSection ?? undefined }),
        );
      }
    };
    sync();
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
    };
  }, [enabled]);
}
