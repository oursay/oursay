// Map domain ServiceError codes → HTTP status + a stable JSON error body. Unknown errors become a
// generic 500 (their message is logged, not leaked). Registered as Fastify's error handler.

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { isServiceError, type ErrorCode } from "../errors.js";

const STATUS: Record<ErrorCode, number> = {
  validation: 400,
  otp_invalid: 400,
  otp_expired: 400,
  challenge_invalid: 400,
  passkey_verification_failed: 400,
  unauthorized: 401,
  forbidden: 403,
  age_restricted: 403,
  not_found: 404,
  email_taken: 409,
  handle_taken: 409,
  conflict: 409,
  kyc_reverification_required: 409,
  unprocessable: 422,
  unavailable: 503,
  not_implemented: 501,
  rate_limited: 429,
  otp_max_attempts: 429,
};

export interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export function errorBody(code: string, message: string, details?: unknown): ErrorBody {
  return { error: { code, message, ...(details !== undefined ? { details } : {}) } };
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: any, req: FastifyRequest, reply: FastifyReply) => {
    if (isServiceError(err)) {
      // Fail-closed upstream (e.g. ledger pool gate) — keep the detail in logs; client still gets the body.
      if (err.code === "unavailable") req.log.warn({ err }, err.message);
      reply.status(STATUS[err.code] ?? 400).send(errorBody(err.code, err.message, err.details));
      return;
    }
    // Fastify validation errors (schema) → 400.
    if (err.validation) {
      if (process.env.NODE_ENV !== "production" && req.url.includes("/otp/verify")) {
        req.log.warn({ validation: err.validation }, "OTP verify rejected (request schema)");
      }
      reply.status(400).send(errorBody("validation", err.message, err.validation));
      return;
    }
    if (typeof err.statusCode === "number" && err.statusCode >= 400 && err.statusCode < 500) {
      reply.status(err.statusCode).send(errorBody(err.code ?? "error", err.message));
      return;
    }
    req.log.error({ err }, "unhandled error");
    reply.status(500).send(errorBody("internal", "Internal server error"));
  });
}
