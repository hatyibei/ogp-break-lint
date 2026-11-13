// 入力の読み込み: frontmatter / 1 行 1 タイトル / 設定ファイル
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { InputError } from "./errors.ts";
import type { LayoutOptions } from "./options.ts";

export function readText(path: string): string {
  try {
    return readFileSync(path, "utf8").replace(/^﻿/, "");
  } catch (e) {
    throw new InputError(`ファイルを読めません: ${path} (${(e as Error).message})`);
  }
}

/**
 * `---` で始まる Markdown の YAML frontmatter からタイトルを取り出す。
 * 優先順位: ogImage.title > og.title > title
 * 選ばれた値が配列・オブジェクトなら InputError。数値・真偽値は文字列化する。
 */
export function titleFromFrontmatter(source: string, name = "入力"): string {
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(source);
  if (!m) throw new InputError(`${name}: YAML frontmatter（先頭の --- ブロック）が見つかりません`);
  let data: unknown;
  try {
    data = parseYaml(m[1]!);
  } catch (e) {
    throw new InputError(`${name}: frontmatter の YAML を解析できません (${(e as Error).message})`);
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new InputError(`${name}: frontmatter がマッピングではありません`);
  }
  const d = data as Record<string, unknown>;
  const candidates: [string, unknown][] = [
    ["ogImage.title", pick(d.ogImage, "title")],
    ["og.title", pick(d.og, "title")],
    ["title", d.title],
  ];
  for (const [key, v] of candidates) {
    if (v === undefined || v === null) continue;
    if (typeof v === "object") {
      throw new InputError(`${name}: ${key} が${Array.isArray(v) ? "配列" : "オブジェクト"}です。文字列にしてください`);
    }
    return String(v);
  }
  throw new InputError(`${name}: frontmatter に title / ogImage.title / og.title がありません`);
}

function pick(o: unknown, key: string): unknown {
  if (o && typeof o === "object" && !Array.isArray(o)) return (o as Record<string, unknown>)[key];
  return undefined;
}

/** 1 行 1 タイトル。空行は無視する */
export function titlesFromList(source: string): string[] {
  return source
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

const CONFIG_KEYS = ["width", "fontSize", "padding", "lineHeight", "maxLines", "locale", "wordBreak"] as const;

/** 設定ファイル（YAML）を読む。未知のキーはエラーにする */
export function loadConfig(path: string): Partial<LayoutOptions> {
  const text = readText(path);
  let data: unknown;
  try {
    data = parseYaml(text);
  } catch (e) {
    throw new InputError(`設定ファイルを解析できません: ${path} (${(e as Error).message})`);
  }
  if (data === null || data === undefined) return {};
  if (typeof data !== "object" || Array.isArray(data)) throw new InputError(`設定ファイルがマッピングではありません: ${path}`);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (!(CONFIG_KEYS as readonly string[]).includes(k)) {
      throw new InputError(`設定ファイルの未知のキー: ${k}（使えるキー: ${CONFIG_KEYS.join(", ")}）`);
    }
    if (k === "locale" || k === "wordBreak") {
      out[k] = v;
    } else {
      if (typeof v !== "number") throw new InputError(`設定ファイルの ${k} は数値にしてください`);
      out[k] = v;
    }
  }
  return out as Partial<LayoutOptions>;
}
