// Minimal ANSI color helper (per D4) — no `chalk` to dodge its ESM-only
// load order hazards. Respects NO_COLOR and only emits codes when stdout is a TTY.
const isTTY = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap =
  (code: string) =>
  (s: string): string =>
    isTTY ? `\x1b[${code}m${s}\x1b[0m` : s;

export const bold = wrap("1");
export const dim = wrap("2");
export const green = wrap("32");
export const cyan = wrap("36");
export const yellow = wrap("33");
