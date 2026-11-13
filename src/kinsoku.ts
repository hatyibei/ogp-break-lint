// 禁則文字集合（JIS X 4051 の実用サブセット）。
// ogflow の「28種」の再現ではない。ここに列挙した文字だけを判定に使う。

/** 行頭禁則: 行の先頭に来てはいけない文字 */
export const LINE_START_PROHIBITED: ReadonlySet<string> = new Set([
  // 句読点・中点・疑問符・感嘆符（全角）
  "、", "。", "，", "．", "・", "？", "！", "：", "；",
  // 句読点等（半角）
  ",", ".", "?", "!", ":", ";", "､", "｡",
  // 濁点・半濁点・繰り返し記号・長音
  "゛", "゜", "ヽ", "ヾ", "ゝ", "ゞ", "々", "ー", "〻",
  // 閉じ括弧類（全角）
  "）", "］", "｝", "〕", "〉", "》", "」", "』", "】", "〙", "〗", "＞", "»",
  // 閉じ括弧類（半角）
  ")", "]", "}", "｣",
  // 閉じ引用符（wr-type closing quotes）
  "”", "’", "〟",
  // 小書きひらがな
  "ぁ", "ぃ", "ぅ", "ぇ", "ぉ", "っ", "ゃ", "ゅ", "ょ", "ゎ", "ゕ", "ゖ",
  // 小書きカタカナ
  "ァ", "ィ", "ゥ", "ェ", "ォ", "ッ", "ャ", "ュ", "ョ", "ヮ", "ヵ", "ヶ",
]);

/** 行末禁則: 行の末尾に来てはいけない文字 */
export const LINE_END_PROHIBITED: ReadonlySet<string> = new Set([
  // 開き括弧類（全角）
  "（", "［", "｛", "〔", "〈", "《", "「", "『", "【", "〘", "〖", "＜", "«",
  // 開き括弧類（半角）
  "(", "[", "{", "｢",
  // 開き引用符
  "“", "‘", "〝",
]);

export function isLineStartProhibited(ch: string): boolean {
  return LINE_START_PROHIBITED.has(ch);
}

export function isLineEndProhibited(ch: string): boolean {
  return LINE_END_PROHIBITED.has(ch);
}
