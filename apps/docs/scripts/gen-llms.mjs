// Generate LLM-friendly documentation artifacts from the MDX source:
//
//   public/llms.txt        — spec index (https://llmstxt.org): grouped links
//                            to every docs page, with one-line descriptions.
//   public/llms-full.txt   — every page's Markdown concatenated into one file.
//   public/llms/<slug>.md  — a clean Markdown "twin" of each page, fetched by
//                            the "Copy for LLM" button in the docs UI.
//
// The docs pages are plain GitHub-flavoured Markdown wrapped in MDX (the only
// non-Markdown lines are inside code fences), so the transform is just: strip
// the YAML frontmatter block, keep the body verbatim. Runs in `build` (and
// `predev`) before Next collects the `public/` directory.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const DOCS_ROOT = fileURLToPath(new URL("..", import.meta.url));
const APP_DIR = join(DOCS_ROOT, "app");
const PUBLIC_DIR = join(DOCS_ROOT, "public");
const PER_PAGE_DIR = join(PUBLIC_DIR, "llms");
const SITE = "https://docs.0gkit.com";

const SUMMARY =
  "The neutral, MIT-licensed TypeScript toolkit for the 0G network — Storage, " +
  "Compute, DA, Attestation, Chain, a `0g` CLI, an MCP server, React hooks, and " +
  "drop-in feature Kits. Every package is versioned independently on npm under " +
  "the `@foundryprotocol/0gkit-*` scope, and every write returns a uniform " +
  "`Receipt`; every failure is a typed `ZeroGError`.";

// ── collect page files ────────────────────────────────────────────────────
function walk(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(full));
    else if (entry.name === "page.mdx" || entry.name === "page.md") found.push(full);
  }
  return found;
}

function routeFor(file) {
  const rel = relative(APP_DIR, dirname(file)).split(/[\\/]/).join("/");
  return rel === "" ? "/" : `/${rel}`;
}

function urlFor(route) {
  return route === "/" ? `${SITE}/` : `${SITE}${route}`;
}

function slugFor(route) {
  return route === "/" ? "index" : route.replace(/^\//, "");
}

// ── parse one page ─────────────────────────────────────────────────────────
function stripFrontmatter(src) {
  if (!src.startsWith("---")) return { fm: "", body: src };
  const close = src.indexOf("\n---", 3);
  if (close === -1) return { fm: "", body: src };
  const bodyStart = src.indexOf("\n", close + 1);
  return {
    fm: src.slice(3, close),
    body: bodyStart === -1 ? "" : src.slice(bodyStart + 1).replace(/^\s+/, ""),
  };
}

function fmField(fm, key) {
  const m = fm.match(new RegExp(`^\\s*${key}:\\s*(.+)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
}

function firstHeading(body) {
  const m = body.match(/^#\s+(.+?)\s*$/m);
  return m ? m[1].trim() : "";
}

function firstDescription(body) {
  const lines = body.split("\n");
  // Prefer the lead blockquote (most package pages open with one).
  for (const raw of lines) {
    const l = raw.trim();
    if (l.startsWith(">")) return l.replace(/^>\s?/, "").trim();
    if (l && !l.startsWith("#")) break;
  }
  // Otherwise the first prose paragraph after the H1.
  let seenH1 = false;
  const buf = [];
  for (const raw of lines) {
    const l = raw.trim();
    if (!seenH1) {
      if (l.startsWith("# ")) seenH1 = true;
      continue;
    }
    if (l === "") {
      if (buf.length) break;
      continue;
    }
    if (
      l.startsWith("#") ||
      l.startsWith("```") ||
      l.startsWith("|") ||
      l.startsWith(">")
    ) {
      if (buf.length) break;
      continue;
    }
    buf.push(l);
  }
  return buf.join(" ");
}

function clip(text, max = 180) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

const pages = walk(APP_DIR)
  .map((file) => {
    const { fm, body } = stripFrontmatter(readFileSync(file, "utf8"));
    const route = routeFor(file);
    return {
      route,
      url: urlFor(route),
      slug: slugFor(route),
      title: fmField(fm, "title") || firstHeading(body) || route,
      description: clip(fmField(fm, "description") || firstDescription(body)),
      body: body.trimEnd(),
    };
  })
  .sort((a, b) => a.route.localeCompare(b.route));

// ── per-page Markdown twins ────────────────────────────────────────────────
rmSync(PER_PAGE_DIR, { recursive: true, force: true });
mkdirSync(PER_PAGE_DIR, { recursive: true });

for (const p of pages) {
  const header =
    `<!-- 0Gkit docs — ${p.title}\n` +
    `     Source: ${p.url}\n` +
    `     LLM-friendly Markdown twin of the page. -->\n\n`;
  const outFile = join(PER_PAGE_DIR, `${p.slug}.md`);
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, `${header}${p.body}\n`, "utf8");
}

