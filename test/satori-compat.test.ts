import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { lintTitle } from "../src/lint.ts";
import { estimateCharWidth, estimatedMeasure } from "../src/width.ts";
import { breakUnits, graphemes, type WordBreak } from "../src/wrap.ts";

const lines = (title: string, o: Record<string, unknown>) =>
  lintTitle(title, { padding: 0, maxLines: 99, ...o }).lines.map((l) => l.text);

describe("word-break: normal（Satori の既定）", () => {
  // 期待値は Satori 0.33.5 / 0.63.2 + Noto Sans JP で実際に描画した行（fixtures/satori/ 参照）
  it("UAX #14 が「。」を行頭に置かない（晴 ごと次の行へ送る）", () => {
    assert.deepEqual(lines("今日は晴れ。明日も", { width: 300 }), ["今日は晴", "れ。明日", "も"]);
  });
  it("UAX #14 が「「」を行末に置かない", () => {
    const r = lintTitle("あいう「えお」", { width: 256, padding: 0 });
    assert.deepEqual(r.lines.map((l) => l.text), ["あいう", "「えお」"]);
    assert.equal(r.violations.filter((v) => v.type === "kinsoku").length, 0);
  });
  it("空白の直後なら小書き仮名が行頭に来うる → kinsoku", () => {
    const r = lintTitle("Hello っぽい", { width: 200, padding: 0 });
    assert.deepEqual(r.lines.map((l) => l.text), ["Hello ", "っぽい"]);
    assert.ok(r.violations.some((v) => v.type === "kinsoku" && v.rule === "line_start" && v.char === "っ" && v.offset === 6));
  });
  it("英単語の途中では折らない（単語ごと次の行へ）", () => {
    assert.deepEqual(lines("TypeScript の型", { width: 400 }), ["TypeScript の", "型"]);
    assert.deepEqual(lines("TypeScript の型", { width: 300 }), ["TypeScript ", "の型"]); // 1 単語が幅を超えるときははみ出す
  });
  it("全角スペース U+3000 は詰めない・半角スペースの連続は 1 つに詰める", () => {
    assert.equal(lintTitle("その2　サーバ").title, "その2　サーバ");
    assert.equal(lintTitle("  Next.js   入門 ").title, "Next.js 入門");
  });
});

describe("word-break: break-all（文字単位・禁則を守らない）", () => {
  it("「。」が行頭に来て kinsoku", () => {
    const r = lintTitle("今日は晴れ。明日も", { width: 320, padding: 0, wordBreak: "break-all" });
    assert.deepEqual(r.lines.map((l) => l.text), ["今日は晴れ", "。明日も"]);
    assert.ok(r.violations.some((v) => v.type === "kinsoku" && v.rule === "line_start"));
  });
  it("ZWJ 絵文字・国旗は 1 書記素のまま、幅は 1em", () => {
    const fam = "👨‍👩‍👧";
    assert.deepEqual(graphemes(`あ${fam}🇯🇵い`), ["あ", fam, "🇯🇵", "い"]);
    assert.deepEqual(lines(`あい${fam}う`, { width: 192, wordBreak: "break-all" }), [`あい${fam}`, "う"]);
  });
  it("半角カナ＋濁点は 1 書記素", () => {
    assert.deepEqual(breakUnits("ｶﾞｷﾞ", "break-all"), ["ｶﾞ", "ｷﾞ"]);
  });
});

describe("推定幅（Noto Sans JP の値）", () => {
  it("全角・半角の混在", () => {
    assert.equal(estimateCharWidth("Ａ", 100), 100);
    assert.equal(estimateCharWidth("A", 100), 60.8);
    assert.equal(estimateCharWidth("ｱ", 100), 50);
    assert.equal(estimateCharWidth("─", 100), 100);
  });
  it("英字ペアのカーニングが効く", () => {
    const m = estimatedMeasure(100);
    assert.ok(m.text!("AV") < m("A") + m("V"));
    assert.equal(m.text!("あい"), 200);
  });
});

interface GroundTruth {
  satoriVersion: string;
  font: string;
  cases: { title: string; wordBreak: WordBreak; width: number; fontSize: number; padding: number; satori: string[] }[];
}

describe("Satori の実描画との一致（fixtures/satori/*.json、推定幅）", () => {
  const dir = new URL("../fixtures/satori/", import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  it("記録が 4 ファイルある", () => assert.equal(files.length, 4));
  for (const f of files) {
    const gt = JSON.parse(readFileSync(new URL(f, dir), "utf8")) as GroundTruth;
    for (const wb of ["normal", "break-all"] as const) {
      it(`${f} (${wb}): 120 件中 117 件以上が Satori と同じ行分け`, () => {
        const cases = gt.cases.filter((c) => c.wordBreak === wb);
        const norm = (a: string[]) => a.map((s) => s.replace(/\s+/g, "")).join("\n");
        const misses = cases.filter(
          (c) => norm(lines(c.title, { width: c.width, fontSize: c.fontSize, padding: c.padding, wordBreak: wb })) !== norm(c.satori),
        );
        assert.equal(cases.length, 120);
        assert.ok(misses.length <= 3, misses.map((m) => `${m.title}: ${m.satori.join("⏎")}`).join("\n"));
      });
    }
  }
});
