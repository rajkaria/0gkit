---
"@foundryprotocol/0gkit-storage": patch
---

Annotate the lazy `import()` of the optional 0G Storage SDK with
`webpackIgnore` / `turbopackIgnore` / `@vite-ignore` magic comments so bundlers
leave it as a runtime import instead of trying to resolve
`@0gfoundation/0g-storage-ts-sdk` at build time. The bare literal dynamic import
made Turbopack/webpack hard-fail any app that doesn't install this _optional_
peer dependency — e.g. a browser Next.js/Turbopack app supplying its own
`loadSdk`. The SDK is still loaded lazily at runtime, on first storage op — no
API or runtime-behaviour change. Fixes the `react-app` and `chat` fresh-machine
smoke builds.
