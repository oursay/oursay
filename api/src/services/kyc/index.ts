// KYC provider factory + re-exports. Selects the provider from config: "stub" (default, CI/dev, no
// network, awards the requested tier) or "equifax" (a RESERVED env slot that is NOT implemented —
// selecting it fails fast at startup, like the geocode "nominatim" slot). Any unknown value also fails
// fast rather than silently degrading. Mirrors services/geocode/index.ts.

import type { KycConfig } from "../../config.js";
import type { KycProvider } from "./provider.js";
import { StubKycProvider } from "./stub-provider.js";

export type { KycAttestation, KycProvider, KycVerifyRequest } from "./provider.js";
export { StubKycProvider } from "./stub-provider.js";

export function makeKycProvider(config: KycConfig): KycProvider {
  switch (config.provider) {
    case "stub":
      return new StubKycProvider();
    case "equifax":
      throw new Error(
        "KYC_PROVIDER=equifax is reserved but not implemented — wire a real provider (docs/01 §5), or " +
          "use KYC_PROVIDER=stub (the default; see api/README.md § KYC verification tiers).",
      );
    default:
      throw new Error(`Unknown KYC_PROVIDER=${String(config.provider)} (expected stub).`);
  }
}
