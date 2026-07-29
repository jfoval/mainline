import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://mainline.support";

export const dynamic = "force-static";

/**
 * The app's own screens are behind a sign-in and hold nothing but the visitor's private lists —
 * there's nothing for a crawler there, and no reason to invite one. Only the public face (the
 * landing page and the three guides) is worth indexing.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/setup", "/guide", "/method"],
        disallow: [
          "/inbox",
          "/next",
          "/projects",
          "/waiting",
          "/someday",
          "/review",
          "/reference",
          "/horizons",
          "/contexts",
          "/more",
          "/help",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
