import type { MetadataRoute } from "next";

// Generated at build time (static export). basePath-aware so install works at "/" locally and
// under "/mainline/" on GitHub Pages without hardcoding the subpath.
const bp = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mainline",
    short_name: "Mainline",
    description:
      "Mainline — insanely easy capture for getting things done. Idea to captured in under two seconds, even offline.",
    id: `${bp}/`,
    start_url: `${bp}/`,
    scope: `${bp}/`,
    display: "standalone",
    background_color: "#0b0b0c",
    theme_color: "#0b0b0c",
    orientation: "portrait",
    categories: ["productivity"],
    icons: [
      { src: `${bp}/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${bp}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${bp}/maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
