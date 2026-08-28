/**
 * @file src/hooks/useDragReorder.ts
 * HTML5 drag-and-drop reordering helper. Auto-disables while a search query
 * is active (results would shuffle confusingly).
 */
import { useCallback, useRef, useState } from "react";

export function useDragReorder(opts: {
  disabled?: boolean;
  onReorder: (fromId: string, toId: string) => void;
}) {
  const draggedId = useRef<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const onDragStart = useCallback((id: string) => (e: React.DragEvent) => {
    if (opts.disabled) return;
    draggedId.current = id;
    e.dataTransfer.effectAllowed = "move";
  }, [opts.disabled]);

  const onDragOver = useCallback((id: string) => (e: React.DragEvent) => {
    if (opts.disabled) return;
    e.preventDefault();
    if (overId !== id) setOverId(id);
  }, [opts.disabled, overId]);

  const onDrop = useCallback((id: string) => (e: React.DragEvent) => {
    if (opts.disabled) return;
    e.preventDefault();
    if (draggedId.current && draggedId.current !== id) {
      opts.onReorder(draggedId.current, id);
    }
    draggedId.current = null;
    setOverId(null);
  }, [opts]);

  const onDragEnd = useCallback(() => {
    draggedId.current = null;
    setOverId(null);
  }, []);

  return { onDragStart, onDragOver, onDrop, onDragEnd, overId };
}
