/**
 * @file src/components/vault/FolderSidebar.tsx
 * Nested-folder tree for organizing vault entries. Renders VaultFolder[]
 * (schema.ts's `parentId` field) as a real tree, not a flat list — click a
 * folder to filter by it, hover for a "new subfolder" action, delete
 * cascades to descendants (vault.store.ts's deleteFolder), never deletes
 * entries — they're just unfiled.
 */
import React, { useState, useMemo } from "react";
import { useVaultStore } from "../../store/vault.store";
import { IconFolder, IconFolderPlus, IconTrash, IconChevronRight, IconChevronDown } from "../icons";
import type { VaultFolder } from "../../core/vault/schema";

const INDENT_PX = 16;

interface TreeNode {
  folder: VaultFolder;
  children: TreeNode[];
}

function buildTree(folders: VaultFolder[]): TreeNode[] {
  const byId = new Map<string, TreeNode>(folders.map((f) => [f.id, { folder: f, children: [] }]));
  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.folder.parentId ? byId.get(node.folder.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sortByName = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.folder.name.localeCompare(b.folder.name));
    nodes.forEach((n) => sortByName(n.children));
  };
  sortByName(roots);
  return roots;
}

function FolderNode({
  node,
  depth,
  activeFolderId,
  onSelect,
  onDelete,
  onAddSubfolder,
}: {
  node: TreeNode;
  depth: number;
  activeFolderId: string | undefined;
  onSelect: (id: string) => void;
  onDelete: (id: string, name: string) => void;
  onAddSubfolder: (parentId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const active = activeFolderId === node.folder.id;

  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm cursor-pointer transition-colors ${
          active
            ? "bg-(--accent-dim) text-(--accent)"
            : "text-(--text-secondary) hover:bg-(--bg-elevated)"
        }`}
        style={{ paddingLeft: depth * INDENT_PX + 8 }}
        onClick={() => onSelect(node.folder.id)}
      >
        <button
          type="button"
          aria-label={expanded ? "Collapse" : "Expand"}
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className={`shrink-0 text-(--text-tertiary) ${hasChildren ? "" : "invisible"}`}
        >
          {expanded ? (
            <IconChevronDown className="w-3.5 h-3.5" />
          ) : (
            <IconChevronRight className="w-3.5 h-3.5" />
          )}
        </button>
        <IconFolder className="w-4 h-4 shrink-0" />
        <span className="flex-1 truncate">{node.folder.name}</span>
        <button
          type="button"
          aria-label={`New subfolder in ${node.folder.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onAddSubfolder(node.folder.id);
          }}
          className="opacity-0 group-hover:opacity-100 text-(--text-tertiary) hover:text-(--accent) shrink-0"
        >
          <IconFolderPlus className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          aria-label={`Delete folder ${node.folder.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(node.folder.id, node.folder.name);
          }}
          className="opacity-0 group-hover:opacity-100 text-(--text-tertiary) hover:text-(--danger) shrink-0"
        >
          <IconTrash className="w-3.5 h-3.5" />
        </button>
      </div>
      {expanded &&
        node.children.map((child) => (
          <FolderNode
            key={child.folder.id}
            node={child}
            depth={depth + 1}
            activeFolderId={activeFolderId}
            onSelect={onSelect}
            onDelete={onDelete}
            onAddSubfolder={onAddSubfolder}
          />
        ))}
    </div>
  );
}

export function FolderSidebar() {
  const { vault, searchQuery, setSearchQuery, addFolder, deleteFolder } = useVaultStore();
  const folders = vault?.folders ?? [];
  const tree = useMemo(() => buildTree(folders), [folders]);
  const activeFolderId = searchQuery.folderId;

  const handleSelect = (id: string) => {
    setSearchQuery({ folderId: searchQuery.folderId === id ? undefined : id });
  };

  const handleAddSubfolder = (parentId?: string) => {
    const name = window.prompt(parentId ? "New subfolder name" : "New folder name");
    if (name?.trim()) addFolder(name.trim(), undefined, parentId);
  };

  const handleDelete = (id: string, name: string) => {
    if (
      window.confirm(
        `Delete "${name}"? Subfolders are deleted too. Entries inside are kept, just unfiled.`,
      )
    ) {
      deleteFolder(id);
    }
  };

  return (
    <aside className="w-52 shrink-0 border-e border-(--border-subtle) p-3 flex flex-col gap-1 overflow-y-auto">
      <div className="flex items-center justify-between px-1 mb-1">
        <span className="text-xs font-medium uppercase tracking-wider text-(--text-tertiary)">
          Folders
        </span>
        <button
          type="button"
          aria-label="New folder"
          onClick={() => handleAddSubfolder(undefined)}
          className="text-(--text-tertiary) hover:text-(--accent)"
        >
          <IconFolderPlus className="w-4 h-4" />
        </button>
      </div>
      <button
        className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-start transition-colors ${
          !activeFolderId
            ? "bg-(--accent-dim) text-(--accent)"
            : "text-(--text-secondary) hover:bg-(--bg-elevated)"
        }`}
        onClick={() => setSearchQuery({ folderId: undefined })}
      >
        All items
      </button>
      {tree.map((node) => (
        <FolderNode
          key={node.folder.id}
          node={node}
          depth={0}
          activeFolderId={activeFolderId}
          onSelect={handleSelect}
          onDelete={handleDelete}
          onAddSubfolder={handleAddSubfolder}
        />
      ))}
    </aside>
  );
}
