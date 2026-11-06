import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { OfficeHost } from "./host.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");
const DIST = existsSync(join(ROOT, "dist")) ? join(ROOT, "dist") : join(__dirname, "../../dist");
const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = process.env.OFFICE_DATA_DIR || join(ROOT, ".office-data");

const MIME: Record<string, string> = {
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

const host = new OfficeHost({
  dataDir: DATA_DIR,
  apiKey: process.env.XAI_API_KEY,
});
host.start();

function cors(res: ServerResponse): void {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
}

function safeJoin(root: string, requestPath: string): string | null {
  const decoded = decodeURIComponent(requestPath.split("?")[0] || "/");
  const cleaned = decoded.replace(/^\/+/, "");
  const full = normalize(join(root, cleaned));
  if (!full.startsWith(root + sep) && full !== root) return null;
  return full;
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return null;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function serveStatic(req: IncomingMessage, res: ServerResponse): void {
  const urlPath = req.url?.split("?")[0] || "/";
  let filePath = safeJoin(DIST, urlPath === "/" ? "/index.html" : urlPath);
  if (!filePath || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(DIST, "index.html");
  }
  if (!existsSync(filePath)) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found — run web build first.");
    return;
  }
  const type = MIME[extname(filePath)] || "application/octet-stream";
  res.writeHead(200, { "content-type": type });
  createReadStream(filePath).pipe(res);
}

function handleSse(res: ServerResponse, channel: "snapshot" | "stream"): void {
  cors(res);
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
  });
  res.write("\n");

  const releaseClient = channel === "snapshot" ? host.addClient() : () => undefined;

  if (channel === "snapshot") {
    const unsub = host.subscribe((payload) => {
      res.write(`event: snapshot\ndata: ${JSON.stringify(payload)}\n\n`);
    });
    reqOnClose(res, () => {
      unsub();
      releaseClient();
    });
    return;
  }

  const unsub = host.onStream((payload) => {
    res.write(`event: stream\ndata: ${JSON.stringify(payload)}\n\n`);
  });
  reqOnClose(res, () => unsub());
}

function reqOnClose(res: ServerResponse, fn: () => void): void {
  const done = () => {
    fn();
  };
  res.on("close", done);
}

const server = createServer((req, res) => {
  if (!req.url) {
    res.writeHead(400).end("Bad request");
    return;
  }

  cors(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  if (req.url === "/api/health" || req.url === "/health") {
    const payload = host.payload();
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        ok: true,
        uptimeMs: payload.server.uptimeMs,
        simMs: payload.snapshot.simMs,
        clients: payload.server.clients,
        hasServerKey: payload.server.hasServerKey,
      }),
    );
    return;
  }

  if (req.url === "/api/snapshot" && req.method === "GET") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(host.payload()));
    return;
  }

  if (req.url === "/api/events" && req.method === "GET") {
    handleSse(res, "snapshot");
    return;
  }

  if (req.url === "/api/stream" && req.method === "GET") {
    handleSse(res, "stream");
    return;
  }

  if (req.url === "/api/command" && req.method === "POST") {
    void readJson(req)
      .then((body) => {
        const result = host.handleCommand(body);
        res.writeHead(result.ok ? 200 : 400, {
          "content-type": "application/json; charset=utf-8",
        });
        res.end(JSON.stringify(result));
      })
      .catch((err: unknown) => {
        res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: String(err) }));
      });
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405).end("Method not allowed");
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Office Agent Sim server on http://localhost:${PORT}`);
  console.log(`Always-on host active — agents keep working with 0 clients`);
});

process.on("SIGINT", () => {
  host.stop();
  process.exit(0);
});
process.on("SIGTERM", () => {
  host.stop();
  process.exit(0);
});
