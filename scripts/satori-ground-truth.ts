/**
 * Compare ogp-break-lint's predicted lines with what Satori actually renders.
 *
 *   npx tsx scripts/satori-ground-truth.ts --font path/to/NotoSansJP.ttf \
 *     [--titles fixtures/realistic-titles.txt] [--out fixtures/satori/<name>.json]
 *
 * Satori is NOT a runtime dependency. Install the version you use
 * (e.g. the one bundled by your @vercel/og) before running:  npm i --no-save satori@0.33.5
 *
 * Satori is rendered with embedFont: false so the SVG keeps <text> elements;
 * lines are reconstructed from their y coordinates.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { fontMeasure } from "../src/font.ts";
import { lintTitle } from "../src/lint.ts";
import type { WordBreak } from "../src/wrap.ts";

const { values } = parseArgs({
  options: {
    font: { type: "string" },
    titles: { type: "string", default: "fixtures/realistic-titles.txt" },
    out: { type: "string", default: "ground-truth/satori.json" },
  },
});
if (!values.font) {
  console.error("--font <path.ttf|otf> is required (the same font your OG template passes to Satori)");
  process.exit(2);
}

const require = createRequire(import.meta.url);
const satoriVersion: string = require("satori/package.json").version;
const { default: satori } = (await import("satori")) as { default: (el: unknown, o: unknown) => Promise<string> };

const fontData = readFileSync(values.font);
const titles = readFileSync(values.titles!, "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

const LAYOUTS = [
  { width: 1200, fontSize: 64, padding: 80 },
  { width: 1200, fontSize: 56, padding: 60 },
  { width: 1200, fontSize: 72, padding: 100 },
];
const WORD_BREAKS: WordBreak[] = ["normal", "break-all"];

async function satoriLines(title: string, width: number, fontSize: number, padding: number, wordBreak: WordBreak) {
  const svg = await satori(
    {
      type: "div",
      props: {
        style: { width, height: 630, display: "flex", padding: `0 ${padding}px`, fontSize, fontFamily: "OG", lineHeight: 1.25, wordBreak, boxSizing: "border-box" },
        children: title,
      },
    },
    { width, height: 630, fonts: [{ name: "OG", data: fontData, weight: 400, style: "normal" }], embedFont: false },
  );
  const rows = new Map<number, [number, string][]>();
  for (const m of svg.matchAll(/<text[^>]*?x="([\d.\-]+)"[^>]*?y="([\d.\-]+)"[^>]*>([^<]*)<\/text>/g)) {
    const y = Math.round(Number(m[2]));
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y)!.push([Number(m[1]), decode(m[3]!)]);
  }
  return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r.sort((a, b) => a[0] - b[0]).map((x) => x[1]).join(""));
}

function decode(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

const norm = (lines: string[]) => lines.map((l) => l.replace(/\s+/g, ""));
const same = (a: string[], b: string[]) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));

const cases = [];
const tally: Record<string, { font: number; estimate: number; total: number }> = {};
for (const wordBreak of WORD_BREAKS) {
  for (const l of LAYOUTS) {
    const measure = await fontMeasure(values.font, l.fontSize);
    for (const title of titles) {
      const satoriOut = await satoriLines(title, l.width, l.fontSize, l.padding, wordBreak);
      const withFont = lintTitle(title, { ...l, wordBreak, measure, maxLines: 99 });
      const withEstimate = lintTitle(title, { ...l, wordBreak, maxLines: 99 });
      const fontLines = withFont.lines.map((x) => x.text);
      const estLines = withEstimate.lines.map((x) => x.text);
      const t = (tally[wordBreak] ??= { font: 0, estimate: 0, total: 0 });
      t.total++;
      if (same(satoriOut, fontLines)) t.font++;
      if (same(satoriOut, estLines)) t.estimate++;
      cases.push({
        title, wordBreak, ...l,
        satori: satoriOut,
        engineFont: fontLines,
        engineEstimate: estLines,
        matchFont: same(satoriOut, fontLines),
        matchEstimate: same(satoriOut, estLines),
        violationsFont: withFont.violations.map((v) => (v.rule ? `${v.type}:${v.rule}` : v.type) + `@${v.offset}`),
      });
    }
  }
}

const report = { satoriVersion, font: values.font.split("/").pop(), node: process.version, generatedAt: new Date().toISOString(), tally, cases };
mkdirSync(dirname(values.out!), { recursive: true });
writeFileSync(values.out!, JSON.stringify(report, null, 1) + "\n");
console.log(`satori ${satoriVersion}, font ${report.font}`);
for (const [wb, t] of Object.entries(tally)) {
  console.log(`word-break ${wb}: engine+font ${t.font}/${t.total}, engine+estimate ${t.estimate}/${t.total}`);
}
