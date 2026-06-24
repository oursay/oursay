// Optional real provider: Geocodio (https://www.geocod.io). Canada-capable, permissive caching terms,
// API-key gated. Minimal `fetch` client — no SDK. It is deliberately non-throwing for control flow:
// any error (network, non-200, no result), a non-Canadian result, or a result coarser than
// street-level resolves to null so the caller treats it as "unresolved" (best-effort, never fatal).
//
// Not exercised by the test suite (CI uses the stub); this is the documented production path.

import type { NormalizedAddress } from "../../helpers/address.js";
import type { GeocodeHit, GeocodeProvider } from "./provider.js";

// geocodio accuracy_type values we accept as "street-level or better"; coarser matches (place / county /
// state / country) are rejected so a vague result never masquerades as a real location.
const STREET_OR_BETTER = new Set([
  "rooftop",
  "point",
  "range_interpolation",
  "nearest_rooftop_match",
  "intersection",
  "street_center",
]);

interface GeocodioResult {
  location?: { lat?: number; lng?: number };
  accuracy?: number;
  accuracy_type?: string;
  address_components?: { country?: string };
}

export interface GeocodioOptions {
  apiKey: string;
  timeoutMs: number;
  /** API base; defaults to the current geocodio version host. Overridable for a proxy/self-host. */
  baseUrl?: string;
}

export class GeocodioProvider implements GeocodeProvider {
  readonly name = "geocodio";
  private readonly base: string;

  constructor(private readonly opts: GeocodioOptions) {
    this.base = (opts.baseUrl ?? "https://api.geocod.io/v1.7").replace(/\/+$/, "");
  }

  async geocode(addr: NormalizedAddress): Promise<GeocodeHit | null> {
    if (addr.country !== "CA") return null;
    if (!this.opts.apiKey) return null;

    const params = new URLSearchParams({ api_key: this.opts.apiKey, country: "Canada", limit: "1" });
    if (addr.line1) params.set("street", addr.line1);
    if (addr.city) params.set("city", addr.city);
    if (addr.province) params.set("state", addr.province);
    if (addr.postalCode) params.set("postal_code", addr.postalCode);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.opts.timeoutMs);
    try {
      const res = await fetch(`${this.base}/geocode?${params.toString()}`, { signal: ctrl.signal });
      if (!res.ok) return null;
      const body = (await res.json()) as { results?: GeocodioResult[] };
      const top = body.results?.[0];
      if (!top?.location || typeof top.location.lat !== "number" || typeof top.location.lng !== "number") {
        return null;
      }
      const country = top.address_components?.country;
      if (country && country !== "CA" && country !== "Canada") return null;
      if (top.accuracy_type && !STREET_OR_BETTER.has(top.accuracy_type)) return null;
      return {
        lon: top.location.lng,
        lat: top.location.lat,
        confidence: typeof top.accuracy === "number" ? top.accuracy : null,
      };
    } catch {
      return null; // network error / timeout / parse — non-fatal
    } finally {
      clearTimeout(timer);
    }
  }
}
