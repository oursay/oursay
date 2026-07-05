/**
 * Refuse destructive operations when NODE_ENV=production.
 *
 * Civic record data must never be wiped from a running production deployment.
 * Recovery is restore-from-backup and/or re-anchor on a fresh node — not TRUNCATE
 * or `docker compose down -v`. npm scripts and `PrivateStore.reset()` call this;
 * raw `docker` CLI is not gated (use IAM / no socket on app hosts).
 */
import { pathToFileURL } from "node:url";

export function assertDestructiveAllowed(label: string): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `Refusing destructive operation (${label}): NODE_ENV=production. ` +
        "Take the deployment out of production before wiping data; restore from backup instead.",
    );
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const label = process.argv[2] ?? "destructive script";
  assertDestructiveAllowed(label);
}
