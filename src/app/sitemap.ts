import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://mainline.support";

export const dynamic = "force-static";

/** The four public pages. Everything else needs a sign-in, so it isn't listed. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/setup`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/guide`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/method`, changeFrequency: "monthly", priority: 0.7 },
  ];
}
