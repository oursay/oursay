"use client";

import { useEffect, useMemo } from "react";
import { useApp } from "./AppProvider";

/** Fetch viewer record-state markers (`_my`, votes, shares) for the listed record ids. */
export function useHydrateRecordState(ids: string[]): void {
  const { hydrateRecordState } = useApp();
  const key = useMemo(() => [...new Set(ids)].sort().join("\0"), [ids]);

  useEffect(() => {
    if (!key) return;
    hydrateRecordState(key.split("\0"));
  }, [hydrateRecordState, key]);
}
