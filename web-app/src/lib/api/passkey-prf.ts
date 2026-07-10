/**
 * Account passkey authentication with a bundled PRF probe for civic custody bootstrap.
 * Uses raw WebAuthn so extension results (PRF) are available in the same gesture as login.
 */

import {
  base64URLStringToBuffer,
  bufferToBase64URLString,
} from "@simplewebauthn/browser";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { OURSAY_PRF_SALT } from "@oursay/identity/client/browser";
import { bytesToHex } from "@noble/hashes/utils";

export interface AuthWithPrfResult {
  response: AuthenticationResponseJSON;
  credentialIdHex: string;
  prfRoot: Uint8Array | null;
}

function toAuthenticationResponseJSON(cred: PublicKeyCredential): AuthenticationResponseJSON {
  const r = cred.response as AuthenticatorAssertionResponse;
  return {
    id: cred.id,
    rawId: bufferToBase64URLString(cred.rawId),
    response: {
      authenticatorData: bufferToBase64URLString(r.authenticatorData),
      clientDataJSON: bufferToBase64URLString(r.clientDataJSON),
      signature: bufferToBase64URLString(r.signature),
      userHandle: r.userHandle ? bufferToBase64URLString(r.userHandle) : undefined,
    },
    type: cred.type as "public-key",
    clientExtensionResults: cred.getClientExtensionResults(),
    authenticatorAttachment: (cred.authenticatorAttachment ?? undefined) as AuthenticationResponseJSON["authenticatorAttachment"],
  };
}

/** Login with PRF extension evaluated in the same WebAuthn assertion. */
export async function authenticateWithPrfProbe(
  optionsJSON: PublicKeyCredentialRequestOptionsJSON,
): Promise<AuthWithPrfResult> {
  if (typeof navigator === "undefined" || !navigator.credentials) {
    throw new Error("WebAuthn is not available in this environment");
  }

  const allowCredentials = optionsJSON.allowCredentials?.map((c) => ({
    type: "public-key" as const,
    id: base64URLStringToBuffer(c.id),
    transports: c.transports,
  }));

  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: base64URLStringToBuffer(optionsJSON.challenge),
      rpId: optionsJSON.rpId,
      timeout: optionsJSON.timeout,
      userVerification: optionsJSON.userVerification ?? "preferred",
      ...(allowCredentials?.length ? { allowCredentials } : {}),
      extensions: {
        prf: { eval: { first: OURSAY_PRF_SALT } },
      } as AuthenticationExtensionsClientInputs,
    } as PublicKeyCredentialRequestOptions,
  })) as PublicKeyCredential | null;

  if (!cred) throw new Error("Passkey authentication cancelled");

  const prfBuf = cred.getClientExtensionResults().prf?.results?.first;
  const prfRoot = prfBuf ? new Uint8Array(prfBuf as ArrayBuffer) : null;
  const credentialIdHex = bytesToHex(new Uint8Array(cred.rawId));

  return {
    response: toAuthenticationResponseJSON(cred),
    credentialIdHex,
    prfRoot,
  };
}
