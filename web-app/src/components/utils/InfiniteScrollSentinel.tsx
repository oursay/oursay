"use client";

import { useEffect, useRef } from "react";

export function InfiniteScrollSentinel({
  onVisible,
  disabled = false,
  root = null,
  rootMargin = "240px",
  /** Re-check intersection when this changes (e.g. after each page append). */
  watchKey,
}: {
  onVisible: () => void;
  disabled?: boolean;
  root?: Element | null;
  rootMargin?: string;
  watchKey?: unknown;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const onVisibleRef = useRef(onVisible);
  onVisibleRef.current = onVisible;

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || disabled) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onVisibleRef.current();
        }
      },
      { root, rootMargin, threshold: 0 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [disabled, root, rootMargin, watchKey]);

  return <div ref={sentinelRef} aria-hidden className="h-px w-full" />;
}

export function InfiniteScrollFooter({
  loading,
  loadingMore,
  error,
  hasMore,
  empty,
}: {
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  empty?: boolean;
}) {
  if (error) {
    return <p className="py-3 text-center text-sm text-red-600">{error}</p>;
  }
  if (loading && empty) {
    return <p className="py-3 text-center text-sm text-muted">Loading…</p>;
  }
  if (loadingMore || (loading && !empty)) {
    return <p className="py-3 text-center text-sm text-muted">Loading more…</p>;
  }
  if (!hasMore && !empty) {
    return null;
  }
  return null;
}
