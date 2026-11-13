import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { InputError } from "../src/errors.ts";
import { isLineEndProhibited, isLineStartProhibited } from "../src/kinsoku.ts";
import { lintTitle } from "../src/lint.ts";
import { phraseBoundaries } from "../src/phrase.ts";
import { estimateCharWidth } from "../src/width.ts";
import { toChars, wrapGreedy } from "../src/wrap.ts";

interface Case {
  name: string;
  title: string;
  options: Record<string, number | string>;
  expected: {
    lines: string[];
    types: string[];
    midPhraseOffsets?: number[];
    kinsoku?: { rule: string; char: string; offset: number }[];
  };
}
const fixtures = JSON.parse(readFileSync(new URL("../fixtures/titles.json", import.meta.url), "utf8")) as { cases: Case[] };

describe("fixtures/titles.json", () => {
  for (const c of fixtures.cases) {
    it(c.name, () => {
      const r = lintTitle(c.title, c.options);
      assert.deepEqual(r.lines.map((l) => l.text), c.expected.lines);
      assert.deepEqual([...new Set(r.violations.map((v) => v.type))].sort(), [...c.expected.types].sort());
      if (c.expected.midPhraseOffsets) {
        assert.deepEqual(r.violations.filter((v) => v.type === "mid_phrase").map((v) => v.offset), c.expected.midPhraseOffsets);
      }
      for (const k of c.expected.kinsoku ?? []) {
        assert.ok(
          r.violations.some((v) => v.type === "kinsoku" && v.rule === k.rule && v.char === k.char && v.offset === k.offset),
          `kinsoku ${JSON.stringify(k)} が見つからない: ${JSON.stringify(r.violations)}`,
        );
      }
    });
  }
});

describe("必須 1: 幅が十分広い", () => {
  it("違反 0", () => {
    for (const t of ["開発者にも届けたい技術記事", "これはテストです", "今日は晴れ。明日も"]) {
      assert.equal(lintTitle(t).violations.length, 0, t);
    }
  });
});

describe("必須 2: 狭い幅で mid_phrase", () => {
  it("開発者にも届けたい技術記事", () => {
    const r = lintTitle("開発者にも届けたい技術記事", { width: 448, padding: 0, fontSize: 64 });
    const mids = r.violations.filter((v) => v.type === "mid_phrase");
    assert.ok(mids.length >= 1);
    const v = mids[0]!;
    assert.equal(v.offset, 7);
    assert.deepEqual(v.excerpt, { before: "にも届け", after: "たい技術" });
  });
  it("これはテストです", () => {
    const r = lintTitle("これはテストです", { width: 256, padding: 0 });
    assert.ok(r.violations.some((v) => v.type === "mid_phrase"));
  });
  it("「開発者に｜も」で折れても mid_phrase", () => {
    // 開発者に = 4 文字分の幅
    const r = lintTitle("開発者にも届けたい技術記事", { width: 256, padding: 0, maxLines: 10 });
    assert.equal(r.lines[0]!.text, "開発者に");
    assert.ok(r.violations.some((v) => v.type === "mid_phrase" && v.offset === 4));
  });
});

describe("必須 3/4: 禁則", () => {
  it("行頭の。は kinsoku line_start", () => {
    const r = lintTitle("今日は晴れ。明日も", { width: 320, padding: 0, wordBreak: "break-all" });
    assert.ok(r.violations.some((v) => v.type === "kinsoku" && v.rule === "line_start" && v.char === "。"));
  });
  it("行頭の、は kinsoku line_start", () => {
    const r = lintTitle("はい、そうです", { width: 128, padding: 0, maxLines: 9, wordBreak: "break-all" });
    assert.ok(r.violations.some((v) => v.type === "kinsoku" && v.rule === "line_start" && v.char === "、"));
  });
  it("行末の「は kinsoku line_end", () => {
    const r = lintTitle("あいう「えお」", { width: 256, padding: 0, wordBreak: "break-all" });
    const k = r.violations.find((v) => v.type === "kinsoku" && v.rule === "line_end");
    assert.ok(k);
    assert.equal(k.char, "「");
    assert.equal(k.line, 2);
  });
  it("文字集合", () => {
    for (const c of "、。，．・？！゛゜ヽヾゝゞ々ー）］｝〕〉》」』】)]}＞»ぁぃぅぇぉっゃゅょァィゥェォッャュョ”’") assert.ok(isLineStartProhibited(c), c);
    for (const c of "（［｛〔〈《「『【([{＜«") assert.ok(isLineEndProhibited(c), c);
    assert.ok(!isLineStartProhibited("あ"));
    assert.ok(!isLineEndProhibited("」"));
  });
});

describe("必須 5: 空文字・空白のみはエラー（InputError → 終了 2）", () => {
  for (const t of ["", "   ", "　\t"]) {
    it(JSON.stringify(t), () => assert.throws(() => lintTitle(t), InputError));
  }
});

describe("推定幅と折り返し", () => {
  it("幅の規則", () => {
    assert.equal(estimateCharWidth("あ", 64), 64);
    assert.equal(estimateCharWidth("漢", 64), 64);
    assert.equal(estimateCharWidth("。", 64), 64);
    assert.equal(estimateCharWidth("Ａ", 64), 64);
    assert.equal(estimateCharWidth("A", 64), 0.608 * 64); // Noto Sans JP の advance
    assert.equal(estimateCharWidth(" ", 64), 0.224 * 64);
    assert.equal(estimateCharWidth("…", 64), 64);
    assert.equal(estimateCharWidth("ｱ", 64), 32);
    assert.equal(estimateCharWidth("é", 64), 48);
  });
  it("1 文字が幅を超える場合はその文字だけで 1 行", () => {
    const lines = wrapGreedy(toChars("あいう"), 10, () => 64);
    assert.deepEqual(lines.map((l) => l.text), ["あ", "い", "う"]);
  });
  it("ちょうど収まる場合は折れない", () => {
    assert.equal(wrapGreedy(toChars("あいう"), 192, () => 64).length, 1);
  });
  it("サロゲートペアは 1 文字", () => {
    const r = lintTitle("𠮷野家の𠮷", { width: 1200 });
    assert.equal(r.lines[0]!.end, 5);
  });
  it("BudouX 境界には先頭と末尾を含む", () => {
    const b = phraseBoundaries("開発者にも届けたい技術記事");
    assert.ok(b.has(0) && b.has(5) && b.has(9) && b.has(13));
  });
  it("英語・数字のみでも例外にならない", () => {
    assert.doesNotThrow(() => lintTitle("TypeScript 7 release notes", { width: 300, padding: 0, maxLines: 99 }));
    assert.doesNotThrow(() => lintTitle("1234567890", { width: 100, padding: 0, maxLines: 99 }));
  });
  it("不正なレイアウトは InputError", () => {
    assert.throws(() => lintTitle("あ", { width: 100, padding: 60 }), InputError);
    assert.throws(() => lintTitle("あ", { fontSize: 0 }), InputError);
  });
});
