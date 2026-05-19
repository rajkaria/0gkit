/**
 * Browser stub for the optional, Node-only 0G SDK peers.
 *
 * The playground is a pure client. The `@0gfoundation/*` storage/compute
 * SDKs are Node-oriented (filesystem, native crypto) and are never usable
 * in the browser. Turbopack aliases those bare specifiers to this module
 * (see next.config.ts) so the bundle stays clean. When a live upload/infer
 * is attempted, the consuming hook's existing guard sees the missing export
 * and surfaces a clear ConfigError in the UI — which is the honest outcome:
 * those actions need a server/CLI. Attestation verify (pure crypto) and the
 * copy-code widget are fully functional client-side.
 */
export {};
