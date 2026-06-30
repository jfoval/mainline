/**
 * Generate app icons from the Mainline brand mark.
 *
 * The source brand SVGs (public/brand/*.svg) are raster-in-SVG exports (~600KB each), so we
 * rasterize the mark to clean, right-sized PNGs once here rather than shipping the heavy SVG
 * to every page. Re-run after a brand change:  node scripts/gen-icons.mjs
 */
import sharp from "sharp";
import { readFile } from "node:fs/promises";

const MARK = "brand/mainline-mark.svg";
const BG = "#0b0b0c"; // brand dark background (matches theme_color)

// Render the (trimmed) mark ONCE to a high-res transparent master, then derive every size from
// it — rasterizing the heavy source SVG repeatedly is slow.
const svg = await readFile(MARK);
const master = await sharp(svg)
  .trim() // crop surrounding whitespace so the mark fills the icon
  .resize(1024, 1024, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();

async function transparent(size, out) {
  await sharp(master)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(out);
  console.log("wrote", out, `(${size}px, transparent)`);
}

async function onBackground(size, padRatio, out) {
  const inner = Math.round(size * (1 - 2 * padRatio));
  const mark = await sharp(master)
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: mark, gravity: "center" }])
    .png()
    .toFile(out);
  console.log("wrote", out, `(${size}px, on ${BG})`);
}

await transparent(192, "public/icon-192.png");
await transparent(512, "public/icon-512.png");
await onBackground(512, 0.16, "public/maskable-512.png");
await onBackground(180, 0.12, "public/apple-touch-icon.png");
await transparent(48, "public/favicon-48.png");
await transparent(128, "public/logo-mark.png");

console.log("done");
