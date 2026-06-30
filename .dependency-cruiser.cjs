/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-foundry-in-0gkit",
      comment:
        "Neutral toolkit packages (packages/0gkit-*/src) must never depend on " +
        "Foundry (or any non-0gkit) code. Intra-toolkit imports " +
        "(@foundryprotocol/0gkit-*) are allowed; @foundryprotocol/sdk and any " +
        "other @foundryprotocol/* are forbidden. Hard architectural invariant.",
      severity: "error",
      from: { path: "^packages/0gkit-[^/]+/src" },
      to: { path: "^@foundryprotocol/(?!0gkit-)" },
    },
    {
      name: "lib-must-not-import-apps",
      comment:
        "The neutral toolkit library packages (packages/0gkit-*/src) are " +
        "consumer-facing and must never depend on the apps (playground, docs) " +
        "or the starter templates. Libraries point down, apps point up.",
      severity: "error",
      from: { path: "^packages/0gkit-[^/]+/src" },
      to: { path: "^apps/|^templates/" },
    },
    {
      name: "no-kits-engine-to-0gkit",
      comment:
        "The kits engine (packages/0gkit-kits/src) must remain pure: only " +
        "zod, giget, and node:* are allowed as external deps. It must never " +
        "import any other @foundryprotocol/* package — neither toolkit packages " +
        "(@foundryprotocol/0gkit-*) nor Foundry app packages. This keeps the " +
        "engine neutral and CLI cold-start unaffected (D78).",
      severity: "error",
      from: { path: "^packages/0gkit-kits/src" },
      to: { path: "^@foundryprotocol/" },
    },
    {
      name: "no-kit-overlay-to-foundry-app",
      comment:
        "Kit overlays (templates/_kits/) may import @foundryprotocol/0gkit-* " +
        "toolkit packages (they are consumer code, applied into user projects). " +
        "They must NEVER import non-0gkit @foundryprotocol/* packages such as " +
        "@foundryprotocol/sdk or any Foundry app package (D78).",
      severity: "error",
      from: { path: "^templates/_kits/" },
      to: { path: "^@foundryprotocol/(?!0gkit-)" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "types"],
    },
  },
};
