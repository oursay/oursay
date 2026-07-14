// Profile route: own account surface (full session). Legal name / street address are KYC-held —
// not writable here. Public identity (handle / displayName / bio / iconType) lives on public.users.

import type { FastifyInstance } from "fastify";
import { ServiceError } from "../../errors.js";
import type { Services } from "../../container.js";
import { isValidHandle, normalizeHandle } from "../../helpers/handle.js";
import { isUserIconType, USER_ICON_TYPES } from "../../helpers/icon-type.js";
import { BIO_MAX, DISPLAY_NAME_MAX } from "../../repo/user.repo.js";
import { AUTHOR_VISIBILITIES } from "../../types/visibility.js";
import { bearerSecurity, errorSchema } from "../schemas.js";

const profileResponseSchema = {
  type: "object",
  properties: {
    userId: { type: "string", format: "uuid" },
    handle: { type: ["string", "null"] },
    displayName: { type: ["string", "null"] },
    bio: { type: "string" },
    iconType: { type: "string", enum: [...USER_ICON_TYPES] },
    email: { type: "string" },
    over18: { type: "boolean", description: "Self-attested age gate; KYC re-verifies. No DOB is stored." },
    visibility: { type: "string", enum: AUTHOR_VISIBILITIES },
  },
  required: ["userId", "email", "over18", "visibility", "bio", "iconType"],
} as const;

const patchProfileBodySchema = {
  type: "object",
  properties: {
    handle: { type: "string", minLength: 1, maxLength: 31, description: "Wire or @-prefixed handle" },
    displayName: { type: "string", maxLength: DISPLAY_NAME_MAX },
    bio: { type: "string", maxLength: BIO_MAX },
    iconType: { type: "string", enum: [...USER_ICON_TYPES] },
  },
  additionalProperties: false,
} as const;

export interface PatchProfileBody {
  handle?: string;
  displayName?: string;
  bio?: string;
  iconType?: string;
}

async function buildProfileResponse(services: Services, userId: string) {
  const [user, profile] = await Promise.all([
    services.repos.user.getById(userId),
    services.repos.profile.getByUserId(userId),
  ]);
  if (!profile) throw new ServiceError("not_found", "Profile not found");
  return {
    userId,
    handle: user?.handle ?? null,
    displayName: user?.displayName ?? null,
    bio: user?.bio ?? "",
    iconType: user?.iconType ?? "thumbs",
    email: profile.email,
    over18: profile.over18,
    visibility: profile.visibility,
  };
}

export function registerProfileRoutes(app: FastifyInstance, services: Services): void {
  app.get(
    "/v1/profile",
    {
      preHandler: app.requireFullScope,
      schema: {
        tags: ["profile"],
        summary: "Get the authenticated user's own profile (account contact + public identity)",
        security: bearerSecurity,
        response: {
          200: profileResponseSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (req) => buildProfileResponse(services, req.user!.userId),
  );

  app.patch(
    "/v1/profile",
    {
      preHandler: app.requireFullScope,
      schema: {
        tags: ["profile"],
        summary: "Update handle, display name, bio, and/or icon type (not legal name or street address)",
        security: bearerSecurity,
        body: patchProfileBodySchema,
        response: {
          200: profileResponseSchema,
          401: errorSchema,
          403: errorSchema,
          404: errorSchema,
          409: errorSchema,
        },
      },
    },
    async (req) => {
      const userId = req.user!.userId;
      const body = req.body as PatchProfileBody;
      const profile = await services.repos.profile.getByUserId(userId);
      if (!profile) throw new ServiceError("not_found", "Profile not found");

      if (body.handle !== undefined) {
        const wire = normalizeHandle(body.handle);
        if (!wire || !isValidHandle(wire)) {
          throw new ServiceError("validation", "Invalid handle");
        }
        const taken = await services.repos.user.getByHandle(wire);
        if (taken && taken.id !== userId) {
          throw new ServiceError("handle_taken", "That handle is already taken");
        }
        await services.repos.user.setHandle(userId, wire);
      }

      if (body.displayName !== undefined) {
        const user = await services.repos.user.getById(userId);
        const fallback = (user?.handle ?? "user").replace(/^@/, "");
        const next = body.displayName.trim() || fallback;
        await services.repos.user.setDisplayName(userId, next);
      }

      if (body.bio !== undefined) {
        await services.repos.user.setBio(userId, body.bio);
      }

      if (body.iconType !== undefined) {
        if (!isUserIconType(body.iconType)) {
          throw new ServiceError("validation", "Invalid iconType");
        }
        await services.repos.user.setIconType(userId, body.iconType);
      }

      return buildProfileResponse(services, userId);
    },
  );
}
