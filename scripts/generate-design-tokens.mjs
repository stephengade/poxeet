import { readFile, writeFile } from "node:fs/promises";

// Reads design-tokens.json and writes app/tokens.generated.css:
// CSS custom properties for both themes, the Tailwind theme mapping, and one class per text style.
const tokens = JSON.parse(await readFile(new URL("../design-tokens.json", import.meta.url), "utf8"));

const themes = tokens.color.themes.map((theme) => theme.id);
const [firstTheme, secondTheme] = themes;

// "{brand}" aliases another color token.
const resolve = (value) => (typeof value === "string" ? value.replace(/^\{(.+)\}$/, "var(--$1)") : value);
const valueFor = (token, theme) => resolve(typeof token.value === "string" ? token.value : token.value[theme] ?? token.value[firstTheme]);
const themed = [...tokens.color.tokens, ...tokens.shadow.tokens];
const declare = (list, theme, indent) => list.map((token) => `${indent}--${token.name}: ${valueFor(token, theme)};`).join("\n");
const changedIn = (theme) => themed.filter((token) => typeof token.value !== "string" && token.value[theme] !== undefined);

const plainFamilies = ["spacing", "radius", "size", "motion", "breakpoint"];
const plain = plainFamilies.flatMap((family) => tokens[family]?.tokens ?? []);

// next/font exposes each face under a generated family name through these variables (see app/layout.tsx).
const fontVariables = { "Geist": "--font-geist-sans", "Geist Mono": "--font-geist-mono", "Instrument Serif": "--font-instrument-serif" };
const fontStack = (stack) => stack.replace(/^"([^"]+)"/, (match, family) => (fontVariables[family] ? `var(${fontVariables[family]}), ${match}` : match));

const typeClass = (style, family) => {
  const rules = [
    `font-family: var(--font-${style.family ?? family});`,
    `font-size: ${style.fontSize};`,
    `line-height: ${style.lineHeight};`,
    `font-weight: ${style.fontWeight};`,
    style.letterSpacing && `letter-spacing: ${style.letterSpacing};`,
    style.fontStyle && `font-style: ${style.fontStyle};`,
    style.name === "eyebrow" && "text-transform: uppercase;",
  ].filter(Boolean);
  return `.type-${style.name} { ${rules.join(" ")} }`;
};

const darkBlock = declare(changedIn(secondTheme), secondTheme, "    ");
const css = `/* Generated from design-tokens.json by scripts/generate-design-tokens.mjs. Do not edit; run pnpm tokens:build. */

:root {
${declare(themed, firstTheme, "  ")}
${plain.map((token) => `  --${token.name}: ${token.value};`).join("\n")}
  color-scheme: light;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="${firstTheme}"]) {
${darkBlock}
    color-scheme: dark;
  }
}

:root[data-theme="${secondTheme}"] {
${darkBlock.replace(/^ {4}/gm, "  ")}
  color-scheme: dark;
}

/* Forces the light theme on a subtree whatever the system setting (the landing and sign-in pages). */
.theme-light {
${declare(themed, firstTheme, "  ")}
  color-scheme: light;
}

@theme static {
${Object.entries(tokens.type.families).map(([key, stack]) => `  --font-${key}: ${fontStack(stack)};`).join("\n")}
}

/* Tailwind color utilities (bg-surface, text-ink-muted, border-line…) follow the theme. */
@theme inline {
${tokens.color.tokens.map((token) => `  --color-${token.name}: var(--${token.name});`).join("\n")}
}

${tokens.type.groups.flatMap((group) => group.styles.map((style) => typeClass(style, group.family))).join("\n")}
`;

await writeFile(new URL("../app/tokens.generated.css", import.meta.url), css);
console.log(`Wrote app/tokens.generated.css: ${themed.length} themed tokens, ${plain.length} scale tokens, ${tokens.type.groups.reduce((n, g) => n + g.styles.length, 0)} text styles.`);
