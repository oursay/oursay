// CivicHttpClient — a thin client over the @oursay/api civic WRITE surface (docs/08 §6). It wraps the
// four HTTP endpoints (enrol device / join thread / prepare / submit) and orchestrates the
// unlock-once/sign-many flow against an IdentitySession: ensure the civic device is enrolled, join the
// thread once, then prepare → device-sign → submit for each civic action.
//
// This module is fetch + JSON + orchestration ONLY. All crypto stays in IdentitySession (persona /
// signer derivation, binding inputs, envelope signing) and @oursay/public-record — the SDK never
// assembles or signs an envelope itself. That keeps the trust boundary intact: only PUBLIC material
// (pubkeys, the opaque commitment, signed envelopes) ever crosses to the server.

import type { CommentContent, PostContent, ReactionContent, VoteContent } from "@oursay/public-record/schema/types";
import type { IdentitySession } from "./session.js";
import type { Intent, ParentRef, PreparedAppend, SignedSubmission, ThreadRef } from "../shared/types.js";

export interface CivicHttpClientOptions {
  /** API origin, e.g. "https://api.oursay.org" or "http://localhost". No trailing slash. */
  baseUrl: string;
  /** An unlocked signing session (from any PasskeyConnector). */
  session: IdentitySession;
  /** Bearer token for a full-scope session. Combine with `credentials` or use either alone. */
  token?: string;
  /** Pass "include" to send the session cookie (browser, same-site/credentialed CORS). */
  credentials?: RequestCredentials;
  /** Injectable fetch (defaults to globalThis.fetch). Tests pass a Fastify-`inject`-backed fetch. */
  fetch?: typeof fetch;
}

/** A reference to the appended (pooled) transaction — the `submit` result. */
export interface SubmitRef {
  txId: string;
  entityId: string;
  txHash: string;
}

/** The public view of an enrolled civic device key. */
export interface CivicDeviceView {
  devicePubkey: string;
  label: string | null;
  enrolledAt: string;
}

/** Thrown on any non-2xx civic response; carries the HTTP status and the parsed error body. */
export class CivicHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    message: string,
  ) {
    super(message);
    this.name = "CivicHttpError";
  }
}

export class CivicHttpClient {
  private readonly baseUrl: string;
  private readonly session: IdentitySession;
  private readonly token?: string;
  private readonly credentials?: RequestCredentials;
  private readonly fetchImpl: typeof fetch;

  // In-memory orchestration state, so a long-lived client enrols its device and joins each thread at
  // most once. Cheap dedupe — not a security boundary (the server re-checks ownership every call).
  private deviceEnsured = false;
  private readonly joined = new Set<string>();

  constructor(opts: CivicHttpClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.session = opts.session;
    this.token = opts.token;
    this.credentials = opts.credentials;
    // Browser `fetch` is brand-checked: it must be called with `this === window`, so the default must
    // be bound to globalThis (calling it as `this.fetchImpl(...)` otherwise throws "Illegal
    // invocation"). An injected fetch (e.g. a Fastify-inject-backed test fetch) is used as-is.
    const f = opts.fetch ?? (globalThis.fetch && globalThis.fetch.bind(globalThis));
    if (!f) throw new Error("CivicHttpClient: no fetch available — pass options.fetch");
    this.fetchImpl = f;
  }

  // ── Low-level endpoint wrappers ───────────────────────────────────────────────────────────

  /** Enrol this device's account-level public key (`public.device_keys`). */
  async enrollDevice(label?: string): Promise<CivicDeviceView> {
    return this.request<CivicDeviceView>("POST", "/v1/civic/devices", {
      devicePubkey: this.session.devicePubkey,
      ...(label !== undefined ? { label } : {}),
    });
  }

  /** List the caller's enrolled (non-revoked) civic device keys. */
  async listDevices(): Promise<CivicDeviceView[]> {
    const { devices } = await this.request<{ devices: CivicDeviceView[] }>("GET", "/v1/civic/devices");
    return devices;
  }

