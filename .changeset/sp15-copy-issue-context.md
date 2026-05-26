---
"@foundryprotocol/0gkit-cli": minor
---

Add `--copy-issue-context` global flag. On any thrown `ZeroGError`, the CLI now optionally prints a redacted markdown report to stderr — error code, hint, help URL, redacted CLI invocation (`--private-key` scrubbed, URL userinfo stripped from `--rpc`), Node + OS versions, installed `@foundryprotocol/0gkit-*` versions, and the top 10 stack frames. Designed to paste straight into a new GitHub issue.
