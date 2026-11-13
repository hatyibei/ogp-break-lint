# ogp-break-lint

> [!NOTE]
> ライセンスは Apache-2.0 です。GitHub 経由（Action と CLI）で配布しています。npm には公開していません。

[English README](README.md)

日本語の OGP 画像タイトルを CI でチェックします。Satori / `@vercel/og` で折り返したときに、タイトルが文節の途中で折れる、禁則（行頭・行末）を破る、または許容行数を超える場合に、プルリクエストを失敗させます。

`ogp-break-lint` は TypeScript 製の CLI と、JavaScript の GitHub Action です。既存テンプレートのレイアウトをチェックするツールで、画像の生成はしません。CLI のメッセージは日本語です。

## なぜ必要か

日本語は単語の間に空白がないので、OG 画像のタイトルはレンダラーの幅が尽きたところで折り返されます。その結果、「開発者にも届け｜たい技術記事」のように文節の途中で行が終わったり、小書き仮名で行が始まったり、4 行目まではみ出したりします。たいていはリンクがシェアされるまで誰も気づきません。

CI に必要なのは、次のようなチェックです。

- テンプレートの幅・フォントサイズ・padding で、レンダラーと同じようにタイトルを折り返す
- 文節の途中で折れた、禁則を破った、行数制限を超えた場合にビルドを失敗させる

`ogp-break-lint` はこの両方を行います。折り返し結果を実際の Satori 出力と比較するためのフィクスチャとスクリプトも同梱しています。

## できること

