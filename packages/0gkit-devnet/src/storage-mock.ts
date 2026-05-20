import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

export interface StorageMockHandle {
  url: string;
  port: number;
  stateDir: string;
  stop(): Promise<void>;
}

function rootOf(bytes: Buffer): string {
  // SHA-256 of bytes, prefixed 0x. The real 0G Storage Merkle root differs;
  // for mock purposes we just need a deterministic, collision-resistant key.
  return "0x" + createHash("sha256").update(bytes).digest("hex");
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

export async function startStorageMock(opts: {
  port: number;
  stateDir: string;
}): Promise<StorageMockHandle> {
  mkdirSync(opts.stateDir, { recursive: true });

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      if (req.method === "POST" && req.url === "/upload") {
        const bytes = await readBody(req);
        const root = rootOf(bytes);
        writeFileSync(join(opts.stateDir, root), bytes);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ root, size: bytes.length }));
        return;
      }
      if (req.method === "GET" && req.url?.startsWith("/download/")) {
        const root = req.url.slice("/download/".length);
        const path = join(opts.stateDir, root);
        if (!existsSync(path)) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200, { "content-type": "application/octet-stream" });
        res.end(readFileSync(path));
        return;
      }
      if (req.method === "GET" && req.url?.startsWith("/exists/")) {
        const root = req.url.slice("/exists/".length);
        const path = join(opts.stateDir, root);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ exists: existsSync(path) }));
        return;
      }
      res.writeHead(404);
      res.end();
    } catch (e) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: (e as Error).message }));
    }
  });

  await new Promise<void>((r) => server.listen(opts.port, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") {
    throw new Error("server.address() returned unexpected value");
  }
  const port = addr.port;

  return {
    url: `http://127.0.0.1:${port}`,
    port,
    stateDir: opts.stateDir,
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
