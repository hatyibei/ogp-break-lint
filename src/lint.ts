// 折り返しシミュレーション + BudouX 文節境界 + 禁則 の判定エンジン。
import { InputError } from "./errors.ts";
import { isLineEndProhibited, isLineStartProhibited } from "./kinsoku.ts";
import { contentWidthOf, DEFAULT_OPTIONS, type LayoutOptions, validateOptions } from "./options.ts";
import { phraseBoundaries, segment } from "./phrase.ts";
import { estimatedMeasure, type Measure } from "./width.ts";
import { type Line, toChars, wrap } from "./wrap.ts";

export type ViolationType = "mid_phrase" | "kinsoku" | "overflow";

export interface Violation {
  type: ViolationType;
  /** kinsoku のとき: line_start = 行頭禁則, line_end = 行末禁則 */
  rule?: "line_start" | "line_end";
  /** 折れ位置の文字オフセット（コードポイント単位）。この文字の前で改行される */
  offset: number;
  /** 折れ直後の行番号（1 始まり）。overflow では maxLines + 1 */
  line: number;
  /** 問題の文字（kinsoku のとき） */
  char?: string;
  /** 折れ位置の前後の抜粋 */
  excerpt: { before: string; after: string };
  message: string;
}

export interface LintResult {
  title: string;
  segments: string[];
  /** 折れてよいオフセット（昇順） */
  boundaries: number[];
  lines: Line[];
  violations: Violation[];
  layout: LayoutOptions & { contentWidth: number; textHeight: number; measure: "estimate" | "font" };
}

export interface LintOptions extends Partial<LayoutOptions> {
  /** 1 文字幅の計測関数。省略時は推定幅 */
  measure?: Measure;
  /** 抜粋の前後文字数 */
  excerptChars?: number;
}

export function lintTitle(rawTitle: string, opts: LintOptions = {}): LintResult {
  // Like Satori with white-space: normal: newlines become spaces, runs of ASCII spaces/tabs
  // collapse to one, and the ends are trimmed. The ideographic space U+3000 is kept.
  const title = rawTitle.replace(/\r?\n/g, " ").replace(/[ \t]+/g, " ").replace(/^ | $/g, "");
  if (title.trim() === "") throw new InputError("タイトルが空です");
  const { measure: customMeasure, excerptChars = 4, ...layoutPart } = opts;
  const layout = validateOptions({ ...DEFAULT_OPTIONS, ...stripUndefined(layoutPart) });
  const contentWidth = contentWidthOf(layout);
  const measure = customMeasure ?? estimatedMeasure(layout.fontSize);

  const chars = toChars(title);
  const segments = segment(title);
  const boundarySet = phraseBoundaries(title, segments);
  const lines = wrap(title, contentWidth, measure, layout.wordBreak);

  const excerpt = (offset: number) => ({
    before: chars.slice(Math.max(0, offset - excerptChars), offset).join(""),
    after: chars.slice(offset, offset + excerptChars).join(""),
  });

  const violations: Violation[] = [];
  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1]!;
    const cur = lines[i]!;
    const offset = cur.start;
    const ex = excerpt(offset);
    if (!boundarySet.has(offset)) {
      violations.push({
        type: "mid_phrase",
        offset,
        line: i + 1,
        excerpt: ex,
        message: `文節の途中で折れています: 「${ex.before}｜${ex.after}」`,
      });
    }
    const last = chars[prev.end - 1]!;
    if (isLineEndProhibited(last)) {
      violations.push({
        type: "kinsoku",
        rule: "line_end",
        offset,
        line: i + 1,
        char: last,
        excerpt: ex,
        message: `行末禁則: 「${last}」が ${i} 行目の末尾にあります`,
      });
    }
    const first = chars[cur.start]!;
    if (isLineStartProhibited(first)) {
      violations.push({
        type: "kinsoku",
        rule: "line_start",
        offset,
        line: i + 1,
        char: first,
        excerpt: ex,
        message: `行頭禁則: 「${first}」が ${i + 1} 行目の先頭にあります`,
      });
    }
  }
  if (lines.length > layout.maxLines) {
    const offset = lines[layout.maxLines]!.start;
    violations.push({
      type: "overflow",
      offset,
      line: layout.maxLines + 1,
      excerpt: excerpt(offset),
      message: `${lines.length} 行になり maxLines=${layout.maxLines} を超えています`,
    });
  }

  return {
    title,
    segments,
    boundaries: [...boundarySet].sort((a, b) => a - b),
    lines,
    violations,
    layout: {
      ...layout,
      contentWidth,
      textHeight: lines.length * layout.fontSize * layout.lineHeight,
      measure: customMeasure ? "font" : "estimate",
    },
  };
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
