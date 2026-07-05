// Minimal secure-context static host for the OPTIONAL WebPasskeyConnector demo (manual, not CI).
// WebAuthn requires a secure context: serve over http://localhost (file:// is rejected by the spec).
//   npm run serve --workspace @oursay/identity   →   http://localhost:6273

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, join, normalize } from "node:path";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT ?? 6273);
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

const server = createServer(async (req, res) => {
  const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const rel = normalize(urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, ""));
  const file = join(ROOT, rel);
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});

server.listen(PORT, () => {
  console.log(`@oursay/identity WebPasskeyConnector demo  →  http://localhost:${PORT}`);
  console.log("Open it in a browser with a platform authenticator (Windows Hello / Touch ID), then Enroll → Unlock.");
});
