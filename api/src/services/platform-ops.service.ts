// Platform-ops prepare/submit: admin attests a clear request; platform signs the TxEnvelope and
// applies the mutable projection. Jurisdiction config, district, and roster projections commit in
// the same Postgres transaction as their record/outbox rows.

import { randomUUID } from "node:crypto";
import {
  PrivateStore,
  PublicChain,
  RecordService,
  canonicalJson,
  buildAndSignPlatformOpsEnvelope,
  buildPlatformOpsAdminAttestationP256,
  buildPlatformOpsContent,
  buildPlatformOpsRequest,
  platformOpsEntityId,
  platformOpsRequestHash,
  platformPublicKey,
  registerJurisdiction,
  requireJurisdiction,
  validatePlatformOpsPayload,
  verifyPlatformOpsAdminAttestation,
  type PlatformOpsAdminAttestation,
  type PlatformOpsKind,
  type PlatformOpsDistrictSnapshot,
  type PlatformOpsOfficialSeatSnapshot,
  type PlatformOpsRequest,
  type Ref,
} from "@oursay/public-record";
import type { GeoStore } from "@oursay/geo";
import type { PgWireLedgerConnector } from "@oursay/public-record";
import { civicConfig } from "../config.js";
import { ServiceError, systemNow, type Now } from "../errors.js";
import { cosePublicKeyToSec1Hex } from "../helpers/cose-pubkey.js";
import type { OpsSigningKeyRepo } from "../repo/ops-signing-key.repo.js";
import type { PasskeyRepo } from "../repo/passkey.repo.js";
import type { PlatformOpsPendingRepo } from "../repo/platform-ops-pending.repo.js";
import type { PlatformRoleRepo } from "../repo/platform-role.repo.js";
import type { JurisdictionConfigRepo } from "../repo/jurisdiction-config.repo.js";
import type { OfficialSeatClaimService } from "./official-seat-claim.service.js";

const PENDING_TTL_SEC = 300;

export interface PlatformOpsServiceDeps {
  pendingRepo: PlatformOpsPendingRepo;
  opsKeyRepo: OpsSigningKeyRepo;
  passkeyRepo: PasskeyRepo;
  platformRoleRepo: PlatformRoleRepo;
  jurisdictionConfigRepo: JurisdictionConfigRepo;
  geoStore: GeoStore;
  officialSeatClaimService: OfficialSeatClaimService;
  recordStore: PrivateStore;
  getLedger: (chainId: string) => Promise<PgWireLedgerConnector>;
  platformBindingPrivKeyHex: string;
  signedEnvelopeMaxAgeSec?: number;
  pendingTtlSec?: number;
  now?: Now;
}

export interface PlatformOpsPrepareResult {
  requestId: string;
  requestHash: string;
  clearMessage: PlatformOpsRequest;
  expiresAt: string;
}

export interface PlatformOpsSubmitResult extends Ref {
  kind: PlatformOpsKind;
  jurisdictionId: string;
}

export class PlatformOpsService {
  private readonly now: Now;
  private readonly pendingTtlSec: number;
  private readonly platformPubKeyHex: string;

  constructor(private readonly d: PlatformOpsServiceDeps) {
    this.now = d.now ?? systemNow;
    this.pendingTtlSec = d.pendingTtlSec ?? PENDING_TTL_SEC;
    this.platformPubKeyHex = platformPublicKey(d.platformBindingPrivKeyHex);
  }

  /** Require the caller to hold the platform `admin` role. */
  async assertAdmin(userId: string): Promise<void> {
    const ok = await this.d.platformRoleRepo.hasRole(userId, "admin");
    if (!ok) throw new ServiceError("forbidden", "platform admin role required");
  }

