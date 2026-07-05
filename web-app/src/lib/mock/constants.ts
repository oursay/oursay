/**
 * Deterministic "now" for relTime() in tests and mock rendering. Matches the
 * wireframe's NOW so every relative timestamp resolves identically.
 */
export const NOW = new Date("2026-06-30T09:41:00");

/** The example signed-in account's display name (wireframe MY_NAME). */
export const MY_NAME = "Alex Morgan";

/** The example signed-in account's handle (single source of truth). */
export const MY_HANDLE = "alex_morgan";

/** The example signed-in resident's home riding slug(s) (wireframe MY_DISTRICTS). */
export const MY_DISTRICTS = ["edmonton-strathcona"];
