// Deterministic, network-free KYC provider for CI/dev — the verification analogue of
// StubGeocodeProvider. It performs NO real identity check: it simply awards the requested tier (so a
// test or manual QA can place a user at any tier) and echoes the optional region tag. No payment, no
// external API, no PII. The real provider (equifax) is selected via config and fails fast until wired.

import type { KycAttestation, KycProvider, KycVerifyRequest } from "./provider.js";

export class StubKycProvider implements KycProvider {
  readonly name = "stub";

  async verify(req: KycVerifyRequest): Promise<KycAttestation | null> {
    return { tier: req.requestedTier, region: req.region ?? null };
  }
}
