// Dev-only walk harness. Serves a same-origin HTML page (api/web/walktest/) that drives the real v1
// routes through a full account flow — register → enroll passkey → logout → passkey login → recovery
// re-enroll. WebAuthn ceremonies cannot run inside Swagger UI, so this gives humans a real page to
// click through. Registered ONLY when NODE_ENV !== "production" (see server.ts). No business logic
// lives here — it is a thin static-file server for a thin client.

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import type { FastifyInstance, FastifyReply } from "fastify";

const here = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(here, "../../../web/walktest");

// The vendored @simplewebauthn/browser UMD bundle (global `SimpleWebAuthnBrowser`), version-matched
// to @simplewebauthn/server. Resolve via the package's main entry (subpath exports are locked to "."),
// then walk to the bundle. Read once and cache for the process.
const require = createRequire(import.meta.url);
const browserBundlePath = resolve(dirname(require.resolve("@simplewebauthn/browser")), "..", "dist", "bundle", "index.umd.min.js");

const cache = new Map<string, Buffer>();
async function readCached(path: string): Promise<Buffer> {
  let buf = cache.get(path);
  if (!buf) {
    buf = await readFile(path);
    cache.set(path, buf);
  }
  return buf;
}

// The real @oursay/identity client, bundled for the browser so the walk page drives civic custody +
// signing with the SAME SDK production would use (no ephemeral stand-in). We bundle the browser-safe
// entry (@oursay/identity/client/browser — excludes the Node-only DevPasskeyConnector) on first
// request and cache it for the process. DEV-ONLY: this route is registered only when NODE_ENV !=
// production. Cache caveat: it's built once per process — restart the dev server after editing the SDK.
let identityBundle: Buffer | undefined;
async function buildIdentityBundle(): Promise<Buffer> {
  if (identityBundle) return identityBundle;
  const out = await build({
    entryPoints: [require.resolve("@oursay/identity/client/browser")],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    write: false,
    legalComments: "none",
  });
  identityBundle = Buffer.from(out.outputFiles[0].text, "utf8");
  return identityBundle;
}

function send(reply: FastifyReply, body: Buffer, contentType: string): void {
  reply.header("content-type", contentType).header("cache-control", "no-store").send(body);
}

export function registerWalkRoutes(app: FastifyInstance): void {
  app.get("/walk", { schema: { hide: true } }, async (_req, reply) => {
    send(reply, await readCached(resolve(webDir, "index.html")), "text/html; charset=utf-8");
  });

  app.get("/walk/app.js", { schema: { hide: true } }, async (_req, reply) => {
    send(reply, await readCached(resolve(webDir, "app.js")), "text/javascript; charset=utf-8");
  });

  app.get("/walk/simplewebauthn-browser.js", { schema: { hide: true } }, async (_req, reply) => {
    send(reply, await readCached(browserBundlePath), "text/javascript; charset=utf-8");
  });

  app.get("/walk/identity.js", { schema: { hide: true } }, async (_req, reply) => {
    send(reply, await buildIdentityBundle(), "text/javascript; charset=utf-8");
  });
}
