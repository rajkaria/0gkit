# Ideas: what should 0gkit build next?

This is the board for **feature ideas** — a new primitive, a helper on an
existing package, a template, a kit, a DX improvement. Rough is fine; you don't
need a full design.

**A useful idea post:**

- **The problem first.** "I keep hand-writing X every time I…" beats "add
  feature Y". The problem is what we can evaluate.
- **Where it'd live** if you have a guess — a package (`0gkit-storage`,
  `0gkit-compute`, …), the CLI, a template, or a kit.
- **A rough sketch** of the API you'd want, if you have one:

  ```ts
  // e.g. "I wish I could do:"
  await storage.uploadDir("./assets"); // upload a whole folder, get roots back
  ```

**How ideas move forward:** popular, well-shaped ideas graduate to an **RFC**
(for changes to a package's public surface) or straight to an **issue** (for
smaller additions). If your idea is really a "here's a kit I built for this",
post it in **Show your kit** instead — the engine is general, so a lot of ideas
are best shipped as community kits.

Upvote the ideas you'd use (👍 on the post) — it's the clearest signal we have.