  async prepare(input: {
    preparedByUserId: string;
    kind: PlatformOpsKind;
    jurisdictionId: string;
    payload: Record<string, unknown>;
  }): Promise<PlatformOpsPrepareResult> {
    await this.assertAdmin(input.preparedByUserId);
    try {
      requireJurisdiction(input.jurisdictionId);
    } catch {
      throw new ServiceError("validation", `unknown jurisdiction: ${input.jurisdictionId}`);
    }
    this.lightValidate(input.kind, input.jurisdictionId, input.payload);

    const requestId = randomUUID();
    const clearMessage = buildPlatformOpsRequest({
      requestId,
      kind: input.kind,
      jurisdictionId: input.jurisdictionId,
      payload: input.payload,
      createdAt: this.now().toISOString(),
    });
    const requestHash = platformOpsRequestHash(clearMessage);
    const expiresAt = new Date(this.now().getTime() + this.pendingTtlSec * 1000);

    await this.d.pendingRepo.insert({
      requestId,
      requestHash,
      clearMessage,
      kind: input.kind,
      jurisdictionId: input.jurisdictionId,
      preparedBy: input.preparedByUserId,
      expiresAt,
    });

    return {
      requestId,
      requestHash,
      clearMessage,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async submit(input: {
    sessionUserId: string;
    requestId: string;
    adminAttestation: PlatformOpsAdminAttestation;
    /** When true (CLI soft-key path), signer may belong to any admin; default requires session match. */
    allowCrossUserOpsKey?: boolean;
  }): Promise<PlatformOpsSubmitResult> {
    await this.assertAdmin(input.sessionUserId);

    const pending = await this.d.pendingRepo.consume(input.requestId);
    if (!pending) {
      throw new ServiceError(
        "not_found",
        "platform has no memory of signing this request (missing, expired, or already consumed prepare)",
      );
    }

    const request = pending.clearMessage;
    if (platformOpsRequestHash(request) !== pending.requestHash) {
      throw new ServiceError("validation", "pending request hash mismatch");
    }
    if (input.adminAttestation.requestHash !== pending.requestHash) {
      throw new ServiceError("validation", "admin attestation requestHash does not match prepare");
    }

    if (!verifyPlatformOpsAdminAttestation(request, input.adminAttestation)) {
      throw new ServiceError("validation", "invalid admin request attestation");
    }

    const signerUserId = await this.resolveAdminSignerUserId(
      input.adminAttestation,
      input.sessionUserId,
    );
    if (!signerUserId) {
      throw new ServiceError("forbidden", "admin attestation key is not enrolled");
    }
    const signerIsAdmin = await this.d.platformRoleRepo.hasRole(signerUserId, "admin");
    if (!signerIsAdmin) {
      throw new ServiceError("forbidden", "attestation key holder is not a platform admin");
    }
    if (!input.allowCrossUserOpsKey && signerUserId !== input.sessionUserId) {
      throw new ServiceError("forbidden", "attestation key must belong to the authenticated admin");
    }

    const content = buildPlatformOpsContent({
      request,
      adminAttestation: input.adminAttestation,
    });
    const entityId = platformOpsEntityId(request.kind, request.jurisdictionId, request.payload);
    const recordSvc = await this.recordServiceFor(request.jurisdictionId);
    const head = await this.d.recordStore.getHeadTx(entityId);
    const signed = buildAndSignPlatformOpsEnvelope({
      platformPrivKeyHex: this.d.platformBindingPrivKeyHex,
      content,
      entityId,
      prevHash: head?.txHash ?? null,
      op: head ? "update" : "create",
    });

    const project = this.projectFor(request, entityId, signed.txId);
    const ref = await recordSvc.appendPlatformOps({ ...signed, project });
    if (request.kind === "jurisdiction_config_set") {
      registerJurisdiction(
        (request.payload as { config: import("@oursay/public-record").JurisdictionConfig }).config,
      );
    }
    await this.applyKind(request);
    return { ...ref, kind: request.kind, jurisdictionId: request.jurisdictionId };
  }

  /**
   * In-process prepare+attest+submit for the CLI ops soft-key (same service path as HTTP).
   * `opsUserId` is the ops service account; attestation uses the enrolled soft-key.
   */
  async submitWithOpsSoftKey(input: {
    opsUserId: string;
    kind: PlatformOpsKind;
    jurisdictionId: string;
    payload: Record<string, unknown>;
    opsPrivKeyHex: string;
  }): Promise<PlatformOpsSubmitResult> {
    const prep = await this.prepare({
      preparedByUserId: input.opsUserId,
      kind: input.kind,
      jurisdictionId: input.jurisdictionId,
      payload: input.payload,
    });
    const adminAttestation = buildPlatformOpsAdminAttestationP256({
      request: prep.clearMessage,
      privKeyHex: input.opsPrivKeyHex,
    });
    return this.submit({
      sessionUserId: input.opsUserId,
      requestId: prep.requestId,
      adminAttestation,
      allowCrossUserOpsKey: false,
    });
  }

  /** Seed/import helper: append only when the kind's current full snapshot differs. */
  async submitWithOpsSoftKeyIfChanged(input: {
    opsUserId: string;
    kind: PlatformOpsKind;
    jurisdictionId: string;
    payload: Record<string, unknown>;
    opsPrivKeyHex: string;
  }): Promise<{ changed: boolean; ref?: PlatformOpsSubmitResult }> {
    const entityId = platformOpsEntityId(input.kind, input.jurisdictionId, input.payload);
    const head = await this.d.recordStore.getHeadTx(entityId);
    const current = head?.content as { kind?: unknown; payload?: unknown } | null | undefined;
    if (
      current?.kind === input.kind &&
      canonicalJson(current.payload) === canonicalJson(input.payload)
    ) {
      return { changed: false };
    }
    return { changed: true, ref: await this.submitWithOpsSoftKey(input) };
  }

  platformAuthorPubkey(): string {
    return this.platformPubKeyHex;
  }

  private lightValidate(
    kind: PlatformOpsKind,
    jurisdictionId: string,
    payload: Record<string, unknown>,
  ): void {
    try {
      validatePlatformOpsPayload(kind, jurisdictionId, payload);
    } catch (err) {
      throw new ServiceError("validation", err instanceof Error ? err.message : String(err));
    }
  }

  private async applyKind(request: PlatformOpsRequest): Promise<void> {
    if (request.kind === "official_seat_claim") {
      const userId = String(request.payload.userId);
      const seatHandle = String(request.payload.seatHandle);
      await this.d.officialSeatClaimService.applyClaimSeat(userId, seatHandle);
      return;
    }
    if (request.kind === "official_seat_revoke") {
      const seatHandle = String(request.payload.seatHandle);
      const expectedUserId =
        typeof request.payload.expectedUserId === "string" ? request.payload.expectedUserId : undefined;
      const expectedUserHandle =
        typeof request.payload.expectedUserHandle === "string"
          ? request.payload.expectedUserHandle
          : undefined;
      await this.d.officialSeatClaimService.applyReleaseSeat(seatHandle, {
        expectedUserId,
        expectedUserHandle,
      });
      return;
    }
  }

  private projectFor(
    request: PlatformOpsRequest,
    entityId: string,
    txId: string,
  ): ((client: import("pg").PoolClient, txHash: string) => Promise<void>) | undefined {
    if (request.kind === "jurisdiction_config_set") {
      const config = (request.payload as {
        config: import("@oursay/public-record").JurisdictionConfig;
      }).config;
      return (client, txHash) =>
        this.d.jurisdictionConfigRepo.upsert(
          { config, sourceEntityId: entityId, sourceTxId: txId, sourceTxHash: txHash },
          client,
        );
    }
    if (request.kind === "district_upsert") {
      const district = (request.payload as { district: PlatformOpsDistrictSnapshot }).district;
      return (client, txHash) =>
        this.d.geoStore.upsertDistrict(
          {
            ...district,
            sourceEntityId: entityId,
            sourceTxId: txId,
            sourceTxHash: txHash,
          },
          client,
        );
    }
    if (request.kind === "official_seat_upsert") {
      const seat = (request.payload as { seat: PlatformOpsOfficialSeatSnapshot }).seat;
      return (client, txHash) =>
        this.d.geoStore.upsertOfficialSeat(
          {
            ...seat,
            sourceEntityId: entityId,
            sourceTxId: txId,
            sourceTxHash: txHash,
          },
          client,
        );
    }
    return undefined;
  }

  private async resolveAdminSignerUserId(
    attestation: PlatformOpsAdminAttestation,
    sessionUserId: string,
  ): Promise<string | null> {
    const ops = await this.d.opsKeyRepo.getByPubkeyHex(attestation.signerPubkey);
    if (ops) return ops.userId;

    if (attestation.signScheme === "webauthn-es256") {
      const owned = await this.resolvePasskeySignerForUser(sessionUserId, attestation.signerPubkey);
      if (owned) return sessionUserId;
    }
    return null;
  }

  /** Match SEC1 signer pubkey against the user's enrolled auth passkeys (COSE → SEC1). */
  async resolvePasskeySignerForUser(userId: string, signerPubkeyHex: string): Promise<boolean> {
    const creds = await this.d.passkeyRepo.listByUserId(userId);
    for (const c of creds) {
      try {
        if (cosePublicKeyToSec1Hex(c.publicKey).toLowerCase() === signerPubkeyHex.toLowerCase()) {
          return true;
        }
      } catch {
        /* skip non-P-256 */
      }
    }
    return false;
  }

  private async recordServiceFor(jurisdictionId: string): Promise<RecordService> {
    const chainId = jurisdictionId || civicConfig.chainId;
    const ledger = await this.d.getLedger(chainId);
    return new RecordService(
      new PublicChain(this.d.recordStore, chainId, ledger, async () => {
        await this.d.getLedger(chainId);
      }),
      this.d.recordStore,
      {
        platformBindingPrivKeyHex: this.d.platformBindingPrivKeyHex,
        signedEnvelopeMaxAgeSec: this.d.signedEnvelopeMaxAgeSec ?? civicConfig.signedEnvelopeMaxAgeSec,
        requireDeviceSigner: false,
      },
    );
  }
}
