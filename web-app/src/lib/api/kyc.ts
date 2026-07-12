/**
 * Hosted Didit KYC session client + public provider flag.
 */

import { apiGet, apiPost } from "./client";

export type KycProviderName = "stub" | "didit" | "equifax";
export type KycWorkflowKind = "identity" | "poa";

export interface DiditSessionStart {
  sessionId: string;
  url: string;
}

export interface DiditSessionStatus {
  status: string;
  tier: string | null;
}

export async function fetchKycProvider(): Promise<KycProviderName> {
  try {
    const body = await apiGet<{ provider: KycProviderName }>("/v1/public/kyc");
    return body?.provider ?? "stub";
  } catch {
    return "stub";
  }
}

export async function startDiditSession(
  workflowKind: KycWorkflowKind = "identity",
): Promise<DiditSessionStart> {
  const body = await apiPost<DiditSessionStart>("/v1/kyc/didit/session", { workflowKind });
  if (!body?.sessionId || !body.url) throw new Error("Didit session start returned empty body");
  return body;
}

export async function pollDiditSession(sessionId: string): Promise<DiditSessionStatus> {
  const body = await apiGet<DiditSessionStatus>(
    `/v1/kyc/didit/session/${encodeURIComponent(sessionId)}`,
  );
  if (!body?.status) throw new Error("Didit session poll returned empty body");
  return body;
}

/** Open hosted URL and poll until terminal status (or timeout). */
export async function runDiditHostedFlow(
  workflowKind: KycWorkflowKind,
  opts?: { pollMs?: number; maxWaitMs?: number },
): Promise<DiditSessionStatus> {
  const started = await startDiditSession(workflowKind);
  if (typeof window !== "undefined") {
    window.open(started.url, "_blank", "noopener,noreferrer");
  }
  const pollMs = opts?.pollMs ?? 4_000;
  const maxWaitMs = opts?.maxWaitMs ?? 15 * 60_000;
  const deadline = Date.now() + maxWaitMs;
  // First poll after a short delay so the hosted flow can start.
  await new Promise((r) => setTimeout(r, 2_000));
  while (Date.now() < deadline) {
    const status = await pollDiditSession(started.sessionId);
    if (
      status.status === "approved" ||
      status.status === "declined" ||
      status.status === "abandoned" ||
      status.status === "expired"
    ) {
      return status;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error("Verification timed out — try again from your profile.");
}

export async function startRecoveryKycSession(): Promise<DiditSessionStart> {
  const body = await apiPost<DiditSessionStart>("/v1/auth/recovery/kyc/session", {});
  if (!body?.sessionId || !body.url) throw new Error("Recovery KYC session start returned empty body");
  return body;
}

export interface RecoveryKycPollResult {
  status: string;
  tier?: string | null;
  passkeyReenroll?: {
    userId: string;
    session: { token: string; scope: string; userId: string; expiresAt: string };
  } | null;
}

export async function pollRecoveryKycSession(sessionId: string): Promise<RecoveryKycPollResult> {
  const body = await apiGet<RecoveryKycPollResult>(
    `/v1/auth/recovery/kyc/session/${encodeURIComponent(sessionId)}`,
  );
  if (!body?.status) throw new Error("Recovery KYC poll returned empty body");
  return body;
}

export async function runRecoveryKycFlow(opts?: {
  pollMs?: number;
  maxWaitMs?: number;
}): Promise<RecoveryKycPollResult> {
  const started = await startRecoveryKycSession();
  if (typeof window !== "undefined") {
    window.open(started.url, "_blank", "noopener,noreferrer");
  }
  const pollMs = opts?.pollMs ?? 4_000;
  const maxWaitMs = opts?.maxWaitMs ?? 15 * 60_000;
  const deadline = Date.now() + maxWaitMs;
  await new Promise((r) => setTimeout(r, 2_000));
  while (Date.now() < deadline) {
    const status = await pollRecoveryKycSession(started.sessionId);
    if (
      status.status === "approved" ||
      status.status === "declined" ||
      status.status === "abandoned" ||
      status.status === "expired"
    ) {
      return status;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error("Biometric recovery timed out — try again.");
}
