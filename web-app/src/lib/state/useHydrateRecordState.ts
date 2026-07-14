"use client";

import { useEffect, useMemo } from "react";
import { useApp } from "./AppProvider";

/** Fetch viewer record-state markers (`_my`, votes, shares) for the listed record ids. */
export function useHydrateRecordState(ids: string[]): void {
  const { hydrateRecordState } = useApp();
  // Derive a content key so a new [] / map() each render does not thrash.
  const key = useMemo(
    () => [...new Set(ids)].sort().join("\0"),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional content key
    [ids.join("\0")],
  );

  useEffect(() => {
    if (!key) return;
    hydrateRecordState(key.split("\0"));
  }, [hydrateRecordState, key]);
}
