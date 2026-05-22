import Database from "better-sqlite3";
import { ZeroGError } from "@foundryprotocol/0gkit-core";
import type { JobBackend, JobRecord, JobState } from "../types.js";

interface SqliteOpts {
  path: string;
}

interface JobRow {
  id: string;
  name: string;
  state: JobState;
  input: string;
  result: string | null;
  error: string | null;
  attempts: number;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
  last_error: string | null;
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class SqliteBackend implements JobBackend {
  private db: Database.Database;

  constructor(opts: SqliteOpts) {
    this.db = new Database(opts.path);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        state TEXT NOT NULL,
        input TEXT NOT NULL,
        result TEXT,
        error TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        finished_at INTEGER,
        last_error TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_jobs_state_created ON jobs(state, created_at);
    `);
  }

  async enqueue<I>(name: string, input: I): Promise<string> {
    const jobId = makeId();
    this.db
      .prepare(
        "INSERT INTO jobs (id, name, state, input, attempts, created_at) VALUES (?, ?, 'queued', ?, 0, ?)"
      )
      .run(jobId, name, JSON.stringify(input), Date.now());
    return jobId;
  }

  async claim(): Promise<JobRecord | null> {
    const row = this.db
      .prepare(
        `UPDATE jobs SET state='running', attempts=attempts+1, started_at=?
         WHERE id = (SELECT id FROM jobs WHERE state='queued' ORDER BY created_at LIMIT 1)
         RETURNING *`
      )
      .get(Date.now()) as JobRow | undefined;
    if (!row) return null;
    return this.rowToRecord(row);
  }

  async complete<O>(jobId: string, result: O): Promise<void> {
    const res = this.db
      .prepare("UPDATE jobs SET state='done', result=?, finished_at=? WHERE id=?")
      .run(JSON.stringify(result), Date.now(), jobId);
    if (res.changes === 0) {
      throw new ZeroGError(
        "JOBS_JOB_NOT_FOUND",
        `job ${jobId} not found`,
        "verify the id"
      );
    }
  }

  async fail(jobId: string, error: string, retry: boolean): Promise<void> {
    const next = retry ? "queued" : "failed";
    const errorCol = retry ? null : error;
    const res = this.db
      .prepare(
        `UPDATE jobs
         SET state=?, error=COALESCE(?, error), last_error=?, finished_at=?, started_at=NULL
         WHERE id=?`
      )
      .run(next, errorCol, error, Date.now(), jobId);
    if (res.changes === 0) {
      throw new ZeroGError(
        "JOBS_JOB_NOT_FOUND",
        `job ${jobId} not found`,
        "verify the id"
      );
    }
  }

  async cancel(jobId: string): Promise<void> {
    const row = this.db.prepare("SELECT * FROM jobs WHERE id=?").get(jobId) as
      | JobRow
      | undefined;
    if (!row) {
      throw new ZeroGError(
        "JOBS_JOB_NOT_FOUND",
        `job ${jobId} not found`,
        "verify the id"
      );
    }
    this.db
      .prepare(
        "UPDATE jobs SET state='cancelled', finished_at=? WHERE id=? AND state IN ('queued','running')"
      )
      .run(Date.now(), jobId);
  }

  async status(jobId: string): Promise<JobRecord | null> {
    const row = this.db.prepare("SELECT * FROM jobs WHERE id=?").get(jobId) as
      | JobRow
      | undefined;
    return row ? this.rowToRecord(row) : null;
  }

  async close(): Promise<void> {
    this.db.close();
  }

  private rowToRecord(r: JobRow): JobRecord {
    return {
      id: r.id,
      name: r.name,
      state: r.state,
      input: JSON.parse(r.input),
      result: r.result ? JSON.parse(r.result) : undefined,
      error: r.error ?? undefined,
      metadata: {
        attempts: r.attempts,
        createdAt: r.created_at,
        startedAt: r.started_at ?? undefined,
        finishedAt: r.finished_at ?? undefined,
        lastError: r.last_error ?? undefined,
      },
    };
  }
}
