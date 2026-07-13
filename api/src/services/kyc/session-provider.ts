// Optional session-based KYC capability (Didit). Providers that only support direct verify() omit this.

import type { NormalizedAddress } from "../../helpers/address.js";

export type KycSessionWorkflowKind = "identity" | "poa" | "recovery";

/** Normalized session lifecycle — mapped defensively from vendor-specific statuses. */
export type KycSessionStatus = "pending" | "approved" | "declined" | "abandoned" | "expired" | "in_review";

export interface KycSessionStartInput {
  userId: string;
  workflowKind: KycSessionWorkflowKind;
}

export interface KycSessionStartResult {
  sessionId: string;
  url: string;
}

/** Ephemeral POA intake — never logged; not written onto the profile. */
export type EphemeralPoaLocation =
  | { kind: "coords"; lon: number; lat: number }
  | { kind: "address"; addr: NormalizedAddress };

export interface KycSessionDecision {
  sessionId: string;
  status: KycSessionStatus;
  workflowId: string;
  /** Coarse region tag for the attestation row — never precise coordinates or document fields. */
  region?: string | null;
  /** Ephemeral POA intake for private geocode — never logged or written onto the profile. */
  poaLocation?: EphemeralPoaLocation | null;
}

export interface KycWebhookEvent {
  sessionId: string;
  status: KycSessionStatus;
  eventId?: string;
}

export interface KycSessionProvider {
  readonly name: string;
  createSession(input: KycSessionStartInput): Promise<KycSessionStartResult>;
  fetchDecision(sessionId: string): Promise<KycSessionDecision>;
  verifyWebhook(rawBody: string, headers: Record<string, string | undefined>): boolean;
  parseWebhookEvent(rawBody: string): KycWebhookEvent | null;
}

export function isKycSessionProvider(p: unknown): p is KycSessionProvider {
  return (
    typeof p === "object" &&
    p !== null &&
    typeof (p as KycSessionProvider).createSession === "function" &&
    typeof (p as KycSessionProvider).fetchDecision === "function"
  );
}
