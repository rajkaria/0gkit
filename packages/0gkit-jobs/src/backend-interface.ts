/**
 * Re-export the canonical `JobBackend` interface and its record/claim types from a
 * dedicated entry so consumers writing their own backend can `import type` without
 * pulling the runner's runtime dependencies.
 *
 * Claim semantics:
 *
 *   1. `enqueue(name, input)` returns an opaque id. Implementations MUST persist the
 *      record with `state: "queued"`, `metadata.attempts: 0`, `metadata.createdAt: now`.
 *   2. `claim({ workerId })` MUST atomically transition exactly one queued job to
 *      `running`, increment `attempts`, set `startedAt`, and return the record.
 *      It MUST return `null` when no queued jobs remain. Concurrent claimers MUST
 *      NOT receive the same record.
 *   3. `complete(id, result)` transitions `running → done` and stamps `finishedAt`.
 *   4. `fail(id, error, retry)`:
 *        - retry=true:  `running → queued`, clear `startedAt`, set `metadata.lastError`.
 *        - retry=false: `running → failed`, set top-level `error`, stamp `finishedAt`.
 *   5. `cancel(id)` is best-effort: queued/running → cancelled, no-op for terminal states.
 *   6. `status(id)` returns the current record or `null` if unknown.
 *   7. `close()` releases the underlying connection. Idempotent.
 */
export type {
  JobBackend,
  JobRecord,
  JobState,
  JobMetadata,
  ClaimOpts,
} from "./types.js";
