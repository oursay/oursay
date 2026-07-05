// JSON Schemas for the v1 routes. These ARE the contract: Fastify validates requests/responses
// against them and @fastify/swagger derives the served OpenAPI from them, so the documented spec
// can't drift from what the handlers enforce. WebAuthn ceremony payloads are passed through as open
// objects (the shapes are defined by @simplewebauthn) to avoid over-constraining the standard.

export const errorSchema = {
  type: "object",
  properties: {
    error: {
      type: "object",
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        details: {},
      },
      required: ["code", "message"],
    },
  },
  required: ["error"],
} as const;

export const sessionSchema = {
  type: "object",
  properties: {
    token: { type: "string", description: "Opaque bearer token (also set as an HttpOnly cookie)." },
    scope: { type: "string", enum: ["full", "recovery", "login"] },
    userId: { type: "string", format: "uuid" },
    expiresAt: { type: "string", format: "date-time" },
  },
  required: ["token", "scope", "userId", "expiresAt"],
} as const;

export const addressSchema = {
  type: "object",
  description: "Address components (Canada-centric storage; the front-end owns localized labels). No district binding is stored.",
  properties: {
    line1: { type: "string" },
    line2: { type: "string" },
    city: { type: "string" },
    province: { type: "string", description: "Province/territory." },
    postalCode: { type: "string" },
    country: { type: "string", description: "ISO country code; defaults to CA." },
    memo: { type: "string", description: "Free field for jurisdiction-specific edge cases." },
  },
  additionalProperties: false,
} as const;

export const profileInputSchema = {
  type: "object",
  properties: {
    handle: { type: "string", description: "Optional unique @username (public profile). Letters, digits, underscore; no spaces." },
    displayName: { type: "string", description: "Optional public display text; defaults to the handle without its '@'." },
    firstName: { type: "string", description: "Private PII (KYC); never publicly surfaced." },
    lastName: { type: "string", description: "Private PII (KYC); never publicly surfaced." },
    birthdate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "YYYY-MM-DD; age gate (18+) enforced server-side." },
    address: addressSchema,
  },
  required: ["birthdate"],
  additionalProperties: false,
} as const;

/** A pass-through object for WebAuthn options/response JSON (shape owned by @simplewebauthn). */
export const webauthnJson = { type: "object", additionalProperties: true } as const;

export const bearerSecurity: Array<Record<string, string[]>> = [{ bearerAuth: [] }, { cookieAuth: [] }];

/** 202 body for OTP request routes. `expiresAt` is present when a code was actually issued. */
export const otpSentResponseSchema = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["sent"] },
    expiresAt: {
      type: "string",
      format: "date-time",
      description: "UTC instant after which the issued code is invalid (matches OTP_TTL_SEC).",
    },
  },
  required: ["status"],
} as const;
