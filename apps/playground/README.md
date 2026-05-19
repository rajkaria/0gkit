# @foundryprotocol/0gkit-playground

Zero-setup web console for 0G. Run a Storage upload, an inference call, or an
attestation verification — see the receipt and explorer link — then **copy
working code** for every action in **CLI**, **TypeScript**, **curl**, or
**MCP** form.

Pure client over the public `@foundryprotocol/0gkit-*` packages (`@foundryprotocol/0gkit-react` hooks). No
builder-facing backend — the toolkit is the product; this is a thin demo over
it. Attestation verification is pure crypto and runs fully in the browser;
live Storage/Compute calls need a key and are best driven from the copy-code
(CLI/server), which is the honest path the console points you to.

## Develop

```bash
pnpm --filter @foundryprotocol/0gkit-playground dev      # next dev
pnpm --filter @foundryprotocol/0gkit-playground test     # codegen unit tests
pnpm --filter @foundryprotocol/0gkit-playground e2e      # Playwright golden-path smoke
```

## Golden path (spec §11.7 acceptance)

The Playwright smoke (`e2e/golden-path.spec.ts`) asserts: the console
renders, attestation verify runs live against the prefilled valid sample,
and copy-code produces the correct snippet for **all four forms across all
three actions**. The code generators (`lib/codegen.ts`) are pure and unit
tested exactly.
