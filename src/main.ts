// ogp-break-lint: argument parsing, output and exit codes (shared by the CLI and the Action).
import { extname } from "node:path";
import { parseArgs } from "node:util";
import { InputError } from "./errors.ts";
import { fontMeasure } from "./font.ts";
import { loadConfig, readText, titleFromFrontmatter, titlesFromList } from "./input.ts";
import { lintTitle, type LintResult } from "./lint.ts";
import { DEFAULT_OPTIONS, type LayoutOptions, validateOptions } from "./options.ts";
import { formatPreview } from "./preview.ts";
import type { Measure } from "./width.ts";

export const USAGE = `使い方:
  ogp-break-lint lint    --title "タイトル" [オプション]
  ogp-break-lint lint    --file article.md           frontmatter の ogImage.title > og.title > title
  ogp-break-lint lint    --file titles.txt --list    1 行 1 タイトル
  ogp-break-lint preview --title "タイトル" [オプション]

オプション:
  --width <px>          タイトルを入れる箱の幅（既定 ${DEFAULT_OPTIONS.width}）
  --font-size <px>      フォントサイズ（既定 ${DEFAULT_OPTIONS.fontSize}）
  --padding <px>        左右の余白。利用幅 = width - padding*2（既定 ${DEFAULT_OPTIONS.padding}）
  --line-height <n>     行の高さ倍率（既定 ${DEFAULT_OPTIONS.lineHeight}）
  --max-lines <n>       最大行数。超えると overflow（既定 ${DEFAULT_OPTIONS.maxLines}）
  --word-break <mode>   normal | break-all | keep-all（Satori の word-break と同じ意味。既定 ${DEFAULT_OPTIONS.wordBreak}）
  --config <path>       YAML 設定ファイル（CLI 引数が優先）
  --font <path>         OG テンプレートが Satori に渡す TTF/OTF。グリフ幅とカーニングで計測
  --json                JSON で出力
  -h, --help            このヘルプ

終了コード: 0 = 違反なし, 1 = 違反あり, 2 = 使い方・入力エラー`;

export interface Io {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
}

const defaultIo: Io = {
  stdout: (s) => process.stdout.write(s + "\n"),
  stderr: (s) => process.stderr.write(s + "\n"),
};

export async function run(argv: string[], io: Io = defaultIo): Promise<number> {
  try {
    return await runInner(argv, io);
  } catch (e) {
    if (e instanceof InputError) {
      io.stderr(`エラー: ${e.message}`);
      return 2;
    }
    io.stderr(`内部エラー: ${(e as Error).stack ?? String(e)}`);
    return 2;
  }
}

async function runInner(argv: string[], io: Io): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        title: { type: "string" },
        file: { type: "string" },
        list: { type: "boolean", default: false },
        config: { type: "string" },
        width: { type: "string" },
        "font-size": { type: "string" },
        padding: { type: "string" },
        "line-height": { type: "string" },
        "max-lines": { type: "string" },
        "word-break": { type: "string" },
        font: { type: "string" },
        json: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (e) {
    throw new InputError(`${(e as Error).message}\n\n${USAGE}`);
  }
  const { values: v, positionals } = parsed;
  if (v.help) {
    io.stdout(USAGE);
    return 0;
  }
  const command = positionals[0];
  if (command !== "lint" && command !== "preview") {
    throw new InputError(`${command ? `不明なコマンド: ${command}` : "コマンドを指定してください"}\n\n${USAGE}`);
  }
  if (positionals.length > 1) throw new InputError(`余分な引数: ${positionals.slice(1).join(" ")}`);

  // 設定: 既定値 < 設定ファイル < CLI 引数
  const layout: LayoutOptions = validateOptions({
    ...DEFAULT_OPTIONS,
    ...(v.config ? loadConfig(v.config) : {}),
    ...numOpt("width", v.width),
    ...numOpt("fontSize", v["font-size"]),
    ...numOpt("padding", v.padding),
    ...numOpt("lineHeight", v["line-height"]),
    ...numOpt("maxLines", v["max-lines"]),
    ...(v["word-break"] !== undefined ? { wordBreak: v["word-break"] as LayoutOptions["wordBreak"] } : {}),
  });

  // タイトル
  if (v.title !== undefined && v.file !== undefined) throw new InputError("--title と --file は同時に指定できません");
  let titles: string[];
  if (v.title !== undefined) {
    if (v.list) throw new InputError("--list は --file と一緒に使ってください");
    titles = [v.title];
  } else if (v.file !== undefined) {
    const text = readText(v.file);
    if (v.list) {
      titles = titlesFromList(text);
      if (titles.length === 0) throw new InputError(`${v.file}: タイトルが 1 件もありません`);
    } else if (/^---[ \t]*\r?\n/.test(text) || [".md", ".markdown", ".mdx"].includes(extname(v.file).toLowerCase())) {
      titles = [titleFromFrontmatter(text, v.file)];
    } else {
      throw new InputError(`${v.file}: frontmatter がありません。1 行 1 タイトルのファイルなら --list を付けてください`);
    }
  } else {
    throw new InputError(`--title か --file を指定してください\n\n${USAGE}`);
  }
  for (const t of titles) if (t.trim() === "") throw new InputError("タイトルが空です");

  let measure: Measure | undefined;
  if (v.font) measure = await fontMeasure(v.font, layout.fontSize);

  const results: LintResult[] = titles.map((t) => lintTitle(t, { ...layout, measure }));
  const violationCount = results.reduce((n, r) => n + r.violations.length, 0);

  if (v.json) {
    io.stdout(JSON.stringify({ ok: violationCount === 0, violationCount, results }, null, 2));
  } else if (command === "preview") {
    io.stdout(results.map(formatPreview).join("\n\n"));
  } else {
    io.stdout(formatLint(results, violationCount));
  }
  return violationCount === 0 ? 0 : 1;
}

function formatLint(results: LintResult[], violationCount: number): string {
  const out: string[] = [];
  for (const r of results) {
    if (r.violations.length === 0) {
      out.push(`✓ ${r.title}`);
      continue;
    }
    out.push(`✗ ${r.title}`);
    out.push(`    折れ: ${r.lines.map((l) => l.text).join(" ⏎ ")}`);
    for (const x of r.violations) {
      const kind = x.rule ? `${x.type}:${x.rule}` : x.type;
      const ex = x.type === "mid_phrase" ? "" : `  …${x.excerpt.before}｜${x.excerpt.after}…`;
      out.push(`    [${kind}] offset ${x.offset}: ${x.message}${ex}`);
    }
  }
  out.push(
    violationCount === 0
      ? `違反なし（${results.length} 件）`
      : `違反 ${violationCount} 件（${results.filter((r) => r.violations.length).length}/${results.length} タイトル）`,
  );
  return out.join("\n");
}

function numOpt(key: keyof LayoutOptions, raw: string | undefined): Partial<LayoutOptions> {
  if (raw === undefined) return {};
  const n = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(n)) throw new InputError(`--${key} は数値で指定してください: ${raw}`);
  return { [key]: n } as Partial<LayoutOptions>;
}
