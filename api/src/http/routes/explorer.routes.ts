// Explorer / auditor READ routes (docs/11 §8 interim; contributor §7 open aggregates).
// UNAUTHENTICATED — no preHandler / security. Thin: parse → ExplorerReadService → reply.
// Full sync/stream is NOT this surface (still a gap). No rate limit (matches count/audit stance).

import type { FastifyInstance } from "fastify";
import type { Services } from "../../container.js";
import { errorSchema } from "../schemas.js";

const RECORD_TYPE_ENUM = [
  "post",
  "comment",
  "reaction",
  "petition",
  "petition_signature",
  "poll",
  "vote",
  "result",
  "platform_ops",
] as const;

const typeCountsSchema = {
  type: "object",
  description: "Per-record-type settled tx counts (zero omitted).",
  additionalProperties: { type: "integer", minimum: 0 },
  properties: Object.fromEntries(RECORD_TYPE_ENUM.map((t) => [t, { type: "integer", minimum: 0 }])),
} as const;

const immudbRootSchema = {
  type: "object",
  properties: {
    db: { type: "string" },
    txId: { type: "integer" },
    txHashHex: { type: "string" },
  },
  required: ["db", "txId", "txHashHex"],
} as const;

const attestationSchema = {
  type: "object",
  properties: {
    pubkey: { type: "string" },
    signature: { type: "string" },
  },
  required: ["pubkey", "signature"],
} as const;

const chainTipSchema = {
  type: "object",
  nullable: true,
  description: "Settled tip header — enough to recompute chainTipHash = H(prevTip ‖ bundleMerkleRoot).",
  properties: {
    height: { type: "integer" },
    chainTipHash: { type: "string" },
    bundleMerkleRoot: { type: "string" },
    prevBlockRoot: { type: "string", nullable: true },
    prevChainTipHash: { type: "string", nullable: true },
    immudbRoot: immudbRootSchema,
    capturedAt: { type: "string" },
    fromSeq: { type: "integer" },
    toSeq: { type: "integer" },
    txCount: { type: "integer" },
    proposer: { type: "string", nullable: true },
    attestations: { type: "array", items: attestationSchema },
  },
  required: [
    "height",
    "chainTipHash",
    "bundleMerkleRoot",
    "prevBlockRoot",
    "prevChainTipHash",
    "immudbRoot",
    "capturedAt",
    "fromSeq",
    "toSeq",
    "txCount",
    "proposer",
    "attestations",
  ],
} as const;

const chainResponse = {
  type: "object",
  properties: {
    chainId: { type: "string" },
    tipHeight: { type: "integer", nullable: true },
    tip: chainTipSchema,
    status: { type: "string", enum: ["empty", "active"] },
    typeCounts: typeCountsSchema,
    pendingTxCount: { type: "integer" },
  },
  required: ["chainId", "tipHeight", "tip", "status", "typeCounts", "pendingTxCount"],
} as const;

const blockSchema = {
  type: "object",
  properties: {
    chainId: { type: "string" },
    height: { type: "integer" },
    fromSeq: { type: "integer" },
    toSeq: { type: "integer" },
    txCount: { type: "integer" },
    bundleMerkleRoot: { type: "string" },
    chainTipHash: { type: "string" },
    prevBlockRoot: { type: "string", nullable: true },
    prevChainTipHash: { type: "string", nullable: true },
    immudbRoot: immudbRootSchema,
    proposer: { type: "string", nullable: true, description: "Reserved attesting actor (null in stage 1)." },
    attestations: {
      type: "array",
      items: attestationSchema,
      description: "Reserved block attestations (empty in stage 1).",
    },
    capturedAt: { type: "string" },
    status: { type: "string", enum: ["settled"] },
    typeCounts: typeCountsSchema,
  },
  required: [
    "chainId",
    "height",
    "fromSeq",
    "toSeq",
    "txCount",
    "bundleMerkleRoot",
    "chainTipHash",
    "prevBlockRoot",
    "prevChainTipHash",
    "immudbRoot",
    "proposer",
    "attestations",
    "capturedAt",
    "status",
    "typeCounts",
  ],
} as const;

