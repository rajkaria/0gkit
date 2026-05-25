---
"@foundryprotocol/0gkit-observability": minor
"@foundryprotocol/0gkit-cli": minor
"@foundryprotocol/0gkit-core": patch
---

SP14: local `0g traces` explorer.

- `0gkit-observability` mirrors every instrumented span to JSONL when
  `OGKIT_TRACE_DIR` is set. Off by default, fire-and-forget; never replaces
  the configured OTel exporter. New exports: `appendSpanRecord`,
  `defaultTraceDir`, `isSinkEnabled`, `listTraceFiles`, `pathForTrace`,
  `readTraceFile`, `summarizeTrace`, plus `TraceFileEntry`,
  `TraceFileSummary`, `TraceRecord` types.
- New CLI subcommands: `0g traces list [--last N] [--dir <path>] [--json]`
  and `0g traces inspect <traceId> [--dir <path>] [--json]`. `inspect --json`
  emits a Jaeger-v1-shaped envelope.
- `0g cost forecast --from-jaeger -` now reads a Jaeger envelope from stdin
  so `inspect --json | cost forecast --from-jaeger -` pipes cleanly.
- New error codes: `OBSERVABILITY_TRACE_DIR_NOT_SET`,
  `OBSERVABILITY_TRACE_NOT_FOUND`, `OBSERVABILITY_TRACE_READ_FAILED`.
