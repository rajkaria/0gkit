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
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "types"],
    },
  },
};
