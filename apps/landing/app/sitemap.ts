import type { MetadataRoute } from "next";

const SITE_URL = "https://0gkit.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: "https://docs.0gkit.com",
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: "https://docs.0gkit.com/getting-started",
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: "https://docs.0gkit.com/packages",
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: "https://docs.0gkit.com/cli",
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: "https://docs.0gkit.com/concepts",
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: "https://docs.0gkit.com/errors",
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];
}
