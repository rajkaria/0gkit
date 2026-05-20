import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash } from "node:crypto";

export interface DaMockHandle {
  url: string;
  port: number;
  stop(): Promise<void>;
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

export async function startDaMock(opts: { port: number }): Promise<DaMockHandle> {
  const store = new Map<string, Buffer>();

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      if (req.method === "POST" && req.url === "/publish") {
        const bytes = await readBody(req);
        const digest = "0x" + createHash("sha256").update(bytes).digest("hex");
        store.set(digest, bytes);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ digest, size: bytes.length }));
        return;
      }
      if (req.method === "GET" && req.url?.startsWith("/verify/")) {
        const digest = req.url.slice("/verify/".length);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ available: store.has(digest) }));
        return;
      }
      if (req.method === "GET" && req.url?.startsWith("/fetch/")) {
        const digest = req.url.slice("/fetch/".length);
        const bytes = store.get(digest);
        if (!bytes) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200, { "content-type": "application/octet-stream" });
        res.end(bytes);
        return;
      }
      res.writeHead(404);
      res.end();
    } catch (e) {
      res.writeHead(500);
      res.end((e as Error).message);
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
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
