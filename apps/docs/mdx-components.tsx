import type { MDXComponents } from "mdx/types";

// Plain pass-through; styling is handled by global CSS scoped to .prose.
// Frontmatter is stripped by remark-mdx-frontmatter, so the page title is
// rendered from the first `# ` heading in each document.
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return { ...components };
}
