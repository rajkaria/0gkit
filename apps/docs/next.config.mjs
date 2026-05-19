import { fileURLToPath } from "node:url";
import createMDX from "@next/mdx";
import remarkFrontmatter from "remark-frontmatter";
import remarkMdxFrontmatter from "remark-mdx-frontmatter";
import remarkGfm from "remark-gfm";

// Pin the workspace root: the repo can be checked out alongside git
// worktrees that each carry a lockfile, which otherwise makes Next's
// root inference ambiguous (warns on every build). Mirrors apps/playground.
const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));

const withMDX = createMDX({
  extension: /\.mdx?$/,
  options: {
    remarkPlugins: [
      remarkFrontmatter,
      [remarkMdxFrontmatter, { name: "frontmatter" }],
      remarkGfm,
    ],
  },
});

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  pageExtensions: ["ts", "tsx", "md", "mdx"],
  outputFileTracingRoot: workspaceRoot,
};

export default withMDX(config);
