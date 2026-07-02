---
"@foundryprotocol/0gkit-storage": patch
---

Load the optional 0G Storage SDK through a runtime-assembled specifier so
bundlers (Turbopack, webpack, Vite) no longer statically resolve
`@0gfoundation/0g-storage-ts-sdk` at build time. The previous literal dynamic
`import("@0gfoundation/0g-storage-ts-sdk")` (esbuild strips the `as string`
cast, emitting a bare literal) made every bundler try to resolve this _optional_
peer dependency while building — hard-failing any app that doesn't install it,
e.g. a browser Next.js/Turbopack app that supplies its own `loadSdk`. The
specifier is now assembled at runtime, keeping the import lazy (SDK fetched only
on first storage op) while opaque to bundlers. No API or runtime-behaviour
change. Fixes the `react-app` and `chat` fresh-machine smoke builds.
