# Ground truth: ogp-break-lint vs. Satori

Generated on 2026-11-13 (JST) with `scripts/satori-ground-truth.ts`. Raw results: `fixtures/satori/*.json`.

Setup: container 1200px wide, layouts (fontSize/padding) 64/80, 56/60, 72/100, `lineHeight: 1.25`, `boxSizing: "border-box"`, `embedFont: false`. Lines are reconstructed from the `<text>` elements of Satori's SVG and compared ignoring whitespace.

## Committed fixtures (40 titles in `fixtures/realistic-titles.txt`, written for this project)

| Satori | Font | word-break | engine + `--font` | engine + estimate |
|---|---|---|---|---|
| 0.33.5 | NotoSansCJKjp-Regular.otf | normal | 120/120 | 117/120 |
| 0.33.5 | NotoSansCJKjp-Regular.otf | break-all | 120/120 | 119/120 |
| 0.33.5 | NotoSansJP-Regular.ttf | normal | 120/120 | 118/120 |
| 0.33.5 | NotoSansJP-Regular.ttf | break-all | 120/120 | 119/120 |
| 0.63.2 | NotoSansCJKjp-Regular.otf | normal | 120/120 | 117/120 |
| 0.63.2 | NotoSansCJKjp-Regular.otf | break-all | 120/120 | 119/120 |
| 0.63.2 | NotoSansJP-Regular.ttf | normal | 120/120 | 118/120 |
| 0.63.2 | NotoSansJP-Regular.ttf | break-all | 120/120 | 119/120 |

Fonts: Noto Sans JP Regular (static wght=400 instance of the variable font; Satori 0.33.5 cannot parse variable fonts) and Noto Sans CJK JP Regular (OTF extracted from the TTC). Font files are not committed.

## One-off check on public titles (not committed)

144 latest public Zenn article titles, fetched 2026-11-13. Satori 0.33.5 and 0.63.2 gave identical results.

| Font | word-break | engine + `--font` | engine + estimate |
|---|---|---|---|
| Noto Sans JP | normal | 431/432 | 426/432 |
| Noto Sans JP | break-all | 432/432 | 432/432 |
| Noto Sans CJK JP | normal | 431/432 | 424/432 |
| Noto Sans CJK JP | break-all | 432/432 | 432/432 |

With the default layout (1200 / 64 / 80, `normal`): 140 of 144 titles wrap to 2+ lines, 108 have at least one `mid_phrase` break, 0 have a `kinsoku` violation, 11 need more than 3 lines. With `break-all` at 64px, 14 of 144 have a `kinsoku` violation.

These are engine results, not owner feedback: whether people want to fix these breaks is not verified.

## Findings

- Satori `word-break: normal` uses UAX #14 (the `linebreak` package), which already keeps 。、 off line starts and 「 off line ends. The prototype assumed character-level greedy wrapping for the default, which only matches `break-all`.
- Satori measures each break unit separately, applying the font's kerning inside the unit. Measuring whole lines with kerning, or ignoring kerning, both lowered agreement.
- Satori 0.63.2 needs an explicit `boxSizing: "border-box"` to make `contentWidth = width - 2 * padding`; 0.33.5 behaved that way by default.
- Remaining mismatches: halfwidth katakana with ﾞ at the edge; kana kerning pairs in Noto (estimate mode only kerns ASCII pairs).
- Not covered: `keep-all`, emoji widths (no emoji assets were configured), other fonts, other Satori versions, other renderers.
