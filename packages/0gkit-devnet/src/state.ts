import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { DevAccount } from "./accounts.js";

export interface DevnetService {
  url: string;
  port: number;
}

export interface DevnetChainService extends DevnetService {
  chainId: number;
  pid: number;
}

export interface DevnetState {
  pid: number;
  startedAt: string;
  chain: DevnetChainService;
  storage: DevnetService;
  compute: DevnetService & { mode: "stub" | "ollama" };
  da: DevnetService;
  accounts: DevAccount[];
  mnemonic: string;
  stateDir: string;
}

function defaultDir(): string {
  return join(homedir(), ".0g-dev");
}

function stateFile(dir?: string): string {
  return join(dir ?? defaultDir(), "devnet.json");
}

export function writeState(s: DevnetState, opts: { dir?: string } = {}): void {
  const p = stateFile(opts.dir);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(s, null, 2));
}

export function readState(opts: { dir?: string } = {}): DevnetState | null {
  const p = stateFile(opts.dir);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as DevnetState;
  } catch {
    return null;
  }
}

export function clearState(opts: { dir?: string } = {}): void {
  const p = stateFile(opts.dir);
  if (existsSync(p)) rmSync(p);
}
