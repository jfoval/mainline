import type { NextConfig } from "next";

// basePath is empty locally (app served at /) and "/mainline" in the GitHub Pages build
// (set via NEXT_PUBLIC_BASE_PATH in the deploy workflow), since project Pages live at /<repo>/.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  // Static HTML export — GitHub Pages serves files only (no Node server). Our app is fully
  // client-side (IndexedDB capture spine), so it exports cleanly. When the backend/AI lands
  // (needs server functions) we'll move to a host that runs Next server code (e.g. Vercel).
  output: "export",
  basePath: basePath || undefined,
  // Emit /inbox/ as inbox/index.html so static hosting resolves routes without rewrites.
  trailingSlash: true,
  // No image-optimization server in a static export.
  images: { unoptimized: true },
};

export default nextConfig;
