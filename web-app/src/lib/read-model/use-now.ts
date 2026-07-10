"use client";

import { useEffect, useState } from "react";

/** Tick interval for refreshing relative timestamps on screen. */
const TICK_MS = 60_000;

/**
 * Live clock for `relTime()` in production UI. Re-ticks every minute so labels
 * advance (e.g. "just now" → "2m ago") without a full page reload.
 */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  return now;
}
