import { trace, SpanStatusCode, type Span } from "@opentelemetry/api";
import { ATTR } from "./attributes.js";

const TRACER_NAME = "@foundryprotocol/0gkit-observability";

/**
 * Per-call attribute extraction. Receives the call's arguments, the (already
 * resolved) result for post-attrs (or `undefined` pre-call), and the receiver
 * instance. Returns a key/value map of OTel attributes. `undefined` values are
 * filtered out before being applied to the span.
 */
export type AttrFn = (
  args: unknown[],
  result: unknown,
  instance: unknown
) => Record<string, unknown>;

interface WrapEntry {
  target: Record<string, unknown>;
  method: string;
  original: (...args: unknown[]) => unknown;
}

const wrapped: WrapEntry[] = [];

/**
 * Patch `target[method]` with an async wrapper that opens an OTel span,
 * applies pre/post attribute mappers, records exceptions, and ends the span.
 *
 * Idempotent: the second call with the same target+method is a no-op (the
 * wrapper carries an `__0gkit_instrumented` marker we check on every entry).
 */
export function wrapMethod(
  target: Record<string, unknown>,
  method: string,
  opName: string,
  preAttrs: AttrFn,
  postAttrs: AttrFn
): void {
  if (!target || typeof target[method] !== "function") return;
  const original = target[method] as (...args: unknown[]) => unknown;
  if ((original as { __0gkit_instrumented?: boolean }).__0gkit_instrumented) return;

  const wrapper = async function (this: unknown, ...args: unknown[]) {
    const tracer = trace.getTracer(TRACER_NAME);
    return tracer.startActiveSpan(`0gkit.${opName}`, async (span: Span) => {
      span.setAttribute(ATTR.OP, opName);
      const pre = preAttrs(args, undefined, this);
      for (const [k, v] of Object.entries(pre)) {
        if (v !== undefined && v !== null) {
          span.setAttribute(k, v as string | number | boolean);
        }
      }
      try {
        const result = await original.apply(this, args);
        const post = postAttrs(args, result, this);
        for (const [k, v] of Object.entries(post)) {
          if (v !== undefined && v !== null) {
            span.setAttribute(k, v as string | number | boolean);
          }
        }
        span.end();
        return result;
      } catch (err) {
        const code = (err as { code?: unknown })?.code;
        if (typeof code === "string") span.setAttribute(ATTR.ERROR_CODE, code);
        span.recordException(err as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (err as Error).message ?? String(err),
        });
        span.end();
        throw err;
      }
    });
  };
  (wrapper as unknown as { __0gkit_instrumented: boolean }).__0gkit_instrumented =
    true;
  target[method] = wrapper as unknown as (...args: unknown[]) => unknown;
  wrapped.push({ target, method, original });
}

/**
 * Restore every patched method. Called by `disinstrument0g()` (mostly used by
 * tests to keep suites isolated; production code calls `instrument0g()` once
 * at boot and never reverses it).
 */
export function unwrapAll(): void {
  while (wrapped.length > 0) {
    const entry = wrapped.pop();
    if (!entry) continue;
    entry.target[entry.method] = entry.original;
  }
}
