// Didit KYC provider — session-based verification only; verify() is intentionally unused.

import type { DiditConfig } from "../../config.js";
import type { KycAttestation, KycProvider, KycVerifyRequest } from "./provider.js";
import {
  coarseRegionFromDecision,
  DiditClient,
  mapDiditStatus,
  type DiditFetch,
} from "./didit-client.js";
import type {
  KycSessionDecision,
  KycSessionProvider,
  KycSessionStartInput,
  KycSessionStartResult,
  KycSessionWorkflowKind,
  KycWebhookEvent,
} from "./session-provider.js";

export class DiditKycProvider implements KycProvider, KycSessionProvider {
  readonly name = "didit";
  private readonly client: DiditClient;

  constructor(
    private readonly cfg: DiditConfig,
    fetchImpl?: DiditFetch,
  ) {
    if (!cfg.apiKey) {
      throw new Error("DiditKycProvider requires DIDIT_API_KEY");
    }
    if (!cfg.workflowId) {
      throw new Error("DiditKycProvider requires DIDIT_WORKFLOW_ID");
    }
    this.client = new DiditClient(cfg, fetchImpl);
  }

  /** Didit awards tiers only through hosted sessions — never via direct verify(). */
  async verify(_req: KycVerifyRequest): Promise<KycAttestation | null> {
    return null;
  }

  async createSession(input: KycSessionStartInput): Promise<KycSessionStartResult> {
    const workflowId = this.workflowIdFor(input.workflowKind);
    const created = await this.client.createSession({
      workflowId,
      vendorData: input.userId,
      callback: this.cfg.callbackUrl || undefined,
    });
    return { sessionId: created.session_id, url: created.url };
  }

  async fetchDecision(sessionId: string): Promise<KycSessionDecision> {
    const decision = await this.client.fetchDecision(sessionId);
    return {
      sessionId: decision.session_id,
      status: mapDiditStatus(decision.status),
      workflowId: decision.workflow_id,
      region: coarseRegionFromDecision(decision),
    };
  }

  verifyWebhook(rawBody: string, headers: Record<string, string | undefined>): boolean {
    return this.client.verifyWebhook(rawBody, headers);
  }

  parseWebhookEvent(rawBody: string): KycWebhookEvent | null {
    return this.client.parseWebhookEvent(rawBody);
  }

  tierForApprovedWorkflow(workflowId: string): "identity_verified" | "residency_verified" | null {
    if (this.cfg.poaWorkflowId && workflowId === this.cfg.poaWorkflowId) return "residency_verified";
    if (workflowId === this.cfg.workflowId) return "identity_verified";
    // Recovery / biometric workflows unlock passkey re-enroll — they do not award a tier.
    return null;
  }

  private workflowIdFor(kind: KycSessionWorkflowKind): string {
    if (kind === "poa") {
      if (!this.cfg.poaWorkflowId) {
        throw new Error("DIDIT_WORKFLOW_POA is required for POA sessions");
      }
      return this.cfg.poaWorkflowId;
    }
    if (kind === "recovery") {
      if (!this.cfg.recoverWorkflowId) {
        throw new Error("DIDIT_WORKFLOW_RECOVER is required for recovery sessions");
      }
      return this.cfg.recoverWorkflowId;
    }
    return this.cfg.workflowId;
  }
}
