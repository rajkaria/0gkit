import type { SuiteResult, SuiteDeps } from "./index.js";

const TEST_MESSAGE = "0gkit-conformance-test";

export async function walletSuite(deps: SuiteDeps): Promise<SuiteResult> {
  const signer = deps.testWallet();
  const { address, signMessage } = signer;

  const signature = await signMessage(TEST_MESSAGE);

  // Recover the address from the signature using viem
  const { recoverMessageAddress } = await import("viem");
  const recovered = await recoverMessageAddress({
    message: TEST_MESSAGE,
    signature,
  });

  const ok = recovered.toLowerCase() === address.toLowerCase();
  return {
    name: "wallet",
    ok,
    detail: ok
      ? `signMessage + recoverMessageAddress matched (${address.slice(0, 10)}…)`
      : `address mismatch: expected ${address}, recovered ${recovered}`,
  };
}
