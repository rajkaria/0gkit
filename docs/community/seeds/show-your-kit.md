# Show your kit — share a community kit

A **kit** is a composable overlay you apply to a base app with `0g add <kit>` —
it drops in a portable `lib/` tier, per-base `adapters/`, and (for React bases) a
`ui/` tier, deduping dependencies as it goes. The engine is **general**: the kits
we ship (`agent-memory`, `live-feed`, `ai-oracle`, `sealed-inference`,
`inft-studio`, `durable-agent`, `prediction-market`, `yield-intel`) have no
special status. If you've built one for others to install, this is the place to
show it.

**Post your kit with:**

- **What it does** and the problem it solves.
- **Which bases it targets** — `react-app`, `chat`, `mcp-agent`,
  `inference-app`, `ai-agent`, `tee-attested-api`, … (list what your `adapters/`
  cover).
- **How to try it** — the `0g add` line, or a repo/template link.
- **Which 0gkit packages it builds on** — e.g. `0gkit-storage` +
  `0gkit-compute` (`router()`).

**Want it in the box?** The kit format is documented end-to-end in
[**Authoring a kit**](https://0gkit.com/kits/authoring)
(`docs/kits/AUTHORING.md`): `kit.json` manifest, the three tiers, the
composition rules, and `0g kits list` / `0g kits info` for discovery. Solid,
well-tested community kits are exactly what makes the engine worth having — open
a thread here, and if it's a fit we'll help you land it upstream.

To browse what already exists: `0g kits list` (add `--base react-app` to filter),
then `0g kits info <kit>` for details.
