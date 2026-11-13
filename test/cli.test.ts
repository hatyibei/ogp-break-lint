import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { run } from "../src/main.ts";

const cliTs = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const bin = ["--import", "tsx", cliTs];
const fx = (p: string) => fileURLToPath(new URL(`../fixtures/${p}`, import.meta.url));

async function cli(...args: string[]) {
  let out = "";
  let err = "";
  const code = await run(args, { stdout: (s) => (out += s + "\n"), stderr: (s) => (err += s + "\n") });
  return { code, out, err };
}

describe("必須 7: CLI 終了コード（実プロセス）", () => {
  it("違反なし → 0", () => {
    const r = spawnSync(process.execPath, [...bin, "lint", "--title", "開発者にも届けたい技術記事"], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /違反なし/);
  });
  it("違反あり → 1", () => {
    const r = spawnSync(process.execPath, [...bin, "lint", "--title", "開発者にも届けたい技術記事", "--width", "448", "--padding", "0"], { encoding: "utf8" });
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stdout, /mid_phrase/);
  });
  it("空タイトル → 2", () => {
    const r = spawnSync(process.execPath, [...bin, "lint", "--title", "  "], { encoding: "utf8" });
    assert.equal(r.status, 2);
  });
});

describe("CLI 終了コード・入力（関数呼び出し）", () => {
  it("引数なし・不明コマンド・不明オプション → 2", async () => {
    assert.equal((await cli()).code, 2);
    assert.equal((await cli("fix", "--title", "あ")).code, 2);
    assert.equal((await cli("lint", "--title", "あ", "--nope")).code, 2);
    assert.equal((await cli("lint", "--title", "あ", "--width", "abc")).code, 2);
  });
  it("空文字 → 2", async () => {
    assert.equal((await cli("lint", "--title", "")).code, 2);
  });
  it("--file frontmatter", async () => {
    const r = await cli("lint", "--file", fx("articles/basic.md"));
    assert.equal(r.code, 0);
    assert.match(r.out, /開発者にも届けたい技術記事/);
  });
  it("--file frontmatter の title が配列 → 2", async () => {
    assert.equal((await cli("lint", "--file", fx("articles/title-array.md"))).code, 2);
  });
  it("--file 存在しない → 2", async () => {
    assert.equal((await cli("lint", "--file", fx("nope.md"))).code, 2);
  });
  it("--list", async () => {
    assert.equal((await cli("lint", "--file", fx("titles.txt"), "--list")).code, 0);
    const r = await cli("lint", "--file", fx("titles.txt"), "--list", "--width", "320", "--padding", "0", "--json");
    assert.equal(r.code, 1);
    const j = JSON.parse(r.out);
    assert.equal(j.results.length, 3);
  });
  it("--config（CLI 引数が優先）", async () => {
    assert.equal((await cli("lint", "--title", "開発者にも届けたい技術記事", "--config", fx("narrow.yml"))).code, 1);
    assert.equal((await cli("lint", "--title", "開発者にも届けたい技術記事", "--config", fx("narrow.yml"), "--width", "1200")).code, 0);
  });
  it("--json の違反フィールド", async () => {
    const r = await cli("lint", "--title", "今日は晴れ。明日も", "--width", "320", "--padding", "0", "--word-break", "break-all", "--json");
    assert.equal(r.code, 1);
    const j = JSON.parse(r.out);
    assert.equal(j.ok, false);
    const res = j.results[0];
    assert.equal(res.title, "今日は晴れ。明日も");
    assert.deepEqual(res.lines.map((l: { text: string }) => l.text), ["今日は晴れ", "。明日も"]);
    const k = res.violations.find((v: { type: string }) => v.type === "kinsoku");
    assert.equal(k.offset, 5);
    assert.equal(k.rule, "line_start");
    assert.deepEqual(k.excerpt, { before: "日は晴れ", after: "。明日も" });
    assert.ok(res.violations.some((v: { type: string }) => v.type === "mid_phrase"));
  });
  it("overflow は終了 1", async () => {
    assert.equal((await cli("lint", "--title", "開発者にも届けたい技術記事", "--width", "200", "--padding", "0", "--max-lines", "9")).code, 1);
    const r = await cli("lint", "--title", "開発者にも届けたい技術記事", "--width", "576", "--padding", "0", "--max-lines", "1", "--json");
    assert.equal(r.code, 1);
    assert.deepEqual(JSON.parse(r.out).results[0].violations.map((v: { type: string }) => v.type), ["overflow"]);
  });
  it("--word-break の不正値は 2", async () => {
    assert.equal((await cli("lint", "--title", "あ", "--word-break", "anywhere")).code, 2);
  });
});

describe("必須 8: preview", () => {
  it("折り位置を行ごとに示す", async () => {
    const r = await cli("preview", "--title", "開発者にも届けたい技術記事", "--width", "448", "--padding", "0");
    assert.equal(r.code, 1);
    const lines = r.out.split("\n");
    const l1 = lines.findIndex((l) => l.startsWith("1| 開発者にも届け"));
    const l2 = lines.findIndex((l) => l.startsWith("2| たい技術記事"));
    assert.ok(l1 >= 0 && l2 > l1, r.out);
    assert.match(lines[l1]!, /\[0-7\)/);
    assert.match(lines[l1 + 1]!, /✗ 7文字目の後で折れ \[mid_phrase\]/);
  });
  it("きれいな折れは ✓", async () => {
    const r = await cli("preview", "--title", "開発者にも届けたい技術記事", "--width", "576", "--padding", "0");
    assert.equal(r.code, 0);
    assert.match(r.out, /1\| 開発者にも届けたい/);
    assert.match(r.out, /✓ 9文字目の後で折れ（文節境界）/);
    assert.match(r.out, /2\| 技術記事/);
  });
  it("禁則の印", async () => {
    const r = await cli("preview", "--title", "あいう「えお」", "--width", "256", "--padding", "0", "--word-break", "break-all");
    assert.match(r.out, /✗ 4文字目の後で折れ \[kinsoku:line_end\]/);
  });
});
