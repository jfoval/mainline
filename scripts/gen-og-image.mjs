/**
 * Generate the social preview card (public/og.png, 1200×630) — what Google, iMessage, Slack and
 * every other unfurler shows when someone shares mainline.support.
 *
 * Built here rather than at request time because the site is a static export: no server exists
 * to render one on the fly. Re-run after a brand or headline change:  node scripts/gen-og-image.mjs
 */
import sharp from "sharp";
import { readFile } from "node:fs/promises";

const W = 1200;
const H = 630;
const BG = "#000000";

const mark = await sharp(await readFile("brand/mainline-mark.svg"))
  .trim()
  .resize(96, 96, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();

// Text is drawn as SVG so it rasterizes with the system sans — no font file to ship.
const text = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <style>
    .brand { font: 600 34px -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif; fill: #ffffff; }
    .head  { font: 600 76px -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif; fill: #ffffff; }
    .sub   { font: 400 32px -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif; fill: #8a8a8e; }
    .url   { font: 500 26px -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif; fill: #3b9cff; }
  </style>
  <text x="196" y="122" class="brand">Mainline</text>
  <text x="96" y="300" class="head">Get everything out</text>
  <text x="96" y="386" class="head">of your head.</text>
  <text x="96" y="460" class="sub">Capture in a tap. Decide once. Do what's in front of you.</text>
  <text x="96" y="546" class="url">mainline.support</text>
</svg>`);

await sharp({ create: { width: W, height: H, channels: 4, background: BG } })
  .composite([
    { input: mark, top: 60, left: 88 },
    { input: text, top: 0, left: 0 },
  ])
  .png()
  .toFile("public/og.png");

console.log("wrote public/og.png (1200x630)");
