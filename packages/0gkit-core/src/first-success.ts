export const FIRST_SUCCESS_MARKER = "[0gkit:first-success]";

export interface FirstSuccessArgs {
  op: string;
  id: string;
  note?: string;
}

export function printFirstSuccess(
  args: FirstSuccessArgs,
  sink: (line: string) => void = (l) => console.log(l)
): void {
  const heading = `${FIRST_SUCCESS_MARKER} ${args.op}`;
  const idLine = `id: ${args.id}`;
  const noteLine = args.note ? args.note : "";
  const width =
    Math.max(heading.length, idLine.length, noteLine.length, "First 0G action successful".length) +
    2;

  const top = "┌" + "─".repeat(width) + "┐";
  const bot = "└" + "─".repeat(width) + "┘";
  const pad = (s: string) => `│ ${s}${" ".repeat(Math.max(0, width - 1 - s.length))}│`;

  sink(top);
  sink(pad("First 0G action successful"));
  sink(pad(heading));
  sink(pad(idLine));
  if (noteLine) sink(pad(noteLine));
  sink(bot);
}
