export type ZeroGErrorCode = "CONFIG" | "NETWORK" | "CHAIN" | "ATTESTATION";

/**
 * Base error for everything 0gkit throws. Every error carries an actionable
 * `hint` — the exact remedy (missing env var, `0g doctor`, which check failed).
 * No 0gkit code path ever fails silently.
 */
export class ZeroGError extends Error {
  readonly code: ZeroGErrorCode;
  readonly hint: string;

  constructor(code: ZeroGErrorCode, message: string, hint: string) {
    super(message);
    this.name = "ZeroGError";
    this.code = code;
    this.hint = hint;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ConfigError extends ZeroGError {
  constructor(message: string, hint: string) {
    super("CONFIG", message, hint);
    this.name = "ConfigError";
  }
}

export class NetworkError extends ZeroGError {
  constructor(message: string, hint: string) {
    super("NETWORK", message, hint);
    this.name = "NetworkError";
  }
}

export class ChainError extends ZeroGError {
  constructor(message: string, hint: string) {
    super("CHAIN", message, hint);
    this.name = "ChainError";
  }
}

export class AttestationError extends ZeroGError {
  constructor(message: string, hint: string) {
    super("ATTESTATION", message, hint);
    this.name = "AttestationError";
  }
}
