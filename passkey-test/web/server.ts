// Minimal no-dependency static server for the WebAuthn + PRF demo. WebAuthn requires a SECURE
// CONTEXT; http://localhost qualifies (file:// does NOT), so we must serve over localhost rather
// than open the HTML file directly. Run: `npm run serve` then open http://localhost:5173
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT ?? 6173);

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

const server = createServer(async (req, res) => {
  // Resolve within ROOT only (no path traversal); default to index.html.
  const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const rel = normalize(urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, ""));
  const file = join(ROOT, rel);
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": TYPES[extname(file)] ?? "application/octet-stream",
      "cache-control": "no-store", // dev demo: always serve fresh HTML/JS
    }).end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});

server.listen(PORT, () => {
  console.log(`passkey-test demo  →  http://localhost:${PORT}`);
  console.log("Open it in a browser with a platform authenticator, then Register → Authenticate.");
});
