// 文字幅の推定。実フォント・Satori の描画とは差が出る（README 参照）。
//
// 規則（固定。テストはこの規則に依存する）:
//   1. East Asian Width が Wide / Fullwidth の文字、および典型的な CJK
//      （ひらがな・カタカナ・漢字・全角記号・CJK 記号・ハングル・絵文字の主要ブロック）
//      → fontSize * 1.0
//   2. ASCII 印字可能文字（U+0020–U+007E）→ ASCII_EM の値（Noto Sans JP / Noto Sans CJK JP
//      Regular の advance 幅 ÷ unitsPerEm。両フォントで同じ値）。英数字はプロポーショナルなので
//      一律 0.5em より実描画に近い。別フォントなら --font を使うこと。
//      Halfwidth（半角カナ等）→ fontSize * 0.5
//   2b. EXTRA_EM に列挙した記号（… ― → ※ “ ” など）→ Noto Sans JP の幅
//   3. 結合文字・異体字セレクタ・ゼロ幅文字 → 0
//   4. それ以外（Neutral / Ambiguous の非 ASCII: ラテン拡張・ギリシャ・キリル・
//      一般句読点の “ ” ‘ ’ – — … 等）→ fontSize * 0.75
//
// 範囲表は Unicode EastAsianWidth.txt の W/F を主要ブロック単位で近似したもの。

import { KERN_PAIRS } from "./kern-table.ts";

type Range = readonly [number, number];

const WIDE_RANGES: readonly Range[] = [
  [0x1100, 0x115f], // Hangul Jamo (leading)
  [0x2e80, 0x303e], // CJK 部首補助・康熙部首・CJK 記号と句読点（、。「」等）
  [0x3041, 0x33ff], // ひらがな・カタカナ・注音・ハングル互換・CJK 互換
  [0x3400, 0x4dbf], // CJK 統合漢字拡張 A
  [0x4e00, 0x9fff], // CJK 統合漢字
  [0xa000, 0xa4cf], // イ文字
  [0xa960, 0xa97f], // Hangul Jamo Extended-A
  [0xac00, 0xd7a3], // ハングル音節
  [0xf900, 0xfaff], // CJK 互換漢字
  [0xfe10, 0xfe19], // 縦書き形
  [0xfe30, 0xfe6f], // CJK 互換形・小字形
  [0xff00, 0xff60], // 全角 ASCII・全角括弧（Fullwidth）
  [0xffe0, 0xffe6], // 全角記号（Fullwidth）
  [0x1b000, 0x1b16f], // 仮名補助・小書き仮名拡張
  [0x1f1e6, 0x1f1ff], // 地域指示記号（国旗の絵文字）
  [0x1f300, 0x1f64f], // 絵文字（その他の記号と絵文字・顔文字）
  [0x1f680, 0x1f6ff], // 交通と地図の記号
  [0x1fa70, 0x1faff], // 記号と絵文字拡張 A
  [0x1f900, 0x1f9ff], // 補助絵文字
  [0x20000, 0x3fffd], // CJK 統合漢字拡張 B 以降
];

const HALF_RANGES: readonly Range[] = [
  [0x0020, 0x007e], // ASCII
  [0xff61, 0xffdc], // 半角カナ・半角ハングル（Halfwidth）
  [0xffe8, 0xffee], // 半角記号（Halfwidth）
];

const ZERO_RANGES: readonly Range[] = [
  [0x0300, 0x036f], // 結合ダイアクリティカルマーク
  [0x200b, 0x200f], // ゼロ幅スペース・ZWJ 等
  [0x3099, 0x309a], // 結合濁点・半濁点
  [0xfe00, 0xfe0f], // 異体字セレクタ
  [0xe0100, 0xe01ef], // 異体字セレクタ補助
];

function inRanges(cp: number, ranges: readonly Range[]): boolean {
  for (const [lo, hi] of ranges) if (cp >= lo && cp <= hi) return true;
  return false;
}

export type WidthClass = "wide" | "half" | "zero" | "other";

export function widthClass(ch: string): WidthClass {
  const cp = ch.codePointAt(0)!;
  if (inRanges(cp, ZERO_RANGES)) return "zero";
  if (inRanges(cp, WIDE_RANGES)) return "wide";
  if (inRanges(cp, HALF_RANGES)) return "half";
  return "other";
}

