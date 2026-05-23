---
"@foundryprotocol/0gkit-cli": minor
---

`0g cost forecast` gains `--from-jaeger <path>`: replay a Jaeger v1 trace JSON
dump, aggregate spans carrying the `0gkit.*` attribute namespace (emitted by
`@foundryprotocol/0gkit-observability`) into per-op gas + fee totals, and
report them in human or `--json` form.

Dry-run spans (`0gkit.dry_run=true`) and errored spans (any `0gkit.error_code`
tag) are counted but excluded from cost totals — they did not spend on-chain
resources.

Mutually exclusive with `--storage` / `--compute` / `--da`.

```bash
0g cost forecast --from-jaeger ./trace.json --json
```
