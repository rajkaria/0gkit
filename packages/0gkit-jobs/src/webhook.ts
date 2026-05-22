import { createHmac, timingSafeEqual } from "node:crypto";

export function signWebhookBody(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

export function verifyWebhook(args: {
  body: string;
  signature: string;
  secret: string;
}): boolean {
  try {
    const provided = args.signature.startsWith("sha256=")
      ? args.signature.slice(7)
      : args.signature;
    const expected = signWebhookBody(args.body, args.secret);
    if (provided.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}