// ── llms-full.txt ──────────────────────────────────────────────────────────
const RULE = "=".repeat(76);
const fullBody = pages
  .map(
    (p) =>
      `${RULE}\n# ${p.title}\nRoute: ${p.route}\nURL: ${p.url}\n${RULE}\n\n${p.body}\n`
  )
  .join("\n");
writeFileSync(
  join(PUBLIC_DIR, "llms-full.txt"),
  `# 0Gkit — full documentation (LLM text dump)\n\n> ${SUMMARY}\n\n` +
    `Auto-generated from ${SITE}. ${pages.length} pages. Index: ${SITE}/llms.txt\n\n` +
    `${fullBody}`,
  "utf8"
);

// ── llms.txt index ─────────────────────────────────────────────────────────
const SECTIONS = [
  {
    title: "Overview",
    match: (r) => r === "/" || r.startsWith("/getting-started"),
  },
  { title: "Concepts", match: (r) => r === "/concepts" || r.startsWith("/concepts/") },
  { title: "Packages", match: (r) => r === "/packages" || r.startsWith("/packages/") },
  { title: "Kits", match: (r) => r === "/kits" || r.startsWith("/kits/") },
  { title: "Cookbook", match: (r) => r === "/cookbook" || r.startsWith("/cookbook/") },
  {
    title: "Guides",
    match: (r) =>
      [
        "/cli",
        "/mcp",
        "/react",
        "/templates",
        "/troubleshooting",
        "/migrate-from-official-sdks",
        "/contributing",
      ].includes(r),
  },
  {
    title: "Error reference",
    match: (r) => r === "/errors" || r.startsWith("/errors/"),
  },
];

const assigned = new Set();
const blocks = [];
for (const section of SECTIONS) {
  const items = pages.filter((p) => !assigned.has(p.route) && section.match(p.route));
  if (!items.length) continue;
  items.forEach((p) => assigned.add(p.route));
  const lines = items.map((p) =>
    p.description
      ? `- [${p.title}](${p.url}): ${p.description}`
      : `- [${p.title}](${p.url})`
  );
  blocks.push(`## ${section.title}\n\n${lines.join("\n")}`);
}
// Any page that matched no section (defensive) lands under "More".
const leftover = pages.filter((p) => !assigned.has(p.route));
if (leftover.length) {
  blocks.push(
    `## More\n\n${leftover
      .map(
        (p) => `- [${p.title}](${p.url})${p.description ? `: ${p.description}` : ""}`
      )
      .join("\n")}`
  );
}

const index =
  `# 0Gkit\n\n> ${SUMMARY}\n\n` +
  `This file follows the [llms.txt](https://llmstxt.org) convention so AI agents can ` +
  `discover and read the docs. Every page below is also available as clean Markdown by ` +
  `visiting \`${SITE}/llms/<path>.md\`. A single concatenated dump of all pages lives at ` +
  `[${SITE}/llms-full.txt](${SITE}/llms-full.txt).\n\n` +
  `${blocks.join("\n\n")}\n`;
writeFileSync(join(PUBLIC_DIR, "llms.txt"), index, "utf8");

console.log(
  `gen-llms: wrote llms.txt, llms-full.txt, and ${pages.length} per-page Markdown twins to public/llms/`
);