  /**
   * Join a thread: bind account↔thread-key OWNERSHIP. The binding inputs are built WITHOUT a kycTier
   * (ownership-only, matching the A1 HTTP contract) — verification tier is applied at read/count time,
   * never fixed at join.
   */
  async joinThread(t: ThreadRef): Promise<void> {
    await this.request<void>("POST", "/v1/civic/threads/join", {
      threadId: t.threadId,
      jurisdiction: t.jurisdiction,
      personaPubkey: this.session.personaPubkey(t),
      signerPubkey: this.session.signerPubkey(t),
      commitment: this.session.bindingInputs(t).binding.commitment,
      devicePubkey: this.session.devicePubkey,
    });
  }

  /** Prepare an append: fetch the server-derived fields the client must sign over. */
  async prepare(t: ThreadRef, intent: Intent): Promise<PreparedAppend> {
    return this.request<PreparedAppend>("POST", "/v1/civic/appends/prepare", {
      author: this.session.personaPubkey(t),
      intent,
    });
  }

  /** Submit a client+device-signed envelope into the verified record pool. */
  async submit(signed: SignedSubmission): Promise<SubmitRef> {
    return this.request<SubmitRef>("POST", "/v1/civic/appends/submit", {
      envelope: signed.envelope,
      salt: signed.salt,
      content: signed.content,
    });
  }

  // ── Orchestration ─────────────────────────────────────────────────────────────────────────

  /** Ensure this device is enrolled (GET-first so it's idempotent for a returning user). */
  async ensureDeviceEnrolled(label?: string): Promise<void> {
    if (this.deviceEnsured) return;
    const devices = await this.listDevices();
    if (!devices.some((d) => d.devicePubkey === this.session.devicePubkey)) {
      await this.enrollDevice(label);
    }
    this.deviceEnsured = true;
  }

  /** Ensure this thread is joined (once per client instance). */
  async ensureJoined(t: ThreadRef): Promise<void> {
    const key = `${t.jurisdiction}:${t.threadId}`;
    if (this.joined.has(key)) return;
    await this.joinThread(t);
    this.joined.add(key);
  }

  /**
   * The full write path for one intent: ensure device enrolled → ensure thread joined → prepare →
   * DEVICE-sign (via IdentitySession) → submit. This is "unlock once, sign many" — no re-auth between
   * actions on the same session.
   */
  async append(t: ThreadRef, intent: Intent): Promise<SubmitRef> {
    await this.ensureDeviceEnrolled();
    await this.ensureJoined(t);
    const prep = await this.prepare(t, intent);
    const signed = this.session.buildSigned(t, prep, intent);
    return this.submit(signed);
  }

  // ── Convenience intents ───────────────────────────────────────────────────────────────────

  /** Create the thread's root post (`entityId === threadId`). */
  async createPost(t: ThreadRef, content: PostContent): Promise<SubmitRef> {
    return this.append(t, { op: "create", type: "post", entityId: t.threadId, content });
  }

  /** Comment on a parent entity (post/petition/poll/comment; depth ≤ 3 enforced server-side). */
  async createComment(t: ThreadRef, parent: ParentRef, content: CommentContent, opts: { entityId?: string } = {}): Promise<SubmitRef> {
    return this.append(t, { op: "create", type: "comment", entityId: opts.entityId ?? crypto.randomUUID(), parent, content });
  }

  /** React to a parent entity (singleton per author+parent). */
  async addReaction(t: ThreadRef, parent: ParentRef, content: ReactionContent, opts: { entityId?: string } = {}): Promise<SubmitRef> {
    return this.append(t, { op: "create", type: "reaction", entityId: opts.entityId ?? crypto.randomUUID(), parent, content });
  }

  /** Cast a vote on a parent poll (singleton per author+parent). */
  async castVote(t: ThreadRef, parent: ParentRef, content: VoteContent, opts: { entityId?: string } = {}): Promise<SubmitRef> {
    return this.append(t, { op: "create", type: "vote", entityId: opts.entityId ?? crypto.randomUUID(), parent, content });
  }

  // ── Transport ─────────────────────────────────────────────────────────────────────────────

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (this.token) headers["authorization"] = `Bearer ${this.token}`;
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(this.credentials ? { credentials: this.credentials } : {}),
    });
    if (!res.ok) {
      const errBody = await parseBody(res);
      const detail = typeof errBody === "object" && errBody && "message" in errBody ? String((errBody as { message: unknown }).message) : res.statusText;
      throw new CivicHttpError(res.status, errBody, `${method} ${path} failed (${res.status}): ${detail}`);
    }
    if (res.status === 204) return undefined as T;
    return (await parseBody(res)) as T;
  }
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
