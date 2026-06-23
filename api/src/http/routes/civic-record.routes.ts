// Civic record WRITE routes (docs/08 §6; public-record R1/R2/R7). Authenticated (full session) thread
// join, append prepare, and signed submit — the HTTP surface over @oursay/identity's IdentityRegistry.
// Routes stay thin: parse → authorize (requireFullScope; the caller's userId owns the action) → call
// CivicRecordService → map errors. No crypto here; the service + public-record do all verification.

import type { FastifyInstance } from "fastify";
import type { Services } from "../../container.js";
import { bearerSecurity, errorSchema } from "../schemas.js";

const RECORD_TYPE_ENUM = ["post", "comment", "reaction", "petition", "petition_signature", "poll", "vote"] as const;

const intentSchema = {
  type: "object",
  description: "A civic intent. `content` is the raw payload (kept private); the server returns the fields to sign.",
  properties: {
    op: { type: "string", enum: ["create", "update", "delete"] },
    type: { type: "string", enum: RECORD_TYPE_ENUM },
    entityId: { type: "string", description: "Caller-chosen entity id (client and server must agree)." },
    parent: {
      type: "object",
      properties: { type: { type: "string", enum: RECORD_TYPE_ENUM }, id: { type: "string" } },
      required: ["type", "id"],
      additionalProperties: false,
    },
    content: { description: "Opaque payload (any JSON). Never published in plaintext." },
  },
  required: ["op", "type", "entityId"],
  additionalProperties: false,
} as const;

const preparedAppendSchema = {
  type: "object",
  description: "Server-derived fields the client must sign over (mirrors RecordService.prepareAppend).",
  properties: {
    prevHash: { type: "string", nullable: true },
    parentType: { type: "string" },
    parentId: { type: "string" },
    parentRevisionHash: { type: "string" },
    parentRevisionTxId: { type: "string" },
    rootEntityId: { type: "string" },
    nullifierParentId: { type: "string" },
    nullifier: { type: "string" },
  },
  required: ["prevHash", "rootEntityId"],
} as const;

const refSchema = {
  type: "object",
  description: "A reference to the appended (pooled) transaction.",
  properties: {
    txId: { type: "string" },
    entityId: { type: "string" },
    txHash: { type: "string" },
  },
  required: ["txId", "entityId", "txHash"],
} as const;

export function registerCivicRecordRoutes(app: FastifyInstance, services: Services): void {
  app.post(
    "/v1/civic/threads/join",
    {
      preHandler: app.requireFullScope,
      schema: {
        tags: ["civic"],
        summary: "Join a thread: bind account↔thread-key ownership (no KYC tier fixed at join)",
        security: bearerSecurity,
        body: {
          type: "object",
          properties: {
            threadId: { type: "string", description: "Root entity id the thread is scoped to." },
            jurisdiction: { type: "string", description: "Jurisdiction id, e.g. ab-ca-gov." },
            personaPubkey: { type: "string", description: "Thread persona (author) pubkey, SEC1 P-256 hex." },
            signerPubkey: { type: "string", description: "Thread-scoped device signer pubkey, SEC1 P-256 hex." },
            commitment: { type: "string", description: "Opaque binding commitment (sha256 hex); opening stays client-side." },
            devicePubkey: { type: "string", description: "Enrolled account-level civic device pubkey, SEC1 P-256 hex." },
          },
          required: ["threadId", "jurisdiction", "personaPubkey", "signerPubkey", "commitment", "devicePubkey"],
          additionalProperties: false,
        },
        response: { 204: { type: "null" }, 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema },
      },
    },
    async (req, reply) => {
      const b = req.body as {
        threadId: string;
        jurisdiction: string;
        personaPubkey: string;
        signerPubkey: string;
        commitment: string;
        devicePubkey: string;
      };
      await services.civicRecordService.join({ userId: req.user!.userId, ...b });
      reply.status(204).send();
    },
  );

  app.post(
    "/v1/civic/appends/prepare",
    {
      preHandler: app.requireFullScope,
      schema: {
        tags: ["civic"],
        summary: "Prepare an append: server-derived fields for a civic intent",
        security: bearerSecurity,
        body: {
          type: "object",
          properties: {
            author: { type: "string", description: "Thread persona pubkey the action is authored as (must be the caller's)." },
            intent: intentSchema,
          },
          required: ["author", "intent"],
          additionalProperties: false,
        },
        response: { 200: preparedAppendSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema },
      },
    },
    async (req) => {
      const b = req.body as { author: string; intent: Parameters<typeof services.civicRecordService.prepare>[0]["intent"] };
      return services.civicRecordService.prepare({ userId: req.user!.userId, author: b.author, intent: b.intent });
    },
  );

  app.post(
    "/v1/civic/appends/submit",
    {
      preHandler: app.requireFullScope,
      schema: {
        tags: ["civic"],
        summary: "Submit a client+device-signed envelope into the verified record pool",
        security: bearerSecurity,
        body: {
          type: "object",
          properties: {
            // The envelope is a versioned TxEnvelope (shape owned by @oursay/public-record); passed
            // through and verified cryptographically by the service, not re-described here.
            envelope: { type: "object", additionalProperties: true },
            salt: { type: "string", description: "Per-record content-commitment salt (random uuid/hex)." },
            content: { description: "The civic payload this envelope commits to (any JSON)." },
          },
          required: ["envelope", "salt", "content"],
          additionalProperties: false,
        },
        response: { 201: refSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema },
      },
    },
    async (req, reply) => {
      const submission = req.body as Parameters<typeof services.civicRecordService.submit>[0]["submission"];
      const ref = await services.civicRecordService.submit({ userId: req.user!.userId, submission });
      reply.status(201).send(ref);
    },
  );
}
