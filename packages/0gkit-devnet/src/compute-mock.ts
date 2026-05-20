import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

export type ComputeMockMode = "stub" | "ollama";

export interface ComputeMockHandle {
  url: string;
  port: number;
  mode: ComputeMockMode;
  stop(): Promise<void>;
}

async function detectOllama(): Promise<string | null> {
  try {
    const r = await fetch("http://127.0.0.1:11434/api/tags", {
      signal: AbortSignal.timeout(500),
    });
    return r.ok ? "http://127.0.0.1:11434" : null;
  } catch {
    return null;
  }
}

async function readJson<T = unknown>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

async function callOllama(prompt: string, model: string): Promise<string> {
  try {
    const r = await fetch("http://127.0.0.1:11434/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, prompt, stream: false }),
    });
    if (!r.ok) return `[MOCK ollama unreachable] ${prompt}`;
    const j = (await r.json()) as { response?: string };
    return j.response ?? `[MOCK ollama empty] ${prompt}`;
  } catch (e) {
    return `[MOCK ollama error: ${(e as Error).message}] ${prompt}`;
  }
}

export async function startComputeMock(opts: {
  port: number;
  mode?: ComputeMockMode;
  ollamaModel?: string;
}): Promise<ComputeMockHandle> {
  const detected = await detectOllama();
  const mode: ComputeMockMode = opts.mode ?? (detected ? "ollama" : "stub");
  const ollamaModel = opts.ollamaModel ?? "llama3";

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      if (req.method === "GET" && req.url === "/v1/models") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            object: "list",
            data: [{ id: "0g/stub", object: "model", owned_by: "0gkit-devnet" }],
          })
        );
        return;
      }
      if (req.method === "POST" && req.url === "/v1/chat/completions") {
        const body = await readJson<{
          model: string;
          messages: { role: string; content: string }[];
        }>(req);
        const last = body.messages?.[body.messages.length - 1]?.content ?? "";
        const content =
          mode === "stub"
            ? `[MOCK] echoing: ${last}`
            : await callOllama(last, ollamaModel);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            id: `chatcmpl-mock-${Date.now()}`,
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: body.model,
            choices: [
              {
                index: 0,
                message: { role: "assistant", content },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: Math.max(1, last.length),
              completion_tokens: Math.max(1, content.length),
              total_tokens: Math.max(1, last.length + content.length),
            },
          })
        );
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
    mode,
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