const txSchema = {
  type: "object",
  description:
    "Explorer tx row. `txId` / entity ids are Base59 when UUID v4. Salt+content are returned together for commitment verify; both null when redacted/erased.",
  properties: {
    txId: { type: "string" },
    seq: { type: "integer" },
    type: { type: "string", enum: RECORD_TYPE_ENUM },
    op: { type: "string", enum: ["create", "update", "delete"] },
    entityId: { type: "string" },
    parentType: { type: "string", nullable: true },
    parentId: { type: "string", nullable: true },
    authorPubkey: { type: "string" },
    createdAt: { type: "string" },
    contentHash: { type: "string" },
    txHash: { type: "string" },
    prevHash: { type: "string", nullable: true },
    blockHeight: { type: "integer", nullable: true },
    status: { type: "string", enum: ["pending", "settled"] },
    withheld: { type: "boolean" },
    isRedacted: { type: "boolean" },
    isErased: { type: "boolean" },
    salt: {
      type: "string",
      nullable: true,
      description: "Content salt for contentHash recompute; null when withheld (same rule as content).",
    },
    content: { description: "Public content; null when withheld.", nullable: true },
    envelope: { type: "string", description: "Canonical envelope JSON (commitment leaf input)." },
  },
  required: [
    "txId",
    "seq",
    "type",
    "op",
    "entityId",
    "parentType",
    "parentId",
    "authorPubkey",
    "createdAt",
    "contentHash",
    "txHash",
    "prevHash",
    "blockHeight",
    "status",
    "withheld",
    "isRedacted",
    "isErased",
    "salt",
    "content",
    "envelope",
  ],
} as const;

const chainParams = {
  type: "object",
  properties: { chainId: { type: "string", minLength: 1 } },
  required: ["chainId"],
} as const;

const blocksQuery = {
  type: "object",
  properties: {
    limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
    offset: { type: "integer", minimum: 0, default: 0 },
  },
} as const;

const heightParams = {
  type: "object",
  properties: {
    chainId: { type: "string", minLength: 1 },
    height: { type: "integer", minimum: 1 },
  },
  required: ["chainId", "height"],
} as const;

const txsQuery = {
  type: "object",
  required: ["block"],
  properties: {
    block: { type: "integer", minimum: 1, description: "Settled block height whose txs to list." },
  },
} as const;

const txParams = {
  type: "object",
  properties: {
    chainId: { type: "string", minLength: 1 },
    txId: { type: "string", minLength: 1, description: "Base59 or UUID v4 transaction id." },
  },
  required: ["chainId", "txId"],
} as const;

export function registerExplorerRoutes(app: FastifyInstance, services: Services): void {
  const svc = services.explorerReadService;

  app.get(
    "/v1/explorer/:chainId",
    {
      schema: {
        tags: ["explorer"],
        summary: "Explorer chain tip + settled type counts",
        params: chainParams,
        response: { 200: chainResponse, 400: errorSchema, 503: errorSchema },
      },
    },
    async (req) => {
      const { chainId } = req.params as { chainId: string };
      return svc.getChain(chainId);
    },
  );

  app.get(
    "/v1/explorer/:chainId/blocks",
    {
      schema: {
        tags: ["explorer"],
        summary: "List settled blocks (newest first)",
        params: chainParams,
        querystring: blocksQuery,
        response: {
          200: {
            type: "object",
            properties: {
              tipHeight: { type: "integer", nullable: true },
              items: { type: "array", items: blockSchema },
            },
            required: ["tipHeight", "items"],
          },
          400: errorSchema,
          503: errorSchema,
        },
      },
    },
    async (req) => {
      const { chainId } = req.params as { chainId: string };
      const q = req.query as { limit?: number; offset?: number };
      return svc.listBlocks(chainId, { limit: q.limit ?? 20, offset: q.offset ?? 0 });
    },
  );

  app.get(
    "/v1/explorer/:chainId/blocks/:height",
    {
      schema: {
        tags: ["explorer"],
        summary: "One settled block header + type counts",
        params: heightParams,
        response: { 200: blockSchema, 400: errorSchema, 404: errorSchema, 503: errorSchema },
      },
    },
    async (req) => {
      const { chainId, height } = req.params as { chainId: string; height: number };
      return svc.getBlock(chainId, Number(height));
    },
  );

  app.get(
    "/v1/explorer/:chainId/txs",
    {
      schema: {
        tags: ["explorer"],
        summary: "List txs in a settled block (`?block=N`)",
        params: chainParams,
        querystring: txsQuery,
        response: {
          200: {
            type: "object",
            properties: {
              blockHeight: { type: "integer" },
              items: { type: "array", items: txSchema },
            },
            required: ["blockHeight", "items"],
          },
          400: errorSchema,
          404: errorSchema,
          503: errorSchema,
        },
      },
    },
    async (req) => {
      const { chainId } = req.params as { chainId: string };
      const { block } = req.query as { block: number };
      return svc.listTxsByBlock(chainId, Number(block));
    },
  );

  app.get(
    "/v1/explorer/:chainId/tx/:txId",
    {
      schema: {
        tags: ["explorer"],
        summary: "One tx by Base59 (or UUID v4) id",
        params: txParams,
        response: { 200: txSchema, 400: errorSchema, 404: errorSchema, 503: errorSchema },
      },
    },
    async (req) => {
      const { chainId, txId } = req.params as { chainId: string; txId: string };
      return svc.getTx(chainId, txId);
    },
  );
}
