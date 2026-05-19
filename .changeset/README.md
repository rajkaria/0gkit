# Changesets

This folder is managed by [changesets](https://github.com/changesets/changesets).
It drives coordinated, semver-correct versioning and the public changelog for
every `@foundryprotocol/0gkit-*` package. The packages are **linked** — they
always share one version number.

## Adding a changeset

Any PR that changes a published package **must** include a changeset:

```bash
pnpm changeset
```

Pick the affected packages, choose `patch` / `minor` / `major`, and write a
human-readable summary (this becomes the changelog entry).

## Releasing

On push to `main`, `.github/workflows/release.yml`:

- if there are pending changesets → opens/updates a **Version Packages** PR
- when that PR merges and `NPM_TOKEN` is set → publishes to npm

`@foundryprotocol/0gkit-playground` and `@foundryprotocol/0gkit-docs` are
private apps and are ignored by changesets.
