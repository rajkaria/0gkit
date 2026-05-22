import type { z } from "zod";
import type { JobDefinition, JobHandlerContext } from "./types.js";

interface DefineArgs<I, O> {
  name: string;
  input: z.ZodType<I>;
  output: z.ZodType<O>;
  handler: (ctx: JobHandlerContext<I>) => Promise<O>;
  maxAttempts?: number;
  backoffMs?: (attempt: number) => number;
}

function defaultBackoff(attempt: number): number {
  const base = 500;
  const cap = 60_000;
  const upper = Math.min(base * Math.pow(2, attempt), cap);
  const lower = upper / 2;
  return Math.floor(lower + Math.random() * (upper - lower));
}

export function define<I, O>(args: DefineArgs<I, O>): JobDefinition<I, O> {
  return {
    name: args.name,
    inputSchema: args.input,
    outputSchema: args.output,
    handler: args.handler,
    maxAttempts: args.maxAttempts ?? 3,
    backoffMs: args.backoffMs ?? defaultBackoff,
  };
}
