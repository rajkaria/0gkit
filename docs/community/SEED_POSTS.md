# Community seed posts

The canonical bodies for the welcome/seed post in each GitHub Discussions
category on [`rajkaria/0gkit`](https://github.com/rajkaria/0gkit/discussions).
[`scripts/setup-discussions.sh`](../../scripts/setup-discussions.sh) posts these
verbatim (idempotently — it skips a category whose seed title already exists).

Edit the body files here, then re-run the script to update — treat this dir as
the source of truth for community boilerplate.

## The five categories & their seeds

| Category          | Answerable | Seed post title                         | Body source                                          |
| ----------------- | ---------- | --------------------------------------- | ---------------------------------------------------- |
| **Q&A**           | yes        | How to ask great questions (start here) | [`HOW_TO_ASK.md`](./HOW_TO_ASK.md)                   |
| **Show and tell** | no         | Welcome to Show and tell 👋             | [`seeds/show-and-tell.md`](./seeds/show-and-tell.md) |
| **Ideas**         | no         | Ideas: what should 0gkit build next?    | [`seeds/ideas.md`](./seeds/ideas.md)                 |
| **RFCs**          | no         | RFCs: propose a design change           | [`seeds/rfcs.md`](./seeds/rfcs.md)                   |
| **Show your kit** | no         | Show your kit — share a community kit   | [`seeds/show-your-kit.md`](./seeds/show-your-kit.md) |

## Categories that need one-time UI creation

GitHub's API can create **discussions** but **not discussion categories** (no
`createDiscussionCategory` mutation exists) and cannot **pin** a discussion (no
`pinDiscussion` mutation). So two steps are manual, one-time:

1. **Create the `RFCs` and `Show your kit` categories** in the repo UI:
   _Discussions → ⚙️ (Edit categories) → New category_. Set both to the
   **"Open-ended discussion"** format (answerable **off**). GitHub will slug them
   `rfcs` and `show-your-kit` (the URLs the landing footer + docs use).
   `Q&A`, `Show and tell`, and `Ideas` already exist.
2. **Pin "How to ask great questions"** in Q&A after the script posts it:
   open the discussion → **⋯ → Pin discussion**.

Once the two categories exist, re-run `scripts/setup-discussions.sh` — it will
seed them (and skip the three already-seeded ones).

## The pinned "how to ask" flow

The Q&A seed ([`HOW_TO_ASK.md`](./HOW_TO_ASK.md)) routes all support through the
shipped `--copy-issue-context` CLI flag (SP15): re-run the failing `0g` command
with `--copy-issue-context` and paste the **redacted** markdown block. That keeps
reports reproducible and secret-free without asking maintainers to chase details.
