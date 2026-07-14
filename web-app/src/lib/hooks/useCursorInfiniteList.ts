"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CursorPage } from "@/lib/api/pagination";

export interface UseCursorInfiniteListOptions<T> {
  /** Resets the list when this key changes (filters, tab, route param, etc.). */
  resetKey: unknown;
  /** When false, clears items and skips fetching. */
  enabled?: boolean;
  fetchPage: (cursor: string | null) => Promise<CursorPage<T>>;
  getItemId: (item: T) => string;
  /** Called after each merge with the full accumulated list. */
  onItemsChange?: (items: T[]) => void;
}

export interface UseCursorInfiniteListResult<T> {
  items: T[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  /** Filtered list size when the API/mock reports it (browse-list `page.total`). */
  total: number | null;
  loadMore: () => void;
}

function mergeUnique<T>(prev: T[], next: T[], getItemId: (item: T) => string): T[] {
  if (next.length === 0) return prev;
  const seen = new Set(prev.map(getItemId));
  const merged = [...prev];
  for (const item of next) {
    const id = getItemId(item);
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(item);
  }
  return merged;
}

export function useCursorInfiniteList<T>({
  resetKey,
  enabled = true,
  fetchPage,
  getItemId,
  onItemsChange,
}: UseCursorInfiniteListOptions<T>): UseCursorInfiniteListResult<T> {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);

  const cursorRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const enabledRef = useRef(enabled);
  const fetchPageRef = useRef(fetchPage);
  const getItemIdRef = useRef(getItemId);
  const onItemsChangeRef = useRef(onItemsChange);
  enabledRef.current = enabled;
  fetchPageRef.current = fetchPage;
  getItemIdRef.current = getItemId;
  onItemsChangeRef.current = onItemsChange;

  useEffect(() => {
    if (!enabled) {
      cursorRef.current = null;
      inFlightRef.current = false;
      setItems((prev) => (prev.length === 0 ? prev : []));
      setLoading((prev) => (prev ? false : prev));
      setLoadingMore((prev) => (prev ? false : prev));
      setHasMore((prev) => (prev ? false : prev));
      setError((prev) => (prev == null ? prev : null));
      setTotal((prev) => (prev == null ? prev : null));
      onItemsChangeRef.current?.([]);
      return;
    }

    let active = true;
    cursorRef.current = null;
    inFlightRef.current = true;
    setItems([]);
    setLoading(true);
    setLoadingMore(false);
    setHasMore(false);
    setError(null);
    setTotal(null);
    onItemsChangeRef.current?.([]);

    fetchPageRef
      .current(null)
      .then((page) => {
        if (!active) return;
        setItems(page.items);
        onItemsChangeRef.current?.(page.items);
        cursorRef.current = page.nextCursor;
        setHasMore(page.nextCursor !== null);
        if (typeof page.total === "number") setTotal(page.total);
      })
      .catch((e: unknown) => {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!active) return;
        inFlightRef.current = false;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [resetKey, enabled]);

  const loadMore = useCallback(() => {
    if (!enabledRef.current || inFlightRef.current || !cursorRef.current) return;
    inFlightRef.current = true;
    setLoadingMore(true);
    setError(null);
    const cursor = cursorRef.current;

    fetchPageRef
      .current(cursor)
      .then((page) => {
        setItems((prev) => {
          const merged = mergeUnique(prev, page.items, getItemIdRef.current);
          onItemsChangeRef.current?.(merged);
          return merged;
        });
        cursorRef.current = page.nextCursor;
        setHasMore(page.nextCursor !== null);
        if (typeof page.total === "number") setTotal(page.total);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Failed to load more");
      })
      .finally(() => {
        inFlightRef.current = false;
        setLoadingMore(false);
      });
  }, []);

  return { items, loading, loadingMore, hasMore, error, total, loadMore };
}