const FACTOR: Record<WidthClass, number> = { wide: 1, half: 0.5, zero: 0, other: 0.75 };

/** ASCII U+0020–U+007E の advance 幅（em）。Noto Sans JP Regular から抽出。 */
export const ASCII_EM: readonly number[] = [0.224, 0.323, 0.474, 0.555, 0.555, 0.921, 0.68, 0.278, 0.338, 0.338, 0.467, 0.555, 0.278, 0.347, 0.278, 0.392, 0.555, 0.555, 0.555, 0.555, 0.555, 0.555, 0.555, 0.555, 0.555, 0.555, 0.278, 0.278, 0.555, 0.555, 0.555, 0.474, 0.946, 0.608, 0.657, 0.638, 0.688, 0.589, 0.552, 0.689, 0.728, 0.293, 0.535, 0.646, 0.543, 0.812, 0.723, 0.742, 0.633, 0.742, 0.635, 0.596, 0.599, 0.721, 0.575, 0.878, 0.573, 0.531, 0.603, 0.338, 0.392, 0.338, 0.555, 0.559, 0.606, 0.563, 0.618, 0.51, 0.62, 0.554, 0.325, 0.564, 0.607, 0.275, 0.275, 0.552, 0.284, 0.926, 0.61, 0.606, 0.62, 0.62, 0.388, 0.468, 0.377, 0.607, 0.521, 0.802, 0.498, 0.521, 0.475, 0.338, 0.27, 0.338, 0.555];

/**
 * East Asian Width が Ambiguous / Neutral でも和文フォントでは決まった幅になる記号（em）。
 * 値は Noto Sans JP Regular の advance 幅。
 */
export const EXTRA_EM: ReadonlyMap<string, number> = new Map([
  ["…", 1], ["‥", 1], ["―", 1], ["→", 1], ["←", 1], ["×", 1], ["♪", 1], ["★", 1], ["☆", 1],
  ["○", 1], ["●", 1], ["◯", 1], ["※", 1], ["—", 0.894], ["–", 0.536],
  ["“", 0.474], ["”", 0.474], ["‘", 0.278], ["’", 0.278],
  ["±", 1], ["÷", 1], ["∞", 1], ["²", 0.411], ["³", 0.411], ["°", 0.37],
]);

/** 1 文字（コードポイント）の推定幅 */
export function estimateCharWidth(ch: string, fontSize: number): number {
  const cp = ch.codePointAt(0)!;
  if (cp >= 0x20 && cp <= 0x7e) return ASCII_EM[cp - 0x20]! * fontSize;
  const extra = EXTRA_EM.get(ch);
  if (extra !== undefined) return extra * fontSize;
  if (cp >= 0x2500 && cp <= 0x257f) return fontSize; // 罫線（── をダッシュ代わりに使うタイトルが多い）。和文フォントでは全角
  return FACTOR[widthClass(ch)] * fontSize;
}

/** Width of one code point. May carry `text` to measure a whole string (e.g. with kerning). */
export type Measure = ((ch: string) => number) & { text?: (s: string) => number };

let kern: Map<string, number> | undefined;
function kernPairs(): Map<string, number> {
  if (!kern) {
    kern = new Map();
    for (const item of KERN_PAIRS.split(" ")) kern.set(item.slice(0, 2), Number(item.slice(2)) / 1000);
  }
  return kern;
}

/**
 * Estimated measure. Strings are measured as the sum of estimateCharWidth plus the
 * Noto Sans JP kerning of adjacent ASCII pairs (Satori applies the font's kerning inside a word).
 */
export function estimatedMeasure(fontSize: number): Measure {
  const measure: Measure = (ch) => estimateCharWidth(ch, fontSize);
  measure.text = (s) => {
    const pairs = kernPairs();
    let w = 0;
    let prev = "";
    for (const g of new Intl.Segmenter("ja", { granularity: "grapheme" }).segment(s)) {
      const ch = String.fromCodePoint(g.segment.codePointAt(0)!);
      w += estimateCharWidth(ch, fontSize);
      if (prev) w += (pairs.get(prev + ch) ?? 0) * fontSize;
      prev = g.segment.length === 1 && ch >= "!" && ch <= "~" ? ch : "";
    }
    return w;
  };
  return measure;
}
