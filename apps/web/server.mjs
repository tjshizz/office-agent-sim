import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DIST = join(__dirname, "dist");
const PORT = Number(process.env.PORT || 8080);
const XAI_TARGET = "https://api.x.ai";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".wasm": "application/wasm",
  ".ico": "image/x-icon",
  ".map": "application/json; charset=utf-8",
};

function safeJoin(root, requestPath) {
  const decoded = decodeURIComponent(requestPath.split("?")[0] || "/");
  const cleaned = decoded.replace(/^\/+/, "");
  const full = normalize(join(root, cleaned));
  if (!full.startsWith(root + sep) && full !== root) return null;
  return full;
}

async function proxyXai(req, res) {
  const upstreamPath = req.url.replace(/^\/xai/, "") || "/";
  const url = `${XAI_TARGET}${upstreamPath}`;
  const headers = {};
  for (const name of ["authorization", "content-type", "accept"]) {
    const value = req.headers[name];
    if (value) headers[name] = value;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;

  let upstream;
  try {
    upstream = await fetch(url, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
    });
  } catch (err) {
    res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    res.end(`Upstream error: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  const outHeaders = {
    "content-type": upstream.headers.get("content-type") || "application/octet-stream",
  };
  const cacheControl = upstream.headers.get("cache-control");
  if (cacheControl) outHeaders["cache-control"] = cacheControl;

  res.writeHead(upstream.status, outHeaders);
  if (!upstream.body) {
    res.end();
    return;
  }

  const reader = upstream.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
  } catch {
    // client disconnected mid-stream
  }
  res.end();
}

function serveStatic(req, res) {
  const urlPath = req.url?.split("?")[0] || "/";
  let filePath = safeJoin(DIST, urlPath === "/" ? "/index.html" : urlPath);
  if (!filePath || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(DIST, "index.html");
  }
  if (!existsSync(filePath)) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found — run pnpm build first.");
    return;
  }
  const type = MIME[extname(filePath)] || "application/octet-stream";
  res.writeHead(200, { "content-type": type });
  createReadStream(filePath).pipe(res);
}

if (!existsSync(join(DIST, "index.html"))) {
  console.error("Missing dist/. Run: pnpm --filter @office-sim/web build");
  process.exit(1);
}

const server = createServer((req, res) => {
  if (!req.url) {
    res.writeHead(400).end("Bad request");
    return;
  }
  if (req.url.startsWith("/xai")) {
    void proxyXai(req, res);
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405).end("Method not allowed");
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Office Agent Sim listening on http://localhost:${PORT}`);
});
