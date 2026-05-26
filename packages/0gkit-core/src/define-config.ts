import { z, type ZodTypeAny, type ZodRawShape } from "zod";
import { ConfigError } from "./errors.js";

export interface DefineConfigOptions {
  server?: ZodRawShape;
  client?: ZodRawShape;
  edge?: ZodRawShape;
}

export interface DefinedConfig<O extends DefineConfigOptions> {
  server: (env?: Record<string, string | undefined>) => SchemaOf<O["server"]>;
  client: (env?: Record<string, string | undefined>) => SchemaOf<O["client"]>;
  edge: (env?: Record<string, string | undefined>) => SchemaOf<O["edge"]>;
  envExample: () => string;
}

type SchemaOf<S> = S extends ZodRawShape
  ? z.infer<z.ZodObject<S>>
  : Record<string, never>;

const NEXT_PUBLIC_PREFIX = "NEXT_PUBLIC_";

function buildSlot(shape: ZodRawShape | undefined) {
  if (!shape) {
    return (_env?: Record<string, string | undefined>): Record<string, never> => ({});
  }
  const obj = z.object(shape);
  return (env?: Record<string, string | undefined>) => {
    const source = env ?? (typeof process !== "undefined" ? process.env : {});
    const picked: Record<string, string | undefined> = {};
    for (const key of Object.keys(shape)) {
      if (source[key] !== undefined) picked[key] = source[key];
    }
    const result = obj.safeParse(picked);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      throw new ConfigError(
        `0gkit config validation failed — ${issues}`,
        "Check your .env.example and ensure required vars are set."
      );
    }
    return result.data as unknown as Record<string, unknown>;
  };
}

function exampleValue(schema: ZodTypeAny): string {
  const def = schema._def as { defaultValue?: () => unknown };
  if (typeof def.defaultValue === "function") {
    const v = def.defaultValue();
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
      return String(v);
  }
  return "";
}

function envExampleFor(shape: ZodRawShape): string {
  const lines: string[] = [];
  for (const [key, schemaUnknown] of Object.entries(shape)) {
    const schema = schemaUnknown as ZodTypeAny;
    const desc = schema.description;
    if (desc) lines.push(`# ${desc}`);
    lines.push(`${key}=${exampleValue(schema)}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

export function define0GConfig<O extends DefineConfigOptions>(
  opts: O
): DefinedConfig<O> {
  if (opts.client) {
    for (const key of Object.keys(opts.client)) {
      if (!key.startsWith(NEXT_PUBLIC_PREFIX)) {
        throw new Error(
          `define0GConfig.client schema key "${key}" must start with NEXT_PUBLIC_ — only public vars belong in the client slot.`
        );
      }
    }
  }

  const serverParse = buildSlot(opts.server);
  const clientParse = buildSlot(opts.client);
  const edgeParse = buildSlot(opts.edge);

  return {
    server: serverParse as DefinedConfig<O>["server"],
    client: clientParse as DefinedConfig<O>["client"],
    edge: edgeParse as DefinedConfig<O>["edge"],
    envExample: () => {
      const parts: string[] = [];
      if (opts.server)
        parts.push("# --- server (Node only) ---\n" + envExampleFor(opts.server));
      if (opts.client)
        parts.push(
          "# --- client (browser-safe, NEXT_PUBLIC_*) ---\n" +
            envExampleFor(opts.client)
        );
      if (opts.edge) parts.push("# --- edge runtime ---\n" + envExampleFor(opts.edge));
      return parts.join("\n");
    },
  };
}
