# ogp-break-lint

> [!NOTE]
> Licensed under Apache-2.0. Distributed through GitHub (Action and CLI); not published on npm.

[日本語版 README はこちら / Japanese README](README.ja.md)

Lint Japanese OGP image titles in CI: fail a pull request when a title, as Satori / `@vercel/og` would wrap it, breaks in the middle of a phrase, breaks kinsoku (line-start / line-end rules), or needs more lines than you allow.

`ogp-break-lint` is a TypeScript CLI plus a JavaScript GitHub Action. It checks your existing template's layout; it does not generate images. CLI messages are in Japanese.

## Why

Japanese has no spaces between words, so an OG image title wraps wherever the renderer runs out of width. The result is often a line that ends in the middle of a phrase (「開発者にも届け｜たい技術記事」), a line that starts with a small kana, or a title that spills onto a fourth line. Nobody notices until the link is shared.

What CI needs is a check that:

- wraps the title the same way your renderer does, at your template's width, font size and padding, and
- fails the build when a break lands inside a phrase, violates kinsoku, or exceeds a line limit.

`ogp-break-lint` does both, and ships the fixtures and script used to compare its wrapping against real Satori output.

## What it does

1. **Wraps the title** with a model of Satori's line breaking (see [How the line-wrapping model works](#how-the-line-wrapping-model-works)).
2. **Finds phrase boundaries** with the BudouX Japanese model. Positions right before and after a whitespace character also count as boundaries (BudouX may return `Hello world` as one segment).
3. **Reports three kinds of violation:**
   - `mid_phrase`: a line break that is not on a BudouX boundary;
   - `kinsoku`: a character that should not start (`line_start`) or end (`line_end`) a line, using a practical subset of JIS X 4051 (see [Kinsoku](#kinsoku-subset));
   - `overflow`: more lines than `maxLines`.

Detection and reporting only. There is no auto-fix.

## Try it in the browser

Paste a title into the [live demo](https://hatyibei.github.io/ogp-break-lint/) to see how it wraps on an OGP-sized canvas, and which breaks fall in the middle of a phrase. The page runs entirely in the browser and uses the same engine and Noto Sans JP metrics as the CLI's default estimate.

## Quick start

### GitHub Action

```yaml
- uses: hatyibei/ogp-break-lint@v1
  with:
    file: content/posts/hello.md
    config: .ogp-break-lint.yml
    font: assets/fonts/NotoSansJP-Regular.ttf   # optional
```

The action runs a prebuilt bundle (`dist/index.cjs`) on Node 24. It writes the text preview to the job summary and fails the step on violations (exit 1) or input errors (exit 2).

To lint every changed post, loop over `git diff --name-only` in a shell step and call the CLI. There is no built-in changed-files mode yet.

### CLI

The package is not on npm; run it straight from GitHub:

```sh
npx github:hatyibei/ogp-break-lint lint --title "開発者にも届けたい技術記事"
npx github:hatyibei/ogp-break-lint preview --title "開発者にも届けたい技術記事"
```

CI runs on Node 20 and 24.

## Inputs and outputs (Action)

| Input | CLI equivalent | Description |
|---|---|---|
| `title` | `--title` | Title text to lint. |
| `file` | `--file` | Markdown file (title taken from frontmatter), or a list of titles with `list`. |
| `list` | `--list` | Treat `file` as one title per line. |
| `config` | `--config` | Path to a config file (see [Config file](#config-file)). |
| `width` | `--width` | Image / text box width in px. |
| `font-size` | `--font-size` | Font size in px. |
| `padding` | `--padding` | Horizontal padding in px (subtracted on both sides). |
| `line-height` | `--line-height` | Line height. Only affects `textHeight` in JSON output. |
| `max-lines` | `--max-lines` | Maximum number of lines before `overflow`. |
| `word-break` | `--word-break` | `normal`, `break-all`, or `keep-all`. |
| `font` | `--font` | TTF/OTF file for real glyph widths (optional). |

| Output | Description |
|---|---|
| `exit-code` | `0`, `1`, or `2` (see [Exit codes](#exit-codes)). |

## CLI usage

```
ogp-break-lint lint    --title "..." [--width 1200] [--font-size 64] [--padding 80] [--line-height 1.25] [--max-lines 3] [--word-break normal|break-all|keep-all] [--font path.ttf] [--config .ogp-break-lint.yml] [--json]
ogp-break-lint lint    --file article.md          # YAML frontmatter: ogImage.title > og.title > title
ogp-break-lint lint    --file titles.txt --list   # one title per line, blank lines ignored
ogp-break-lint preview --title "..."              # per-line preview with offsets and ✓/✗ marks
```

Values in brackets are the defaults.

- `--file` treats the file as frontmatter if it starts with `---` or has a `.md` / `.markdown` / `.mdx` extension. Otherwise it needs `--list`.
- Frontmatter lookup order is `ogImage.title`, then `og.title`, then `title`. If the value is an array or object, the exit code is `2`.

### Example output

`preview` (real output, estimate mode):

```
タイトル: 開発者にも届けたい技術記事
幅 448px / padding 0px → 利用幅 448px, fontSize 64px, 推定幅, word-break normal
文節(BudouX): 開発者にも / 届けたい / 技術記事
1| 開発者にも届け    [0-7) 448px
   ✗ 7文字目の後で折れ [mid_phrase] 文節の途中で折れています: 「にも届け｜たい技術」
2| たい技術記事    [7-13) 384px
結果: 違反 1 件
```

### JSON output

With `--json`:

```
{ ok, violationCount, results: [{
    title, segments, boundaries,
    lines: [{ text, start, end, width }],
    violations: [{ type, rule?, offset, line, char?, excerpt: { before, after }, message }],
    layout: { ..., contentWidth, textHeight, measure: "estimate" | "font" }
}] }
```

`offset` is the code-point index of the first character of the new line.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | No violations |
| `1` | Violations found |
| `2` | Usage or input error, including an empty title, an unknown config key, or `width - 2*padding <= 0` |

## Config file

```yaml
# .ogp-break-lint.yml
width: 1200
fontSize: 64
padding: 80
lineHeight: 1.25
maxLines: 3
locale: ja        # only "ja" is supported
wordBreak: normal # normal | break-all | keep-all
```

Precedence: built-in defaults < config file < CLI flags. `lineHeight` only affects `textHeight` in JSON output. Unknown keys are an input error (exit 2).

## How the line-wrapping model works

### Word-break modes

`wordBreak` mirrors CSS / Satori `word-break`:

- **`normal`** (default, same as Satori's default): break opportunities come from UAX #14 via the `linebreak` npm package, the same library Satori uses. UAX #14 already keeps 「。」「、」 off line starts and 「「」 off line ends, so kinsoku violations are rare in this mode. One real case seen: a small kana 「っ」 at a line start right after an ASCII space.
- **`break-all`**: break between any graphemes, like Satori `word-break: break-all` and typical hand-written canvas `measureText` loops. Kinsoku is not respected, so the kinsoku check is most useful here.
- **`keep-all`**: `Intl.Segmenter` word boundaries (Satori `keep-all`). This depends on Node's ICU, so results may differ between Node versions. **Not verified against Satori.**

### Fitting

- Greedy. Each break unit is measured on its own, so kerning applies within a unit only (as in Satori).
- Trailing ASCII spaces do not count toward the line width.
- A unit wider than the line stays alone on its line and overflows.

### Box sizing caveat

> [!WARNING]
> `contentWidth = width - 2*padding`. This matches Satori **only when the text box uses `border-box`**.

- Satori 0.33.5 (bundled by `@vercel/og` 1.0.3) behaved as `border-box` by default.
- Satori 0.63.2 needed an explicit `boxSizing: "border-box"` to match; otherwise padding is added outside the width.
- If your template uses `content-box`, set `width` to your text box width and `padding` to `0`.

### Whitespace

Like Satori with `white-space: normal`: newlines become spaces, runs of ASCII spaces/tabs collapse into one, and both ends are trimmed. The ideographic space U+3000 is kept.

## Width measurement

### Default: estimate

- CJK, fullwidth and emoji blocks: 1em.
- ASCII: per-character advance widths of Noto Sans JP Regular, plus Noto Sans JP ASCII kerning pairs (884 pairs, `src/kern-table.ts`).
- Some symbols (… ― → ※ “ ” — – ─ etc.): Noto widths.
- Halfwidth kana: 0.5em. Combining marks, ZWJ and variation selectors: 0. Other Neutral/Ambiguous characters: 0.75em.
- Graphemes (ZWJ emoji, flags, halfwidth kana + ﾞ) are measured as one glyph, using the width of the first code point.

### `--font <ttf|otf>` (action input `font`)

Uses real glyph advances and the font's `kern` feature, via fontkit (bundled). For a TTC, only the first face is used. Glyphs missing from the font fall back to the estimate.

Not modelled in either mode: ligatures, letter-spacing, font fallback chains, `palt` / `halt`.

## Kinsoku (subset)

The `kinsoku` check uses a practical **subset** of JIS X 4051, listed in `src/kinsoku.ts`. It is not a full implementation of the standard. Rules are reported as `line_start` (a character that should not begin a line) or `line_end` (a character that should not end a line).

## Verification against Satori

The engine was compared with real Satori output on **2026-11-13**.

**Method.** `scripts/satori-ground-truth.ts --font <ttf>` renders each title with Satori (`embedFont: false`), rebuilds the lines from the `<text>` y coordinates, and compares them with the engine.

- Layouts: 1200px wide with (fontSize 64, padding 80), (56, 60), (72, 100); `wordBreak` `normal` and `break-all`; lineHeight 1.25.
- Satori versions: 0.33.5 and 0.63.2.
- Fonts: Noto Sans JP Regular (a static instance of the variable font; old Satori cannot read variable fonts) and Noto Sans CJK JP Regular (OTF extracted from the TTC).

**Committed fixtures.** `fixtures/realistic-titles.txt` holds 40 tech-blog-style titles written for this project (not scraped). Results are in `fixtures/satori/satori-{0.33.5,0.63.2}-{noto-sans-jp,noto-sans-cjk-jp}.json`.

| Engine mode | `normal` | `break-all` |
|---|---|---|
| With `--font` | 120/120 lines identical (every file) | 120/120 lines identical (every file) |
| Estimate | 117–118/120 | 119/120 |

`npm test` re-checks that estimate mode stays at ≥117/120 against these recorded Satori outputs.

**One-off check (titles not committed).** 144 recent public Zenn article titles, fetched 2026-11-13, Satori 0.33.5 and 0.63.2, Noto Sans JP:

| Engine mode | `normal` | `break-all` |
|---|---|---|
| With `--font` | 431/432 | 432/432 |
| Estimate | 426/432 | 432/432 |

With the default layout (1200 / 64 / 80, `normal`): 140/144 titles wrap onto 2+ lines, 108/144 have at least one `mid_phrase` break, 0 have kinsoku violations, and 11 exceed 3 lines. With `break-all` at 64px, 14/144 have kinsoku violations.

**Known remaining mismatches:** halfwidth katakana with ﾞ near the edge; CJK kana kerning in Noto (estimate mode only kerns ASCII pairs).

### Reproducing it

Satori is not a dependency. Install the version you want to compare against, then run the script:

```sh
npm i --no-save satori@0.33.5
npx tsx scripts/satori-ground-truth.ts --font path/to/NotoSansJP-Regular.ttf
```

## What is not verified

> [!IMPORTANT]
> The following has **not** been verified. Treat results in these areas as estimates.

- **Whether these breaks are worth fixing.** Whether real owners consider the reported `mid_phrase` breaks worth fixing is an open product question. 108/144 is engine output, not owner feedback, and some BudouX boundaries are debatable (for example, after 「・」).
- **Emoji widths.** Satori's emoji width depends on how emoji are supplied (`graphemeImages` / `loadAdditionalAsset`, e.g. Twemoji). The ground-truth runs had no emoji font, and Satori placed a ZWJ family emoji on its own line where the engine (1em) did not.
- **`keep-all` mode** against Satori.
- **Fonts other than** Noto Sans JP and Noto Sans CJK JP.
- **Satori versions other than** 0.33.5 and 0.63.2.
- **`@vercel/og` versions other than** 1.0.3 (which bundles Satori 0.33.5).
- **Other renderers.** `next/og` `ImageResponse` is `@vercel/og`, but canvas, Puppeteer/Chrome and resvg text have not been compared. Chrome uses its own line breaker (ICU) and may differ.
- **Platforms are not simulated.** X, Facebook, Slack, Discord, LINE and Zenn show the image as-is. The tool does not model platform cropping or `og:title` text truncation.
- **Large-scale accuracy** beyond the 40 + 144 titles above.

## How to verify yourself

1. Install the Satori version your `@vercel/og` bundles (check with `npm ls satori`):
   ```sh
   npm i --no-save satori@<version>
   ```
2. Copy the exact font file your template uses (a static TTF/OTF).
3. Edit `LAYOUTS` in the script to your template's width, fontSize and padding, and match `boxSizing` / `wordBreak`. Then run:
   ```sh
   npx tsx scripts/satori-ground-truth.ts --font path/to/font.ttf --titles your-titles.txt --out ground-truth/mine.json
   ```
4. Compare the tally lines printed at the end, and inspect `cases[].satori` against `engineFont` / `engineEstimate`.
5. For other renderers, render your real OG image and compare it by eye with `ogp-break-lint preview`.

## Limitations and future work

- **A model, not Satori itself.** Agreement was measured only on the layouts, fonts and versions listed above.
- **Use `--font` for best results.** Estimate mode does not kern CJK kana and only approximates symbols.
- **Box sizing matters.** See the [box sizing caveat](#box-sizing-caveat).
- **Kinsoku is a subset** of JIS X 4051.
- **Japanese only** (`locale: ja`).
- **No auto-fix** and **no changed-files mode** yet.

Possible future work: PNG preview in PR comments, a changed-files mode, and suggested fixes with `<wbr>` / BudouX.

## Development

```sh
npm ci
npm run typecheck
npm test        # node --import tsx --test test/*.test.ts
npm run build   # esbuild → dist/cli.cjs, dist/index.cjs
npm run build:demo  # esbuild → docs/demo.js (GitHub Pages demo)
```

The package is `"type": "module"`, so the CLI and Action bundles are `.cjs`. `dist/` is committed and CI checks that it is up to date. `docs/demo.js` is the browser demo bundle; regenerate it with `npm run build:demo` after changing the engine or `src/demo-app.ts`. CI runs on Node 20 and 24.

## Related projects

Other projects in this area, with different scopes:

- **orogami**: BudouX-based wrapping for `@vercel/og`. Its author notes that a CI linter is not done yet.
- **ogflow**: a hosted API for Japanese OGP images.

`ogp-break-lint` lints the template you already have; it does not generate images.

## License

[Apache License 2.0](LICENSE)
