"use client";

import { useCallback, useMemo, useRef } from "react";
import { PAGE_SIZE, sliceLocalPage } from "@/lib/api/pagination";
import {
  useCursorInfiniteList,
  type UseCursorInfiniteListResult,
} from "./useCursorInfiniteList";

export interface UseLocalInfiniteListOptions<T> {
  items: T[];
  getItemId: (item: T) => string;
  enabled?: boolean;
  pageSize?: number;
  onItemsChange?: (items: T[]) => void;
}

/** Paginate an in-memory list (official/persona bundled tabs). */
export function useLocalInfiniteList<T>({
  items,
  getItemId,
  enabled = true,
  pageSize = PAGE_SIZE,
  onItemsChange,
}: UseLocalInfiniteListOptions<T>): UseCursorInfiniteListResult<T> {
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Prefer content identity over array reference — parents often pass
  // `profile?.comments ?? []` which allocates a new [] every render.
  const resetKey = useMemo(
    () => items.map(getItemId).join("\0"),
    // getItemId is intentionally omitted; identity of the list contents matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getItemId via call
    [items],
  );

  const fetchPage = useCallback(
    async (cursor: string | null) =>
      sliceLocalPage(itemsRef.current, cursor, pageSize),
    [pageSize],
  );

  return useCursorInfiniteList({
    resetKey,
    enabled,
    fetchPage,
    getItemId,
    onItemsChange,
  });
}
