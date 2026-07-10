import type { CivicSignMode } from "@/lib/api/civic-helpers";

export interface SignSchemeDisplay {
  label: string;
  wireTag: string;
}

/** Human label + wire tag for the signing scheme shown in WYSIWYS technical rows. */
export function signSchemeDisplay(mode: CivicSignMode): SignSchemeDisplay {
  if (mode === "passkey") {
    return { label: "Passkey", wireTag: "webauthn-es256+uv" };
  }
  return { label: "Quick", wireTag: "p256" };
}
