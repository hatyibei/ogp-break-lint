// --font <path.ttf|otf|ttc>: measure with the real font (fontkit is bundled into dist/).
// Glyph advances plus the font's "kern" feature inside each break unit, like Satori.
// Ligatures and fallback fonts are not modelled; characters without a glyph use the estimate.
import * as fontkitModule from "fontkit";
import { InputError } from "./errors.ts";
import type { Measure } from "./width.ts";
import { estimateCharWidth } from "./width.ts";

export async function fontMeasure(path: string, fontSize: number): Promise<Measure> {
  const fontkit: any = (fontkitModule as any).default ?? fontkitModule;
  let font: any;
  try {
    font = fontkit.openSync(path);
  } catch (e) {
    throw new InputError(`フォントを開けません: ${path} (${(e as Error).message})`);
  }
  if (font && Array.isArray(font.fonts)) font = font.fonts[0]; // TTC/DFont は先頭
  if (!font || typeof font.unitsPerEm !== "number") throw new InputError(`フォントを解釈できません: ${path}`);
  const scale = fontSize / font.unitsPerEm;
  const cache = new Map<string, number>();
  const measure: Measure = (ch) => {
    let w = cache.get(ch);
    if (w === undefined) {
      const cp = ch.codePointAt(0)!;
      // フォントにグリフが無い文字は推定幅にフォールバック（実描画ではフォールバックフォントが使われるため）
      w = font.hasGlyphForCodePoint(cp)
        ? font.glyphForCodePoint(cp).advanceWidth * scale
        : estimateCharWidth(ch, fontSize);
      cache.set(ch, w);
    }
    return w;
  };
  // Whole-string width with the font's kerning (Satori measures with kerning too).
  // Characters without a glyph fall back to the estimate, as above.
  measure.text = (s) => {
    let total = 0;
    let run = "";
    const flush = () => {
      if (run === "") return;
      const glyphRun = font.layout(run, ["kern"]);
      for (const p of glyphRun.positions) total += p.xAdvance * scale;
      run = "";
    };
    for (const ch of s) {
      if (font.hasGlyphForCodePoint(ch.codePointAt(0)!)) run += ch;
      else {
        flush();
        total += estimateCharWidth(ch, fontSize);
      }
    }
    flush();
    return total;
  };
  return measure;
}
