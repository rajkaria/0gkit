# Contributing to 0gkit

Thanks for helping build the neutral 0G toolkit.

## Setup

```bash
pnpm install
pnpm --filter @foundryprotocol/0gkit-core build   # core builds first
pnpm build                                        # everything
pnpm test
```

Requirements: Node `>=20.10`, pnpm `9.12.0` (via `packageManager`).

## Ground rules

1. **Neutrality.** Library packages (`packages/0gkit-*/src`) must never import
   the apps (`apps/playground`, `apps/docs`) or templates. Enforced by
   `pnpm boundary:check`.
2. **Every published change needs a changeset.** Run `pnpm changeset`, pick the
   affected packages and bump type, write a user-facing summary.
3. **CI must be green.** Format, lint, typecheck, build, tests, boundary, the
   playground smoke, and the docs build all run on every PR.
4. **Public API is a contract.** Breaking changes require a `major` changeset
   and a migration note in the package README + docs.

## Workflow

1. Branch off `main`.
2. Make the change with tests (we target 100% line coverage on pure modules).
3. `pnpm format && pnpm lint && pnpm test && pnpm boundary:check`.
4. `pnpm changeset`.
5. Open a PR. Squash-merge once CI is green.

## Releasing

Maintainers: the changesets bot opens a **Version Packages** PR. Merging it
publishes to npm (requires the `NPM_TOKEN` repo secret). All
`@foundryprotocol/0gkit-*` packages are version-linked.

## Reporting bugs / security

Open an issue, or for security see [SECURITY.md](./SECURITY.md).
