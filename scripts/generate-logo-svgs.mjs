import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import opentype from "opentype.js";

// Outlines the Logo component (components/brand/logo.tsx) into static SVGs for the favicon,
// social images and anywhere the web font may not load. Run: pnpm logo:build
// The letterforms are Geist Medium, fetched from Google Fonts; colors come from design-tokens.json.

const tokens = JSON.parse(await readFile(new URL("../design-tokens.json", import.meta.url), "utf8"));
const light = (name) => tokens.color.tokens.find((token) => token.name === name).value.light;
const INK = light("ink");
const ACTION = light("action");
const ON_ACTION = light("on-action");
const BRAND = light("brand");
const WHITE = "#ffffff";

// Same proportions as .pxt-logo in components/ui/styles.css.
const MARK_RADIUS = 0.3;
const MARK_TEXT = 0.48;
const MARK_TRACKING = -0.05;
const WORD_SIZE = 0.84;
const WORD_TRACKING = -0.035;
const GAP = 0.32;

async function loadFont() {
  const css = await (await fetch("https://fonts.googleapis.com/css2?family=Geist:wght@500")).text();
  const url = css.match(/url\((https:[^)]+\.ttf)\)/)?.[1];
  if (!url) throw new Error("Google Fonts did not return a TrueType URL for Geist 500.");
  const dir = join(tmpdir(), "poxeet-logo-font");
  await mkdir(dir, { recursive: true });
  const bytes = Buffer.from(await (await fetch(url)).arrayBuffer());
  await writeFile(join(dir, "Geist-Medium.ttf"), bytes);
  return opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

const font = await loadFont();

/** Lays text out on a baseline with tracking in em, returning one path. */
function textPath(text, x, baseline, size, trackingEm) {
  const path = new opentype.Path();
  const glyphs = font.stringToGlyphs(text);
  const scale = size / font.unitsPerEm;
  let cursor = x;
  glyphs.forEach((glyph, index) => {
    path.extend(glyph.getPath(cursor, baseline, size));
    const kern = index < glyphs.length - 1 ? font.getKerningValue(glyph, glyphs[index + 1]) * scale : 0;
    cursor += glyph.advanceWidth * scale + kern + trackingEm * size;
  });
  return path;
}

/** Shifts a path so its bounding box is centered on (cx, cy). */
function centered(build, cx, cy) {
  const box = build(0, 0).getBoundingBox();
  return build(cx - (box.x1 + box.x2) / 2, cy - (box.y1 + box.y2) / 2);
}

const round = (n) => Math.round(n * 100) / 100;
const svg = (width, height, body, title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round(width)} ${round(height)}" width="${round(width)}" height="${round(height)}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>\n`;

function mark(size, x, y, fill, ink) {
  const letters = centered((dx, dy) => textPath("Px", dx, dy, size * MARK_TEXT, MARK_TRACKING), x + size / 2, y + size / 2);
  return `<rect x="${round(x)}" y="${round(y)}" width="${size}" height="${size}" rx="${round(size * MARK_RADIUS)}" fill="${fill}"/><path fill="${ink}" d="${letters.toPathData(2)}"/>`;
}

// The wordmark sits with its x-height centered on the mark, as the CSS lockup does.
const xHeightRatio = (font.tables.os2.sxHeight || font.unitsPerEm * 0.5) / font.unitsPerEm;
function word(size, x, centerY, fill) {
  const fontSize = size * WORD_SIZE;
  const path = textPath("poxeet", x, centerY + (xHeightRatio * fontSize) / 2, fontSize, WORD_TRACKING);
  return { body: `<path fill="${fill}" d="${path.toPathData(2)}"/>`, box: path.getBoundingBox() };
}

const H = 100;
const out = new URL("../public/brand/", import.meta.url);
await mkdir(out, { recursive: true });
const files = {};

files["poxeet-mark.svg"] = svg(512, 512, mark(512, 0, 0, ACTION, ON_ACTION), "Poxeet");
files["poxeet-mark-brand.svg"] = svg(512, 512, mark(512, 0, 0, BRAND, WHITE), "Poxeet");

for (const [suffix, wordFill] of [["", INK], ["-white", WHITE]]) {
  const alone = word(H, 0, H / 2, wordFill);
  files[`poxeet-wordmark${suffix}.svg`] = svg(alone.box.x2 - alone.box.x1, alone.box.y2 - alone.box.y1,
    `<g transform="translate(${round(-alone.box.x1)} ${round(-alone.box.y1)})">${alone.body}</g>`, "Poxeet");

  const markFill = suffix ? WHITE : ACTION;
  const markInk = suffix ? ACTION : ON_ACTION;
  const lockupWord = word(H, H + H * GAP, H / 2, wordFill);
  const top = Math.min(0, lockupWord.box.y1);
  const bottom = Math.max(H, lockupWord.box.y2);
  files[`poxeet-lockup${suffix}.svg`] = svg(lockupWord.box.x2, bottom - top,
    `<g transform="translate(0 ${round(-top)})">${mark(H, 0, 0, markFill, markInk)}${lockupWord.body}</g>`, "Poxeet");
}

for (const [name, content] of Object.entries(files)) await writeFile(new URL(name, out), content);
// Next.js serves app/icon.svg as the favicon.
await writeFile(new URL("../app/icon.svg", import.meta.url), files["poxeet-mark.svg"]);
console.log(`Wrote ${Object.keys(files).length} files to public/brand and app/icon.svg (x-height ${xHeightRatio.toFixed(3)} em).`);
