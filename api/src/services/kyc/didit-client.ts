// Typed Didit REST client (verification API v3). Never logs decision payloads or document PII.

import { createHmac, timingSafeEqual } from "node:crypto";
import { hasGeocodableAddress, normalizeAddress } from "../../helpers/address.js";
import type { DiditConfig } from "../../config.js";
import type { EphemeralPoaLocation, KycSessionStatus } from "./session-provider.js";

export type DiditFetch = typeof fetch;

export interface DiditCreateSessionInput {
  workflowId: string;
  vendorData: string;
  callback?: string;
}

export interface DiditCreateSessionResponse {
  session_id: string;
  url: string;
  status: string;
  workflow_id: string;
}

export interface DiditPoaParsedAddress {
  street_1?: string | null;
  street_2?: string | null;
  city?: string | null;
  region?: string | null;
  postal_code?: string | null;
  country?: string | null;
  document_location?: { latitude?: number | null; longitude?: number | null } | null;
}

export interface DiditDecisionResponse {
  session_id: string;
  status: string;
  workflow_id: string;
  id_verifications?: Array<{ issuing_state?: string | null; nationality?: string | null }>;
  poa_verifications?: Array<{
    country?: string | null;
    state?: string | null;
    poa_parsed_address?: DiditPoaParsedAddress | null;
  }>;
}

export type { EphemeralPoaLocation };

const WEBHOOK_MAX_SKEW_SEC = 300;

/** Map Didit session/decision statuses to our normalized lifecycle. */
export function mapDiditStatus(raw: string): KycSessionStatus {
  const s = raw.trim().toLowerCase();
  if (s === "approved") return "approved";
  if (s === "declined") return "declined";
  if (s === "abandoned") return "abandoned";
  if (s === "expired" || s === "kyc expired") return "expired";
  if (s === "in review") return "in_review";
  return "pending";
}

/** Coarse region for attestation rows — province/state or country code only. */
export function coarseRegionFromDecision(decision: DiditDecisionResponse): string | null {
  const poa = decision.poa_verifications?.[0];
  if (poa?.state) return poa.state;
  const parsedRegion = poa?.poa_parsed_address?.region;
  if (parsedRegion) return parsedRegion;
  if (poa?.country) return poa.country;
  if (poa?.poa_parsed_address?.country) return poa.poa_parsed_address.country;
  const idv = decision.id_verifications?.[0];
  if (idv?.issuing_state) return idv.issuing_state;
  if (idv?.nationality) return idv.nationality;
  return null;
}

/**
 * Extract ephemeral residency location from a Didit decision (intake only).
 * Prefer document_location coords; else structured address for the geocode seam.
 * Never logs the payload. Hash rules live in GeocodeService (location_hash).
 */
export function ephemeralPoaLocationFromDecision(decision: DiditDecisionResponse): EphemeralPoaLocation | null {
  const parsed = decision.poa_verifications?.[0]?.poa_parsed_address;
  if (!parsed) return null;

  const loc = parsed.document_location;
  const lat = loc?.latitude;
  const lon = loc?.longitude;
  if (
    typeof lat === "number" &&
    typeof lon === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lon)
  ) {
    return { kind: "coords", lon, lat };
  }

  const addr = normalizeAddress({
    line1: parsed.street_1,
    line2: parsed.street_2,
    city: parsed.city,
    province: parsed.region,
    postalCode: parsed.postal_code,
    country: parsed.country,
  });
  if (hasGeocodableAddress(addr)) {
    return { kind: "address", addr };
  }
  return null;
}

function shortenFloats(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shortenFloats);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = shortenFloats((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  if (typeof value === "number" && Number.isFinite(value) && Number.isInteger(value)) {
    return Math.trunc(value);
  }
  return value;
}

function canonicalJsonV2(payload: unknown): string {
  return JSON.stringify(shortenFloats(payload));
}

/** X-Signature-V2 helper (sorted canonical JSON, Unicode preserved). */
export function diditWebhookSignatureV2(secret: string, payload: unknown): string {
  return createHmac("sha256", secret).update(canonicalJsonV2(payload)).digest("hex");
}

function timingSafeHexEqual(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

export class DiditClient {
  constructor(
    private readonly cfg: DiditConfig,
    private readonly fetchImpl: DiditFetch = fetch,
  ) {}

  async createSession(input: DiditCreateSessionInput): Promise<DiditCreateSessionResponse> {
    const body: Record<string, string> = {
      workflow_id: input.workflowId,
      vendor_data: input.vendorData,
    };
    if (input.callback) body.callback = input.callback;
    return this.postJson<DiditCreateSessionResponse>("/v3/session/", body);
  }

  async fetchDecision(sessionId: string): Promise<DiditDecisionResponse> {
    return this.getJson<DiditDecisionResponse>(`/v3/session/${encodeURIComponent(sessionId)}/decision/`);
  }

  verifyWebhook(rawBody: string, headers: Record<string, string | undefined>): boolean {
    const secret = this.cfg.webhookSecret;
    if (!secret) return false;

    const timestamp = headers["x-timestamp"] ?? headers["X-Timestamp"];
    if (!timestamp || !/^\d+$/.test(timestamp)) return false;
    const skew = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
    if (skew > WEBHOOK_MAX_SKEW_SEC) return false;

    const sigV2 = headers["x-signature-v2"] ?? headers["X-Signature-V2"];
    if (sigV2) {
      try {
        const payload = JSON.parse(rawBody) as unknown;
        const expected = diditWebhookSignatureV2(secret, payload);
        if (timingSafeHexEqual(sigV2, expected)) return true;
      } catch {
        // fall through
      }
    }

    const sigRaw = headers["x-signature"] ?? headers["X-Signature"];
    if (sigRaw) {
      const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
      if (timingSafeHexEqual(sigRaw, expected)) return true;
    }

    return false;
  }

  parseWebhookEvent(rawBody: string): { sessionId: string; status: KycSessionStatus; eventId?: string } | null {
    try {
      const payload = JSON.parse(rawBody) as {
        session_id?: string;
        status?: string;
        event_id?: string;
      };
      if (!payload.session_id || !payload.status) return null;
      return {
        sessionId: payload.session_id,
        status: mapDiditStatus(payload.status),
        eventId: payload.event_id,
      };
    } catch {
      return null;
    }
  }

  private url(path: string): string {
    return `${this.cfg.baseUrl.replace(/\/$/, "")}${path}`;
  }

  private async postJson<T>(path: string, body: Record<string, string>): Promise<T> {
    const res = await this.fetchImpl(this.url(path), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.cfg.apiKey,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Didit ${path} failed: HTTP ${res.status} ${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }

  private async getJson<T>(path: string): Promise<T> {
    const res = await this.fetchImpl(this.url(path), {
      method: "GET",
      headers: { "x-api-key": this.cfg.apiKey },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Didit ${path} failed: HTTP ${res.status} ${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }
}