1. **タイトルを折り返す。** Satori の改行をモデル化したもので折り返します（[折り返しモデルの仕組み](#折り返しモデルの仕組み)を参照）。
2. **文節境界を求める。** BudouX の日本語モデルを使います。空白文字の直前・直後も境界として扱います（BudouX は `Hello world` を 1 つのセグメントで返すことがあるため）。
3. **3 種類の違反を報告する。**
   - `mid_phrase`: BudouX の境界ではない位置での改行
   - `kinsoku`: 行頭に来てはいけない文字（`line_start`）、行末に来てはいけない文字（`line_end`）。JIS X 4051 の実用サブセットです（[禁則](#禁則サブセット)を参照）
   - `overflow`: `maxLines` を超える行数

検出と報告だけを行います。自動修正はしません。

## クイックスタート

### GitHub Action

```yaml
- uses: hatyibei/ogp-break-lint@v1
  with:
    file: content/posts/hello.md
    config: .ogp-break-lint.yml
    font: assets/fonts/NotoSansJP-Regular.ttf   # 任意
```

Action はビルド済みのバンドル（`dist/index.cjs`）を Node 24 で実行します。テキストのプレビューを Job Summary に書き出し、違反があれば（終了コード 1）、または入力エラーがあれば（終了コード 2）step を失敗させます。

変更された記事をすべてチェックしたい場合は、shell step で `git diff --name-only` の結果をループして CLI を呼んでください。変更ファイルだけを対象にする組み込みモードはまだありません。

### CLI

npm には公開していないので、GitHub から直接実行します。

```sh
npx github:hatyibei/ogp-break-lint lint --title "開発者にも届けたい技術記事"
npx github:hatyibei/ogp-break-lint preview --title "開発者にも届けたい技術記事"
```

CI は Node 20 と 24 で実行しています。

## 入力と出力（Action）

| 入力 | 対応する CLI 引数 | 説明 |
|---|---|---|
| `title` | `--title` | チェックするタイトル。 |
| `file` | `--file` | Markdown ファイル（frontmatter からタイトルを取得）。`list` と併用するとタイトル一覧。 |
| `list` | `--list` | `file` を 1 行 1 タイトルとして扱う。 |
| `config` | `--config` | 設定ファイルのパス（[設定ファイル](#設定ファイル)を参照）。 |
| `width` | `--width` | 画像 / テキストボックスの幅（px）。 |
| `font-size` | `--font-size` | フォントサイズ（px）。 |
| `padding` | `--padding` | 左右の padding（px、両側から差し引く）。 |
| `line-height` | `--line-height` | 行の高さ。JSON 出力の `textHeight` にだけ影響します。 |
| `max-lines` | `--max-lines` | `overflow` になる前の最大行数。 |
| `word-break` | `--word-break` | `normal`、`break-all`、`keep-all` のいずれか。 |
| `font` | `--font` | 実際のグリフ幅を使うための TTF/OTF ファイル（任意）。 |

| 出力 | 説明 |
|---|---|
| `exit-code` | `0`、`1`、`2` のいずれか（[終了コード](#終了コード)を参照）。 |

## CLI の使い方

```
ogp-break-lint lint    --title "..." [--width 1200] [--font-size 64] [--padding 80] [--line-height 1.25] [--max-lines 3] [--word-break normal|break-all|keep-all] [--font path.ttf] [--config .ogp-break-lint.yml] [--json]
ogp-break-lint lint    --file article.md          # YAML frontmatter: ogImage.title > og.title > title
ogp-break-lint lint    --file titles.txt --list   # 1 行 1 タイトル、空行は無視
ogp-break-lint preview --title "..."              # 行ごとのプレビュー（オフセットと ✓/✗ 付き）
```

角括弧内の値が既定値です。

- `--file` は、ファイルが `---` で始まるか、拡張子が `.md` / `.markdown` / `.mdx` なら frontmatter として読みます。それ以外は `--list` が必要です。
- frontmatter は `ogImage.title`、`og.title`、`title` の順に探します。値が配列またはオブジェクトなら終了コード `2` になります。

### 出力例

`preview`（実際の出力、推定幅モード）:

```
タイトル: 開発者にも届けたい技術記事
幅 448px / padding 0px → 利用幅 448px, fontSize 64px, 推定幅, word-break normal
文節(BudouX): 開発者にも / 届けたい / 技術記事
1| 開発者にも届け    [0-7) 448px
   ✗ 7文字目の後で折れ [mid_phrase] 文節の途中で折れています: 「にも届け｜たい技術」
2| たい技術記事    [7-13) 384px
結果: 違反 1 件
```

### JSON 出力

`--json` を付けた場合:

```
{ ok, violationCount, results: [{
    title, segments, boundaries,
    lines: [{ text, start, end, width }],
    violations: [{ type, rule?, offset, line, char?, excerpt: { before, after }, message }],
    layout: { ..., contentWidth, textHeight, measure: "estimate" | "font" }
}] }
```

`offset` は、新しい行の先頭文字のコードポイント単位のインデックスです。

## 終了コード

| コード | 意味 |
|---|---|
| `0` | 違反なし |
| `1` | 違反あり |
| `2` | 使い方・入力のエラー（空のタイトル、未知の設定キー、`width - 2*padding <= 0` を含む） |

## 設定ファイル

```yaml
# .ogp-break-lint.yml
width: 1200
fontSize: 64
padding: 80
lineHeight: 1.25
maxLines: 3
locale: ja        # "ja" のみ対応
wordBreak: normal # normal | break-all | keep-all
```

優先順位は「既定値 < 設定ファイル < CLI 引数」です。`lineHeight` は JSON 出力の `textHeight` にだけ影響します。未知のキーは入力エラー（終了コード 2）です。

## 折り返しモデルの仕組み

### word-break モード

`wordBreak` は CSS / Satori の `word-break` に対応しています。

- **`normal`**（既定値。Satori の既定値と同じ）: 改行可能位置は UAX #14 に従い、Satori と同じ `linebreak` npm パッケージで求めます。UAX #14 はもともと「。」「、」を行頭に、「「」を行末に置かないので、このモードで禁則違反が出ることはまれです。実際に見つかった例は 1 つで、ASCII の空白の直後の行頭に小書きの「っ」が来たケースです。
- **`break-all`**: 任意の書記素の間で改行します。Satori の `word-break: break-all` や、よくある手書きの canvas `measureText` ループと同じ動きです。禁則を考慮しないので、禁則チェックが最も役立つのはこのモードです。
- **`keep-all`**: `Intl.Segmenter` の単語境界を使います（Satori の `keep-all`）。Node の ICU に依存するため、Node のバージョンによって結果が変わる可能性があります。**Satori との比較は未検証です。**

### 行への詰め方

- 貪欲法です。改行単位ごとに個別に幅を測るので、カーニングは単位内にだけ適用されます（Satori と同じ）。
- 行末の ASCII 空白は行幅に数えません。
- 行幅より広い単位は、その単位だけで 1 行になり、はみ出します。

### box-sizing の注意点

> [!WARNING]
> `contentWidth = width - 2*padding` です。これが Satori と一致するのは、**テキストボックスが `border-box` の場合だけ**です。

- Satori 0.33.5（`@vercel/og` 1.0.3 に同梱）は、既定で `border-box` として動作しました。
- Satori 0.63.2 では、一致させるために `boxSizing: "border-box"` の明示が必要でした。指定しないと padding が幅の外側に足されます。
- テンプレートが `content-box` の場合は、`width` にテキストボックスの幅を、`padding` に `0` を指定してください。

### 空白

Satori の `white-space: normal` と同じく、改行は空白に変わり、連続する ASCII の空白・タブは 1 つにまとめられ、両端は取り除かれます。全角空白 U+3000 は残ります。

## 幅の計測

### 既定: 推定幅

- CJK・全角・絵文字のブロック: 1em
- ASCII: Noto Sans JP Regular の文字ごとの advance 幅と、Noto Sans JP の ASCII カーニングペア（884 ペア、`src/kern-table.ts`）
- 一部の記号（… ― → ※ “ ” — – ─ など）: Noto の幅
- 半角カナ: 0.5em。結合文字・ZWJ・異体字セレクタ: 0。その他の Neutral / Ambiguous の文字: 0.75em
- 書記素（ZWJ 絵文字、国旗、半角カナ + ﾞ）は 1 つのグリフとして、先頭のコードポイントの幅で測ります。

### `--font <ttf|otf>`（Action の入力は `font`）

fontkit（同梱）を使い、実際のグリフの advance 幅とフォントの `kern` 機能で測ります。TTC は最初のフェイスだけを使います。フォントにないグリフは推定幅にフォールバックします。

どちらのモードでも、合字、letter-spacing、フォントのフォールバックチェーン、`palt` / `halt` はモデル化していません。

## 禁則（サブセット）

`kinsoku` チェックは JIS X 4051 の実用的な**サブセット**で、`src/kinsoku.ts` に列挙しています。規格の完全な実装ではありません。違反は `line_start`（行頭に来てはいけない文字）または `line_end`（行末に来てはいけない文字）として報告します。

## Satori との比較検証

**2026-11-13** に、エンジンの結果を実際の Satori の出力と比較しました。

**方法。** `scripts/satori-ground-truth.ts --font <ttf>` が各タイトルを Satori（`embedFont: false`）で描画し、`<text>` の y 座標から行を復元して、エンジンの結果と比較します。

- レイアウト: 幅 1200px で（fontSize 64, padding 80）、（56, 60）、（72, 100）。`wordBreak` は `normal` と `break-all`。lineHeight 1.25。
- Satori のバージョン: 0.33.5 と 0.63.2
- フォント: Noto Sans JP Regular（可変フォントから作った静的インスタンス。古い Satori は可変フォントを読めないため）と Noto Sans CJK JP Regular（TTC から取り出した OTF）

**コミット済みのフィクスチャ。** `fixtures/realistic-titles.txt` には、このプロジェクトのために書いた技術ブログ風のタイトル 40 件が入っています（スクレイピングしたものではありません）。結果は `fixtures/satori/satori-{0.33.5,0.63.2}-{noto-sans-jp,noto-sans-cjk-jp}.json` にあります。

| エンジンのモード | `normal` | `break-all` |
|---|---|---|
| `--font` あり | 120/120 行が一致（全ファイル） | 120/120 行が一致（全ファイル） |
| 推定幅 | 117〜118/120 | 119/120 |

`npm test` は、記録済みの Satori 出力に対して推定幅モードが 117/120 以上であることを再確認します。

**一度きりの確認（タイトルはコミットしていません）。** 2026-11-13 に取得した Zenn の最新の公開記事タイトル 144 件、Satori 0.33.5 と 0.63.2、Noto Sans JP:

| エンジンのモード | `normal` | `break-all` |
|---|---|---|
| `--font` あり | 431/432 | 432/432 |
| 推定幅 | 426/432 | 432/432 |

既定のレイアウト（1200 / 64 / 80、`normal`）では、144 件中 140 件が 2 行以上に折り返され、108 件に `mid_phrase` が 1 つ以上あり、禁則違反は 0 件、3 行を超えたのは 11 件でした。64px で `break-all` にすると、144 件中 14 件に禁則違反がありました。

**残っている既知の不一致:** 端の近くにある半角カタカナ + ﾞ。Noto の CJK かなのカーニング（推定幅モードは ASCII ペアしかカーニングしません）。

### 再現方法

Satori は依存関係に含めていません。比較したいバージョンをインストールしてから、スクリプトを実行します。

```sh
npm i --no-save satori@0.33.5
npx tsx scripts/satori-ground-truth.ts --font path/to/NotoSansJP-Regular.ttf
```

## 未検証のこと

> [!IMPORTANT]
> 以下は**検証していません**。これらに関わる結果は推定として扱ってください。

- **これらの折れを直す価値があるか。** 報告される `mid_phrase` を、実際のサイト運営者が直す価値があると考えるかどうかは、プロダクトとして未解決の問いです。108/144 はエンジンの出力であって、運営者からのフィードバックではありません。BudouX の境界にも議論の余地があるものがあります（例:「・」の後）。
- **絵文字の幅。** Satori の絵文字の幅は、絵文字の渡し方（`graphemeImages` / `loadAdditionalAsset`、例えば Twemoji）によって変わります。比較検証では絵文字フォントを使っておらず、ZWJ の家族絵文字を Satori は単独の行に置いたのに対し、エンジン（1em）はそうしませんでした。
- **`keep-all` モード**の Satori との一致。
- Noto Sans JP と Noto Sans CJK JP **以外のフォント**。
- 0.33.5 と 0.63.2 **以外の Satori のバージョン**。
- 1.0.3（Satori 0.33.5 を同梱）**以外の `@vercel/og` のバージョン**。
- **他のレンダラー。** `next/og` の `ImageResponse` は `@vercel/og` ですが、canvas、Puppeteer/Chrome、resvg のテキストとは比較していません。Chrome は独自の改行処理（ICU）を使うため、結果が異なる可能性があります。
- **プラットフォーム側の挙動はシミュレートしていません。** X、Facebook、Slack、Discord、LINE、Zenn は画像をそのまま表示します。このツールは、プラットフォームによる画像の切り抜きや `og:title` テキストの省略はモデル化していません。
- 上記の 40 件 + 144 件を超える**大規模な精度**。

## 自分で検証する方法

1. 使っている `@vercel/og` が同梱している Satori のバージョンをインストールします（`npm ls satori` で確認）。
   ```sh
   npm i --no-save satori@<version>
   ```
2. テンプレートで使っているフォントファイルそのもの（静的な TTF/OTF）をコピーします。
3. スクリプト内の `LAYOUTS` をテンプレートの width・fontSize・padding に合わせて編集し、`boxSizing` / `wordBreak` もそろえます。そのうえで実行します。
   ```sh
   npx tsx scripts/satori-ground-truth.ts --font path/to/font.ttf --titles your-titles.txt --out ground-truth/mine.json
   ```
4. 最後に表示される集計行を比べ、`cases[].satori` と `engineFont` / `engineEstimate` を見比べます。
5. 他のレンダラーの場合は、実際の OG 画像を描画して、`ogp-break-lint preview` の結果と目で見比べてください。

## 制限と今後の課題

- **Satori そのものではなく、モデルです。** 一致を確認したのは、上に挙げたレイアウト・フォント・バージョンだけです。
- **精度を求めるなら `--font` を使ってください。** 推定幅モードは CJK かなのカーニングをせず、記号の幅も近似です。
- **box-sizing が結果に影響します。** [box-sizing の注意点](#box-sizing-の注意点)を参照してください。
- **禁則は JIS X 4051 のサブセット**です。
- **日本語のみ**対応です（`locale: ja`）。
- **自動修正**と**変更ファイルモード**はまだありません。

今後の候補: PR コメントへの PNG プレビュー、変更ファイルモード、`<wbr>` / BudouX を使った修正案の提示。

## 開発

```sh
npm ci
npm run typecheck
npm test        # node --import tsx --test test/*.test.ts
npm run build   # esbuild → dist/cli.cjs, dist/index.cjs
```

パッケージは `"type": "module"` なので、バンドルは `.cjs` です。`dist/` はコミットしており、CI で最新かどうかを確認しています。CI は Node 20 と 24 で実行しています。

## 関連プロジェクト

この分野の、目的の異なるプロジェクトです。

- **orogami**: `@vercel/og` 向けの BudouX を使った折り返し。作者によると、CI 用のリンターはまだできていないとのことです。
- **ogflow**: 日本語 OGP 画像をホスティングで生成する API。

`ogp-break-lint` は手元にあるテンプレートをチェックするもので、画像は生成しません。

## ライセンス

[Apache License 2.0](LICENSE)
