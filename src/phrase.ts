// BudouX による文節境界。
import { loadDefaultJapaneseParser } from "budoux";
import { toChars } from "./wrap.ts";

let parser: ReturnType<typeof loadDefaultJapaneseParser> | undefined;

export function segment(title: string): string[] {
  parser ??= loadDefaultJapaneseParser();
  return parser.parse(title);
}

/**
 * 「きれいな折れ」とみなす文字オフセット（コードポイント単位）の集合。
 * - BudouX の各セグメント境界（先頭 0 と末尾 length を含む）
 * - 追加規則: 空白文字の直前・直後も境界とする。BudouX は英語を
 *   「Hello world」のように 1 セグメントで返すことがあるため、
 *   英単語の間での折れを mid_phrase にしないための緩和。
 */
export function phraseBoundaries(title: string, segments = segment(title)): Set<number> {
  const set = new Set<number>([0]);
  let pos = 0;
  for (const seg of segments) {
    pos += toChars(seg).length;
    set.add(pos);
  }
  const chars = toChars(title);
  set.add(chars.length);
  chars.forEach((ch, i) => {
    if (/\s/u.test(ch)) {
      set.add(i);
      set.add(i + 1);
    }
  });
  return set;
}
