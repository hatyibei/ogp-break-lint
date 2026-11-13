import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InputError } from "../src/errors.ts";
import { loadConfig, readText, titleFromFrontmatter, titlesFromList } from "../src/input.ts";

const f = (p: string) => new URL(`../fixtures/${p}`, import.meta.url).pathname;

describe("必須 6: frontmatter", () => {
  it("title を読む", () => {
    assert.equal(titleFromFrontmatter(readText(f("articles/basic.md"))), "開発者にも届けたい技術記事");
  });
  it("ogImage.title > og.title > title", () => {
    assert.equal(titleFromFrontmatter(readText(f("articles/og-priority.md"))), "OGP画像用タイトル");
    assert.equal(titleFromFrontmatter(readText(f("articles/og-only.md"))), "これはテストです");
  });
  it("配列・オブジェクトはエラー", () => {
    assert.throws(() => titleFromFrontmatter(readText(f("articles/title-array.md"))), InputError);
    assert.throws(() => titleFromFrontmatter(readText(f("articles/title-object.md"))), InputError);
  });
  it("frontmatter なし・title なしはエラー", () => {
    assert.throws(() => titleFromFrontmatter(readText(f("articles/no-frontmatter.md"))), InputError);
    assert.throws(() => titleFromFrontmatter("---\ndate: 2026-01-01\n---\n"), InputError);
  });
  it("CRLF でも読める", () => {
    assert.equal(titleFromFrontmatter("---\r\ntitle: 改行\r\n---\r\n本文"), "改行");
  });
});

describe("リスト・設定", () => {
  it("1 行 1 タイトル（空行は無視）", () => {
    assert.deepEqual(titlesFromList(readText(f("titles.txt"))), ["開発者にも届けたい技術記事", "これはテストです", "今日は晴れ。明日も"]);
  });
  it("設定ファイル", () => {
    assert.deepEqual(loadConfig(f("narrow.yml")), { width: 448, fontSize: 64, padding: 0, lineHeight: 1.25, maxLines: 3, locale: "ja" });
  });
});
