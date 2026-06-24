// Pluggable geocoding provider: "normalized address -> point + confidence" (or null when the address
// cannot be resolved). Providers are best-effort and structural — they prove an address RESOLVES to a
// location, not residency or KYC. A provider must NEVER throw for an ordinary "no result" outcome;
// it returns null so the caller can treat geocoding as non-fatal. Coordinates returned here are
// PRIVATE PII and must never reach an HTTP response, OpenAPI schema, or log.

import type { NormalizedAddress } from "../../helpers/address.js";

export interface GeocodeHit {
  lon: number;
  lat: number;
  /** Provider-reported confidence/accuracy in [0,1], or null when the provider gives none. */
  confidence: number | null;
}

export interface GeocodeProvider {
  /** Stable provider name persisted on the cache row (e.g. "stub", "geocodio"). */
  readonly name: string;
  /** Resolve a Canadian address to a point, or null if unresolvable. Non-throwing for "no result". */
  geocode(addr: NormalizedAddress): Promise<GeocodeHit | null>;
}
