# How to ask great questions (start here)

Welcome to 0gkit Q&A 👋 — this is the fastest way to get an answer that actually
solves your problem. A good question gives a helper everything they need to
reproduce what you saw, in one read.

## The 30-second recipe

1. **Re-run your failing command with `--copy-issue-context`.** Every `0g`
   command supports it. On error it prints a **redacted** markdown report to
   stderr — your OS, Node version, installed `@foundryprotocol/0gkit-*` versions,
   the active network, and the error code/stack — with secrets (private keys,
   API keys, RPC URLs with tokens) stripped out.

   ```bash
   0g storage upload ./photo.png --copy-issue-context
   # …fails…
   # ---8<--- copy everything below into your question ---8<---
   ```

2. **Paste that block** into your question, inside a fenced ` ```md ` code
   block.

3. **Add the one line you expected vs. what happened.** "I expected an upload
   root back; instead I got `STORAGE_UPLOAD_FAILED`."

That's it. If your command doesn't error but behaves oddly, still include the
exact command, the network (`galileo` / local devnet / mainnet), and your
package versions (`0g --version` and `npm ls @foundryprotocol/0gkit-cli`).

## Etiquette that gets you answered faster

- **One question per thread.** Separate problems get separate answers and stay
  searchable for the next person.
- **Minimal repro over the whole app.** The 10 lines that fail beat a link to a
  200-file repo.
- **Say what you already tried.** It saves a round-trip and shows helpers where
  to start.
- **Mark the answer.** When a reply solves it, click **Mark as answer** — it
  closes the loop and helps the next person who searches.

## Before you post — quick self-serve checks

- **Error codes** are documented one-per-page with causes and fixes:
  <https://docs.0gkit.com/errors> (e.g. `CHAIN_RPC_UNREACHABLE`,
  `COMPUTE_NO_PROVIDER`, `STORAGE_ROOT_MISMATCH`).
- **`0g doctor`** checks your environment; **`0g doctor --fix`** applies the safe
  fixes it can (generates a missing `.env` from `define0GConfig`, flags stale
  package pins).
- **`0g test`** runs the offline conformance suites — a green `0g test` rules out
  a broken install before you file.

## Where each thing goes

- **A bug or "why doesn't this work?"** → **Q&A** (here). Include the
  `--copy-issue-context` block.
- **A reproducible defect / regression** → a
  [GitHub issue](https://github.com/rajkaria/0gkit/issues) with the same context
  block.
- **"Look what I built"** → **Show and tell**.
- **A feature idea** → **Ideas**.
- **A design change to a package's public surface** → **RFCs**.
- **A kit you made for others to install** → **Show your kit** (see
  [authoring a kit](https://0gkit.com/kits/authoring)).

Thanks for keeping the boards clean and reproducible — it's what makes 0gkit a
good place to build. 🛠️
