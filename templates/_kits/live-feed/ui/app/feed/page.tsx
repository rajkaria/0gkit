/**
 * live-feed — /feed page
 *
 * Next.js App Router page that renders the FeedStream component.
 *
 * The FeedStream component:
 *   - connects to /api/feed via SSE for real-time post delivery
 *   - drops orphaned posts on a chain reorg (when the Indexer is active)
 *   - shows a reorg-safety status badge (Indexer wired vs. storage-only mode)
 *
 * Add this page to your app's navigation to expose the live feed.
 */

import { FeedStream } from "../../components/FeedStream.js";

export default function FeedPage() {
  return <FeedStream title="Live Feed" apiPath="/api/feed" />;
}

export const metadata = {
  title: "Live Feed",
  description: "Real-time, reorg-safe social feed on 0G Storage + 0gkit-indexer",
};
