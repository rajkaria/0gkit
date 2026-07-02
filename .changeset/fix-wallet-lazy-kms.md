---
"@foundryprotocol/0gkit-wallet": patch
---

Load the optional `@aws-sdk/client-kms` peer dependency lazily inside `fromKMS()`
through a runtime-assembled specifier, instead of a top-level static import. The
static import forced every bundler (Turbopack/webpack/Vite) to resolve the AWS
SDK at build time — so any app that only uses `fromPrivateKey`/`fromEnv` and
never installs the optional SDK failed to build (e.g. the `chat` template's
browser bundle: "Module not found: Can't resolve '@aws-sdk/client-kms'"). Types
are now `import type` (erased) and the SDK is imported only when `fromKMS()` is
actually called. No API or runtime-behaviour change. Fixes the `chat`
fresh-machine smoke build.
