/**
 * @file src/components/vault/EntryItem.types.ts
 * Shared prop shape for EntryCard/EntryRow (grid/list view item renderers).
 */
import type { VaultEntry } from "../../core/vault/schema";

export interface EntryItemProps {
  entry: VaultEntry;
  selected: boolean;
  query: string;
  onClick: () => void;
  onFavorite: () => void;
}
