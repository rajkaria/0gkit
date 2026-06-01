---
"@foundryprotocol/0gkit-core": minor
"@foundryprotocol/0gkit-cli": minor
---

Defect intelligence: turn any `ZeroGError` into a ready-to-file QA defect report.

- New `buildDefectReport(input)` in `0gkit-core` — renders the bilingual defect template used by the 0G ecosystem app-test program (github.com/lvxuan149/0g-apac-app-test). Auto-fills ownership, suggested severity, environment, actual result, and root-cause from the error; leaves repro/expected/screenshot for the human tester.
- New `suggestOwnership(code)` — routes infra-class codes (chain/storage/compute/DA/attestation/indexer) to `0G Infra`, integration/config codes to `Hackathon项目`.
- New `suggestSeverity(code)` — P1 for blockers, P3 for caller-fixable config, P2 otherwise (always rendered as a confirm-against-impact suggestion).
- Framework-agnostic (no deps) so a browser dApp's error boundary and the CLI emit the same report.
- CLI: new `--defect-report` global flag emits the report to stderr on error (mirrors `--copy-issue-context`; keeps `--json` stdout clean).
