// Orchestrates session-based KYC: start hosted flow, poll/webhook decision, idempotent tier award.

import { randomUUID } from "node:crypto";
import { ServiceError } from "../errors.js";
import type { KycSessionRepo } from "../repo/kyc-session.repo.js";
import type { KycTier } from "../types/kyc.js";
import type { GeocodeService } from "./geocode.service.js";
import type { DiditKycProvider } from "./kyc/didit-provider.js";
import type {
  EphemeralPoaLocation,
  KycSessionProvider,
  KycSessionStatus,
  KycSessionWorkflowKind,
} from "./kyc/session-provider.js";
import type { KycService } from "./kyc.service.js";
import type { ParticipantGeoService } from "./participant-geo.service.js";

const POLL_MIN_INTERVAL_MS = 5_000;

export interface KycSessionServiceDeps {
  sessionProvider: KycSessionProvider | null;
  kycService: KycService;
  sessionRepo: KycSessionRepo;
  participantGeoService: ParticipantGeoService;
  geocodeService: GeocodeService;
  /** When the active provider is Didit, used to map workflow → tier on approval. */
  diditProvider?: DiditKycProvider;
}

export class KycSessionService {
  constructor(private readonly d: KycSessionServiceDeps) {}

  requireSessionProvider(): KycSessionProvider {
    if (!this.d.sessionProvider) {
      throw new ServiceError(
        "not_implemented",
        "The configured KYC provider does not support hosted verification sessions",
      );
    }
    return this.d.sessionProvider;
  }

  async startDiditSession(
    userId: string,
    workflowKind: KycSessionWorkflowKind = "identity",
  ): Promise<{ sessionId: string; url: string }> {
    const provider = this.requireSessionProvider();
    const started = await provider.createSession({ userId, workflowKind });
    await this.d.sessionRepo.insert({
      id: randomUUID(),
      userId,
      provider: provider.name,
      providerSessionId: started.sessionId,
      workflowKind,
      status: "pending",
    });
    return started;
  }

  async getDiditSessionStatus(
    userId: string,
    sessionId: string,
  ): Promise<{ status: KycSessionStatus; tier: KycTier | null }> {
    const row = await this.d.sessionRepo.getForUser(userId, sessionId);
    if (!row) throw new ServiceError("not_found", "KYC session not found");

    const provider = this.requireSessionProvider();
    const shouldPoll =
      !row.attestedAt &&
      row.status !== "declined" &&
      row.status !== "abandoned" &&
      row.status !== "expired" &&
      (!row.lastPolledAt || Date.now() - row.lastPolledAt.getTime() >= POLL_MIN_INTERVAL_MS);

    if (shouldPoll) {
      const decision = await provider.fetchDecision(sessionId);
      await this.d.sessionRepo.updateStatus(sessionId, decision.status);
      await this.d.sessionRepo.markPolled(sessionId);
      if (decision.status === "approved") {
        await this.applyApprovedSession(sessionId, decision.workflowId, decision.region ?? null, decision.poaLocation);
      }
      return { status: decision.status, tier: await this.tierAfterApproval(sessionId, decision.status) };
    }

    return {
      status: row.status,
      tier: row.attestedAt && row.workflowKind !== "recovery" ? await this.d.kycService.currentTier(userId) : null,
    };
  }

  /** Owned session row (for recovery unlock checks). */
  async getOwnedSession(userId: string, sessionId: string) {
    return this.d.sessionRepo.getForUser(userId, sessionId);
  }

  /** Platform self-attest residency when the user's private geocode point falls inside the jurisdiction. */
  async attestPlatformResidency(userId: string, jurisdictionId: string): Promise<{ tier: KycTier }> {
    const districtId = await this.d.participantGeoService.viewerDistrictId(userId, jurisdictionId);
    if (!districtId) {
      throw new ServiceError(
        "forbidden",
        "A verified address inside the jurisdiction is required before residency can be attested",
      );
    }
    return this.d.kycService.award(userId, "residency_verified", jurisdictionId, "platform");
  }

  async handleDiditWebhook(rawBody: string, headers: Record<string, string | undefined>): Promise<void> {
    const provider = this.requireSessionProvider();
    if (!provider.verifyWebhook(rawBody, headers)) {
      throw new ServiceError("unauthorized", "Invalid Didit webhook signature");
    }
    const event = provider.parseWebhookEvent(rawBody);
    if (!event) return;

    const row = await this.d.sessionRepo.getByProviderSessionId(event.sessionId);
    if (!row) return;

    await this.d.sessionRepo.updateStatus(event.sessionId, event.status);
    if (event.status === "approved") {
      const decision = await provider.fetchDecision(event.sessionId);
      await this.applyApprovedSession(
        event.sessionId,
        decision.workflowId,
        decision.region ?? null,
        decision.poaLocation,
      );
    }
  }

  private async applyApprovedSession(
    sessionId: string,
    workflowId: string,
    region: string | null,
    poaLocation?: EphemeralPoaLocation | null,
  ): Promise<void> {
    const row = await this.d.sessionRepo.getByProviderSessionId(sessionId);
    if (!row) return;

    const claimed = await this.d.sessionRepo.claimAttestation(sessionId);
    if (claimed) {
      // Biometric recovery: mark session consumed (attested_at) but do not append a KYC tier.
      if (claimed.workflowKind !== "recovery") {
        const tier = this.tierForWorkflow(workflowId, claimed.workflowKind);
        if (tier) {
          await this.d.kycService.award(claimed.userId, tier, region, claimed.provider);
        }
      }
    }

    const workflowKind = claimed?.workflowKind ?? row.workflowKind;
    const userId = claimed?.userId ?? row.userId;
    if (workflowKind === "poa") {
      try {
        await this.d.geocodeService.applyResidencyLocation(userId, poaLocation ?? null);
      } catch (e) {
        console.warn("[kyc] poa_geocode_error", {
          userId,
          error: e instanceof Error ? e.name : "unknown",
        });
      }
    }
  }

  private tierForWorkflow(workflowId: string, workflowKind: KycSessionWorkflowKind): KycTier | null {
    if (workflowKind === "recovery") return null;
    if (this.d.diditProvider) {
      const mapped = this.d.diditProvider.tierForApprovedWorkflow(workflowId);
      if (mapped) return mapped;
    }
    return workflowKind === "poa" ? "residency_verified" : "identity_verified";
  }

  private async tierAfterApproval(sessionId: string, status: KycSessionStatus): Promise<KycTier | null> {
    if (status !== "approved") return null;
    const row = await this.d.sessionRepo.getByProviderSessionId(sessionId);
    if (!row?.attestedAt || row.workflowKind === "recovery") return null;
    return this.d.kycService.currentTier(row.userId);
  }
}
