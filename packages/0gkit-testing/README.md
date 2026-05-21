# @foundryprotocol/0gkit-testing

Test toolkit for 0gkit. Mock providers, fixture factories, a deterministic
`testWallet`, a `setupLocalDevnet()` vitest helper, and four vitest matchers
that understand 0G semantics.

```bash
npm i -D @foundryprotocol/0gkit-testing
```

## Mocks — sub-millisecond primitives

```ts
import {
  mockStorageClient,
  mockComputeClient,
  mockDAClient,
} from "@foundryprotocol/0gkit-testing";

const storage = mockStorageClient();
const { root, tx } = await storage.upload(new TextEncoder().encode("gm"));
const bytes = await storage.download(root); // round-trips deterministically

const compute = mockComputeClient(); // default echo responder
const reply = await compute.chat([{ role: "user", content: "ping" }]);
//=> { role: "assistant", content: "echo: ping", tx, raw }

const da = mockDAClient();
const { digest } = await da.publish(bytes);
const ok = await da.verify(digest, bytes); // true; tamper bytes → false
```

Same `upload` / `download` / `chat` / `publish` shape as the real packages.
Roots and digests are sha256 of the input bytes — deterministic, so tests
assert on stable values without snapshots.

## Fixtures

```ts
import {
  fixtureReceipt,
  fixtureAttestation,
  FIXTURE_ATTESTATION_SIGNER,
} from "@foundryprotocol/0gkit-testing";

const tx = fixtureReceipt({ blockNumber: 17n });
// { txHash: "0xab...ab", blockNumber: 17n, latencyMs: 5 }

const signed = await fixtureAttestation({ scores: [0.9, 0.85] });
// signed.envelope, signed.digest, signed.signature — verifies with
// @foundryprotocol/0gkit-attestation.verifyEnvelope(signed, FIXTURE_ATTESTATION_SIGNER)
```

## `testWallet` — deterministic Signer

```ts
import { testWallet } from "@foundryprotocol/0gkit-testing";

const signer = testWallet({ index: 0 });
// Matches anvil's pre-funded dev account 0:
// address = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

Uses the same mnemonic as `0gkit-devnet`'s pre-funded accounts, so any test
hitting `setupLocalDevnet()` with `testWallet({ index: 0 })` has gas
immediately — no faucet round-trip.

## `setupLocalDevnet({ autoStart })`

```ts
// vitest.config.ts
import { setupLocalDevnet } from "@foundryprotocol/0gkit-testing";
export default {
  test: {
    globalSetup: ["./vitest.setup.ts"],
  },
};

// vitest.setup.ts
import { setupLocalDevnet } from "@foundryprotocol/0gkit-testing";
export default async function () {
  const devnet = await setupLocalDevnet({ autoStart: true });
  return () => devnet.stop();
}
```

Per-suite is equally easy:

```ts
import { beforeAll, afterAll } from "vitest";
import { setupLocalDevnet } from "@foundryprotocol/0gkit-testing";

const devnet = await setupLocalDevnet();
beforeAll(() => devnet.start());
afterAll(() => devnet.stop());
```

Lazily imports `@foundryprotocol/0gkit-devnet` so this package stays light
when devnet isn't needed.

## Vitest matchers

```ts
// vitest.setup.ts
import "@foundryprotocol/0gkit-testing/matchers";
```

```ts
expect(receipt).toBeConfirmedOn0G();
expect(root).toHaveRootMatching(/^0xab/);
await expect(signed).toBeValidAttestation(FIXTURE_ATTESTATION_SIGNER);
expect(err).toBeZeroGError("CONFIG");
```

Failure messages name what was expected, what was received, and (when
possible) a one-line hint pointing at the likely cause.

| Matcher                                 | Asserts                                                                                       |
| --------------------------------------- | --------------------------------------------------------------------------------------------- |
| `toBeConfirmedOn0G()`                   | Receipt has hex txHash, positive bigint blockNumber, non-negative latencyMs.                  |
| `toHaveRootMatching(regex)`             | Value is a 32-byte hex root that matches the regex.                                           |
| `toBeValidAttestation(expectedSigner?)` | Digest is intact and the signature recovers (optionally to the expected signer).              |
| `toBeZeroGError(code)`                  | Error is a `ZeroGError` with the named code (`CONFIG` / `NETWORK` / `CHAIN` / `ATTESTATION`). |

## Tree-shaking sub-paths

Cherry-pick what you need to keep the test bundle small:

```ts
import { mockStorageClient } from "@foundryprotocol/0gkit-testing/mocks";
import { fixtureReceipt } from "@foundryprotocol/0gkit-testing/fixtures";
```

## Notes

- `0gkit-attestation` is an _optional_ runtime dep — `fixtureAttestation` and
  `toBeValidAttestation` lazily import it. Install it alongside if you use
  those features.
- `setupLocalDevnet` requires `@foundryprotocol/0gkit-devnet` (declared as a
  devDep here; install it where you use it).

## License

MIT
