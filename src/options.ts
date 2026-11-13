import { InputError } from "./errors.ts";
import { WORD_BREAKS, type WordBreak } from "./wrap.ts";

export interface LayoutOptions {
  width: number;
  fontSize: number;
  /** 左右同じ。contentWidth = width - padding * 2 */
  padding: number;
  lineHeight: number;
  maxLines: number;
  locale: "ja";
  /** Same meaning as CSS / Satori `word-break`. Default "normal" (Satori default). */
  wordBreak: WordBreak;
}

export const DEFAULT_OPTIONS: LayoutOptions = {
  width: 1200,
  fontSize: 64,
  padding: 80,
  lineHeight: 1.25,
  maxLines: 3,
  locale: "ja",
  wordBreak: "normal",
};

export function contentWidthOf(o: LayoutOptions): number {
  return o.width - o.padding * 2;
}

/** 数値と整合性を検査する。問題があれば InputError */
export function validateOptions(o: LayoutOptions): LayoutOptions {
  const pos = (k: keyof LayoutOptions) => {
    const v = o[k];
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
      throw new InputError(`${k} は正の数で指定してください（現在: ${String(v)}）`);
    }
  };
  pos("width");
  pos("fontSize");
  pos("lineHeight");
  pos("maxLines");
  if (typeof o.padding !== "number" || !Number.isFinite(o.padding) || o.padding < 0) {
    throw new InputError(`padding は 0 以上の数で指定してください（現在: ${String(o.padding)}）`);
  }
  if (!Number.isInteger(o.maxLines)) throw new InputError(`maxLines は整数で指定してください`);
  if (contentWidthOf(o) <= 0) {
    throw new InputError(`width - padding * 2 が 0 以下です（width=${o.width}, padding=${o.padding}）`);
  }
  if (o.locale !== "ja") throw new InputError(`locale は ja のみ対応しています（現在: ${String(o.locale)}）`);
  if (!WORD_BREAKS.includes(o.wordBreak)) {
    throw new InputError(`wordBreak は ${WORD_BREAKS.join(" / ")} のいずれかです（現在: ${String(o.wordBreak)}）`);
  }
  return o;
}
