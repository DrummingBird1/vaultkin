import type { VaultEntry } from "../../../core/vault/schema";

export interface EntryViewProps {
  entries: VaultEntry[];
  selectedId: string | null;
  /** Current search text, for highlighting. */
  query: string;
  /** Toggle selection: called with the clicked entry's id. */
  onSelect: (id: string) => void;
  onFavorite: (id: string) => void;
}
