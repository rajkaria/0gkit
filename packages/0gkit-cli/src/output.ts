export interface CommandResult {
  /** Pretty human lines (one console line each). */
  human: string[];
  /** Machine payload merged under `{ ok: true, ... }` for --json. */
  json: Record<string, unknown>;
}

export interface RenderedError {
  code: string;
  message: string;
  hint: string;
}

export interface OutputConfig {
  json: boolean;
  isTTY: boolean;
  noColor: boolean;
  write: (line: string) => void;
}

export interface Output {
  readonly json: boolean;
  success(result: CommandResult): void;
  failure(error: RenderedError): void;
  note(line: string): void;
}

export function createOutput(cfg: OutputConfig): Output {
  const useColor = cfg.isTTY && !cfg.noColor;
  const paint = (code: string, s: string): string =>
    useColor ? `\x1b[${code}m${s}\x1b[0m` : s;
  const red = (s: string) => paint("31", s);
  const dim = (s: string) => paint("2", s);

  return {
    json: cfg.json,
    success(result) {
      if (cfg.json) {
        cfg.write(JSON.stringify({ ok: true, ...result.json }));
        return;
      }
      for (const line of result.human) cfg.write(line);
    },
    failure(error) {
      if (cfg.json) {
        cfg.write(
          JSON.stringify({
            ok: false,
            error: { code: error.code, message: error.message, hint: error.hint },
          })
        );
        return;
      }
      cfg.write(red(`✗ ${error.message}`));
      cfg.write(dim(`  → ${error.hint}`));
    },
    note(line) {
      if (!cfg.json) cfg.write(line);
    },
  };
}
