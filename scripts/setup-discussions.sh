#!/usr/bin/env bash
#
# setup-discussions.sh — stand up the 0gkit community Discussions surface.
#
# Idempotent runbook (safe to re-run): seeds one welcome post per category from
# docs/community/, skipping any category whose seed already exists. It does NOT
# create categories or pin posts — GitHub's API exposes no createDiscussionCategory
# or pinDiscussion mutation, so those two steps are one-time manual UI actions,
# printed at the end.
#
# Requirements: `gh` authenticated with `repo` scope (gh auth status).
# Usage:        scripts/setup-discussions.sh            # seed live
#               DRY_RUN=1 scripts/setup-discussions.sh  # print what it would do
#
set -euo pipefail

REPO_OWNER="rajkaria"
REPO_NAME="0gkit"
DRY_RUN="${DRY_RUN:-0}"

# Resolve to this script's repo root so body-file paths work from anywhere.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMMUNITY="$ROOT/docs/community"

# Seed manifest: "Category Name|Discussion title|body file (relative to docs/community)"
SEEDS=(
  "Q&A|How to ask great questions (start here)|HOW_TO_ASK.md"
  "Show and tell|Welcome to Show and tell 👋|seeds/show-and-tell.md"
  "Ideas|Ideas: what should 0gkit build next?|seeds/ideas.md"
  "RFCs|RFCs: propose a design change|seeds/rfcs.md"
  "Show your kit|Show your kit — share a community kit|seeds/show-your-kit.md"
)

echo "▸ Ensuring Discussions is enabled on $REPO_OWNER/$REPO_NAME…"
if [[ "$DRY_RUN" != "1" ]]; then
  gh api -X PATCH "repos/$REPO_OWNER/$REPO_NAME" -F has_discussions=true >/dev/null
fi

echo "▸ Fetching repo id, categories, and existing discussion titles…"
REPO_JSON="$(gh api graphql \
  -f query='query($owner:String!,$name:String!){
    repository(owner:$owner,name:$name){
      id
      discussionCategories(first:50){ nodes{ id name } }
      discussions(first:100){ nodes{ title } }
    }
  }' -f owner="$REPO_OWNER" -f name="$REPO_NAME")"

repo_id="$(printf '%s' "$REPO_JSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).data.repository.id))')"

# category name -> id  (via node so we avoid an external jq dependency)
cat_id_for() {
  printf '%s' "$REPO_JSON" | node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      const cats=JSON.parse(s).data.repository.discussionCategories.nodes;
      const hit=cats.find(c=>c.name===process.argv[1]);
      process.stdout.write(hit?hit.id:"");
    });' "$1"
}
title_exists() {
  printf '%s' "$REPO_JSON" | node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      const t=JSON.parse(s).data.repository.discussions.nodes.map(d=>d.title);
      process.exit(t.includes(process.argv[1])?0:1);
    });' "$1"
}

missing_categories=()
seeded=0
skipped=0

for row in "${SEEDS[@]}"; do
  IFS='|' read -r category title bodyrel <<<"$row"
  bodyfile="$COMMUNITY/$bodyrel"

  if [[ ! -f "$bodyfile" ]]; then
    echo "  ✗ body file missing: $bodyfile — skipping '$title'"; continue
  fi

  cat_id="$(cat_id_for "$category")"
  if [[ -z "$cat_id" ]]; then
    echo "  ⏭  category '$category' does not exist yet — skipping (create it in the UI, then re-run)"
    missing_categories+=("$category")
    continue
  fi

  if title_exists "$title"; then
    echo "  ✓ already seeded: [$category] $title"
    skipped=$((skipped+1))
    continue
  fi

  if [[ "$DRY_RUN" == "1" ]]; then
    echo "  · would post: [$category] $title  (<-- $bodyrel)"
    continue
  fi

  url="$(gh api graphql \
    -f query='mutation($repoId:ID!,$catId:ID!,$title:String!,$body:String!){
      createDiscussion(input:{repositoryId:$repoId,categoryId:$catId,title:$title,body:$body}){
        discussion{ url }
      }
    }' \
    -f repoId="$repo_id" -f catId="$cat_id" -f title="$title" -f body="$(cat "$bodyfile")" \
    --jq '.data.createDiscussion.discussion.url')"
  echo "  ✓ posted: [$category] $title -> $url"
  seeded=$((seeded+1))
done

echo
echo "Summary: $seeded posted, $skipped already existed."

if [[ ${#missing_categories[@]} -gt 0 ]]; then
  cat <<EOF

⚠️  Manual, one-time UI steps (GitHub's API cannot create categories or pin posts):

  1. Create these categories — Discussions → ⚙️ Edit categories → New category,
     format "Open-ended discussion" (answerable OFF):
$(printf '       • %s\n' "${missing_categories[@]}")
     GitHub slugs them automatically (e.g. "Show your kit" → show-your-kit) —
     those are the URLs the landing footer + docs already point at.
  2. Re-run this script to seed the newly-created categories.
EOF
fi

cat <<'EOF'

  3. Pin the Q&A intro: open "How to ask great questions (start here)" →
     ⋯ menu → Pin discussion.

Done. Community surface is live: https://github.com/rajkaria/0gkit/discussions
EOF
