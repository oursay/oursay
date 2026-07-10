// KYC provider factory + re-exports. Selects the provider from config: "stub" (default, CI/dev),
// "didit" (hosted Didit sessions), or "equifax" (reserved — fails fast). Mirrors services/geocode/index.ts.

import type { KycConfig } from "../../config.js";
import { DiditKycProvider } from "./didit-provider.js";
import type { KycProvider } from "./provider.js";
import type { KycSessionProvider } from "./session-provider.js";
import { isKycSessionProvider } from "./session-provider.js";
import { StubKycProvider } from "./stub-provider.js";

export type { KycAttestation, KycProvider, KycVerifyRequest } from "./provider.js";
export type {
  KycSessionProvider,
  KycSessionStatus,
  KycSessionWorkflowKind,
} from "./session-provider.js";
export { StubKycProvider } from "./stub-provider.js";
export { DiditKycProvider } from "./didit-provider.js";
export { DiditClient, mapDiditStatus, diditWebhookSignatureV2 } from "./didit-client.js";

export interface KycProviderStack {
  provider: KycProvider;
  sessionProvider: KycSessionProvider | null;
  diditProvider?: DiditKycProvider;
}

export function makeKycProvider(config: KycConfig): KycProvider {
  return makeKycProviderStack(config).provider;
}

export function makeKycProviderStack(config: KycConfig): KycProviderStack {
  switch (config.provider) {
    case "stub":
      return { provider: new StubKycProvider(), sessionProvider: null };
    case "didit": {
      const didit = new DiditKycProvider(config.didit);
      return { provider: didit, sessionProvider: didit, diditProvider: didit };
    }
    case "equifax":
      throw new Error(
        "KYC_PROVIDER=equifax is reserved but not implemented — wire a real provider (docs/01 §5), or " +
          "use KYC_PROVIDER=stub (the default) or KYC_PROVIDER=didit.",
      );
    default:
      throw new Error(`Unknown KYC_PROVIDER=${String(config.provider)} (expected stub|didit|equifax).`);
  }
}

/** @deprecated use makeKycProviderStack when session capability is needed */
export function sessionProviderFrom(stack: KycProviderStack): KycSessionProvider | null {
  return isKycSessionProvider(stack.sessionProvider) ? stack.sessionProvider : null;
}
