// Geocode provider factory + re-exports. Selects the provider from config: "stub" (default, CI/dev,
// no network) or "geocodio" (optional real, API-key gated). "nominatim" is a RESERVED env slot that is
// NOT implemented — selecting it fails fast at startup (a self-hosted Nominatim is future work; see
// api/README.md "Geocoding"). Any unknown value also fails fast rather than silently degrading.

import type { GeocodeConfig } from "../../config.js";
import { GeocodioProvider } from "./geocodio-provider.js";
import type { GeocodeProvider } from "./provider.js";
import { StubGeocodeProvider } from "./stub-provider.js";

export type { GeocodeHit, GeocodeProvider } from "./provider.js";
export { StubGeocodeProvider } from "./stub-provider.js";
export { GeocodioProvider } from "./geocodio-provider.js";

export function makeGeocodeProvider(config: GeocodeConfig): GeocodeProvider {
  switch (config.provider) {
    case "stub":
      return new StubGeocodeProvider();
    case "geocodio":
      return new GeocodioProvider({ apiKey: config.apiKey, timeoutMs: config.timeoutMs });
    case "nominatim":
      throw new Error(
        "GEOCODE_PROVIDER=nominatim is reserved but not implemented — run a self-hosted Nominatim and " +
          "wire a provider, or use GEOCODE_PROVIDER=stub|geocodio (see api/README.md § Geocoding).",
      );
    default:
      throw new Error(`Unknown GEOCODE_PROVIDER=${String(config.provider)} (expected stub|geocodio).`);
  }
}
