# RFCs: propose a design change

RFCs are for **changes to a package's public surface** — a new/renamed export, a
breaking signature change, a new package, or a cross-cutting convention. If it
would change what a user imports or how they call it, it belongs here before it
becomes a PR.

**Why RFCs exist:** 0gkit follows a strict **additive-only** rule for published
surfaces (Decision D13) — we don't rename or remove exports, we add alongside.
An RFC is where we agree on the new surface _before_ code, so the additive path
stays clean and we don't ship a shape we regret.

**An RFC post should have:**

1. **Summary** — one paragraph: what changes and why.
2. **Motivation** — the concrete problem. Link a Q&A thread or issue if one
   exists.
3. **Proposed surface** — the exact TypeScript you're proposing:

   ```ts
   // new export
   export function fooBar(opts: FooBarOptions): Promise<FooResult>;
   ```

4. **Alternatives** — what else you considered, including "do nothing".
5. **Compatibility** — confirm it's additive (no rename/removal), or explain the
   migration if it can't be.

**Lifecycle:** discuss → maintainer signals accept/decline → an accepted RFC
gets an issue + a PR that references this thread. Small, obviously-additive
helpers can skip straight to a PR — RFCs are for the changes worth debating
first.
