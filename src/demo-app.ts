// Browser demo for ogp-break-lint. Bundled into docs/demo.js; runs entirely client-side.
import { InputError } from "./errors.ts";
import { lintTitle, type LintResult, type Violation } from "./lint.ts";
import { DEFAULT_OPTIONS } from "./options.ts";
import { formatPreview } from "./preview.ts";
import { WORD_BREAKS, type WordBreak, toChars } from "./wrap.ts";

type FormState = {
  title: string;
  width: number;
  padding: number;
  fontSize: number;
  lineHeight: number;
  maxLines: number;
  wordBreak: WordBreak;
};

const SAMPLES: { label: string; title: string; width?: number; padding?: number; fontSize?: number }[] = [
  { label: "文節の途中で折れる例", title: "キャッシュ戦略を見直したらレスポンスが 3 倍速くなった" },
  { label: "きれいに折れる例", title: "TypeScript 7 へのアップグレードで踏んだ地雷まとめ" },
  { label: "README の狭い幅の例", title: "開発者にも届けたい技術記事", width: 448, padding: 0, fontSize: 64 },
  { label: "カタカナ語の途中", title: "【保存版】GitHub Actions のキャッシュを使いこなす" },
  { label: "漢字の複合語の途中", title: "WebAssembly でブラウザ上に画像処理エンジンを載せる" },
];

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} が見つかりません`);
  return el as T;
};

const isWordBreak = (v: string): v is WordBreak => (WORD_BREAKS as readonly string[]).includes(v);

const readForm = (): FormState => {
  const wordBreakRaw = ($("wordBreak") as HTMLSelectElement).value;
  return {
    title: ($("title") as HTMLTextAreaElement).value,
    width: Number(($("width") as HTMLInputElement).value) || DEFAULT_OPTIONS.width,
    padding: Number(($("padding") as HTMLInputElement).value),
    fontSize: Number(($("fontSize") as HTMLInputElement).value) || DEFAULT_OPTIONS.fontSize,
    lineHeight: Number(($("lineHeight") as HTMLInputElement).value) || DEFAULT_OPTIONS.lineHeight,
    maxLines: Number(($("maxLines") as HTMLInputElement).value) || DEFAULT_OPTIONS.maxLines,
    wordBreak: isWordBreak(wordBreakRaw) ? wordBreakRaw : DEFAULT_OPTIONS.wordBreak,
  };
};

const writeForm = (s: Partial<FormState>) => {
  if (s.title !== undefined) ($("title") as HTMLTextAreaElement).value = s.title;
  const assign = (id: keyof FormState, value: string | number | undefined) => {
    if (value === undefined) return;
    const el = $(id) as HTMLInputElement;
    el.value = String(value);
    const out = document.getElementById(`${id}Val`);
    if (out) out.textContent = formatOption(id, Number(value) || value);
  };
  assign("width", s.width);
  assign("padding", s.padding);
  assign("fontSize", s.fontSize);
  assign("lineHeight", s.lineHeight);
  assign("maxLines", s.maxLines);
  if (s.wordBreak) ($("wordBreak") as HTMLSelectElement).value = s.wordBreak;
};

const formatOption = (id: string, value: string | number): string => {
  if (id === "lineHeight") return Number(value).toFixed(2);
  if (id === "width" || id === "padding" || id === "fontSize") return `${value} px`;
  return String(value);
};

const syncOutputs = () => {
  for (const id of ["width", "padding", "fontSize", "lineHeight", "maxLines"] as const) {
    const el = $(id) as HTMLInputElement;
    const out = document.getElementById(`${id}Val`);
    if (out) out.textContent = formatOption(id, el.value);
  }
  const w = Number(($("width") as HTMLInputElement).value) || 0;
  const p = Number(($("padding") as HTMLInputElement).value) || 0;
  $("contentWidthVal").textContent = `${w - p * 2} px`;
};

const parseQuery = (): Partial<FormState> => {
  const q = new URLSearchParams(location.search);
  const out: Partial<FormState> = {};
  const title = q.get("title");
  if (title !== null) out.title = title;
  const numKeys = ["width", "padding", "fontSize", "lineHeight", "maxLines"] as const;
  for (const k of numKeys) {
    const raw = q.get(k);
    if (raw === null || raw === "") continue;
    const n = Number(raw);
    if (Number.isFinite(n)) out[k] = n;
  }
  const wb = q.get("wordBreak");
  if (wb && isWordBreak(wb)) out.wordBreak = wb;
  return out;
};

const writeQuery = (s: FormState) => {
  const q = new URLSearchParams();
  if (s.title.trim() !== "") q.set("title", s.title);
  if (s.width !== DEFAULT_OPTIONS.width) q.set("width", String(s.width));
  if (s.padding !== DEFAULT_OPTIONS.padding) q.set("padding", String(s.padding));
  if (s.fontSize !== DEFAULT_OPTIONS.fontSize) q.set("fontSize", String(s.fontSize));
  if (s.lineHeight !== DEFAULT_OPTIONS.lineHeight) q.set("lineHeight", String(s.lineHeight));
  if (s.maxLines !== DEFAULT_OPTIONS.maxLines) q.set("maxLines", String(s.maxLines));
  if (s.wordBreak !== DEFAULT_OPTIONS.wordBreak) q.set("wordBreak", s.wordBreak);
  const qs = q.toString();
  const next = qs ? `${location.pathname}?${qs}` : location.pathname;
  history.replaceState(null, "", next);
};

const splitRanges = (result: LintResult): Array<{ start: number; end: number }> => {
  const ranges: Array<{ start: number; end: number }> = [];
  let pos = 0;
  for (const seg of result.segments) {
    const start = pos;
    const end = pos + toChars(seg).length;
    if (result.violations.some((v) => v.type === "mid_phrase" && v.offset > start && v.offset < end)) {
      ranges.push({ start, end });
    }
    pos = end;
  }
  return ranges;
};

const inRange = (i: number, ranges: Array<{ start: number; end: number }>) =>
  ranges.some((r) => i >= r.start && i < r.end);

const kinsokuOffsets = (result: LintResult): Set<number> => {
  const set = new Set<number>();
  for (const v of result.violations) {
    if (v.type !== "kinsoku") continue;
    if (v.rule === "line_end") set.add(v.offset - 1);
    if (v.rule === "line_start") set.add(v.offset);
  }
  return set;
};

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts: { className?: string; text?: string; attrs?: Record<string, string> } = {},
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (opts.className) node.className = opts.className;
  if (opts.text !== undefined) node.textContent = opts.text;
  if (opts.attrs) for (const [k, v] of Object.entries(opts.attrs)) node.setAttribute(k, v);
  return node;
};

const renderCard = (result: LintResult, mount: HTMLElement) => {
  const layout = result.layout;
  const canvasW = layout.width;
  const canvasH = Math.max(1, Math.round((layout.width * 630) / 1200));
  const midRanges = splitRanges(result);
  const kinsoku = kinsokuOffsets(result);
  const overflowFrom = result.violations.find((v) => v.type === "overflow")?.line;

  const stage = el("div", { className: "stage" });
  const card = el("div", { className: "card", attrs: { role: "img", "aria-label": "OGP画像の折り返しプレビュー" } });
  card.style.width = `${canvasW}px`;
  card.style.height = `${canvasH}px`;
  card.style.setProperty("--pad", `${layout.padding}px`);
  card.style.setProperty("--fs", `${layout.fontSize}px`);
  card.style.setProperty("--lh", String(layout.lineHeight));

  const box = el("div", { className: "card-box" });
  box.style.padding = `${layout.padding}px`;

  result.lines.forEach((line, i) => {
    const lineNo = i + 1;
    const overflow = overflowFrom !== undefined && lineNo >= overflowFrom;
    const row = el("div", { className: overflow ? "card-line is-overflow" : "card-line" });
    row.style.height = `${layout.fontSize * layout.lineHeight}px`;
    const text = el("div", { className: "card-line-text" });
    const chars = toChars(line.text);
    chars.forEach((ch, j) => {
      const abs = line.start + j;
      const span = el("span", { text: ch });
      if (inRange(abs, midRanges)) span.classList.add("is-mid");
      if (kinsoku.has(abs)) {
        span.classList.add("is-kinsoku");
        span.title = "禁則";
      }
      text.append(span);
    });
    row.append(text);
    box.append(row);
  });

  const footer = el("div", { className: "card-meta", text: `${canvasW} × ${canvasH} · 利用幅 ${layout.contentWidth}px` });
  card.append(box, footer);
  stage.append(card);
  mount.replaceChildren(stage);
  scaleCard(stage, card, canvasW);
};

let cardObserver: ResizeObserver | undefined;

const scaleCard = (stage: HTMLElement, card: HTMLElement, canvasW: number) => {
  const apply = () => {
    const avail = stage.clientWidth;
    const scale = Math.min(1, avail / canvasW);
    card.style.transform = `scale(${scale})`;
    stage.style.height = `${card.offsetHeight * scale}px`;
  };
  cardObserver?.disconnect();
  apply();
  cardObserver = new ResizeObserver(apply);
  cardObserver.observe(stage);
};

const labelOf = (v: Violation): string => {
  if (v.type === "mid_phrase") return "文節の途中";
  if (v.type === "kinsoku") return v.rule === "line_end" ? "行末禁則" : "行頭禁則";
  if (v.type === "overflow") return "行数オーバー";
  return v.type;
};

const renderResult = (result: LintResult) => {
  renderCard(result, $("preview"));

  const summary = $("summary");
  summary.replaceChildren();
  const status = el("p", { className: result.violations.length === 0 ? "status is-ok" : "status is-bad" });
  if (result.violations.length === 0) {
    status.textContent = `違反なし · ${result.lines.length} 行 · 推定幅（Noto Sans JP）`;
  } else {
    const kinds = new Map<string, number>();
    for (const v of result.violations) kinds.set(v.type, (kinds.get(v.type) ?? 0) + 1);
    const parts = [...kinds.entries()].map(([k, n]) => `${k} ${n}件`).join("、");
    status.textContent = `違反 ${result.violations.length} 件（${parts}） · ${result.lines.length} 行 · 推定幅（Noto Sans JP）`;
  }
  summary.append(status);

  const segs = el("div", { className: "segments", attrs: { "aria-label": "BudouX の文節" } });
  const midRanges = splitRanges(result);
  let pos = 0;
  for (const seg of result.segments) {
    const start = pos;
    const end = pos + toChars(seg).length;
    const chip = el("span", { className: inRange(start, midRanges) || midRanges.some((r) => r.start === start) ? "seg is-mid" : "seg", text: seg });
    if (midRanges.some((r) => r.start === start && r.end === end)) chip.classList.add("is-mid");
    segs.append(chip);
    pos = end;
  }
  const segLabel = el("h2", { text: "文節（BudouX）" });
  summary.append(segLabel, segs);

  const list = el("ul", { className: "violations" });
  if (result.violations.length === 0) {
    list.append(el("li", { className: "is-ok", text: "文節の途中の折れ、禁則、行数オーバーはありません。" }));
  } else {
    for (const v of result.violations) {
      const item = el("li", { className: `is-${v.type}` });
      const tag = el("b", { text: labelOf(v) });
      const body = el("span", { text: ` ${v.message}` });
      item.append(tag, body);
      list.append(item);
    }
  }
  summary.append(el("h2", { text: "判定" }), list);

  const table = el("table", { className: "lines" });
  const head = el("tr");
  for (const h of ["行", "テキスト", "幅", "折れ"]) head.append(el("th", { text: h }));
  table.append(head);
  result.lines.forEach((line, i) => {
    const tr = el("tr");
    tr.append(el("td", { text: String(i + 1) }));
    tr.append(el("td", { className: "mono", text: line.text }));
    tr.append(el("td", { className: "num", text: `${Math.round(line.width)} px` }));
    let fold = "—";
    let cls = "";
    if (i < result.lines.length - 1) {
      const vs = result.violations.filter((v) => v.offset === line.end && v.type !== "overflow");
      if (vs.length === 0) {
        fold = "文節境界";
        cls = "is-ok";
      } else {
        fold = vs.map(labelOf).join("、");
        cls = "is-bad";
      }
    }
    tr.append(el("td", { className: cls, text: fold }));
    table.append(tr);
  });
  summary.append(el("h2", { text: "行" }), table);

  ($("previewText") as HTMLElement).textContent = formatPreview(result);
};

const renderEmpty = () => {
  $("preview").replaceChildren(el("p", { className: "placeholder", text: "タイトルを入力すると、OGP画像の幅で折り返したプレビューがここに出ます。" }));
  $("summary").replaceChildren();
  ($("previewText") as HTMLElement).textContent = "";
};

const renderError = (message: string) => {
  $("preview").replaceChildren(el("p", { className: "error", text: message }));
  $("summary").replaceChildren();
  ($("previewText") as HTMLElement).textContent = "";
};

const run = () => {
  const s = readForm();
  syncOutputs();
  writeQuery(s);
  const trimmed = s.title.replace(/\r?\n/g, " ").replace(/[ \t]+/g, " ").replace(/^ | $/g, "");
  if (trimmed.trim() === "") {
    renderEmpty();
    return;
  }
  try {
    const result = lintTitle(s.title, {
      width: s.width,
      padding: s.padding,
      fontSize: s.fontSize,
      lineHeight: s.lineHeight,
      maxLines: s.maxLines,
      wordBreak: s.wordBreak,
    });
    renderResult(result);
  } catch (e) {
    const msg = e instanceof InputError || e instanceof Error ? e.message : String(e);
    renderError(msg);
  }
};

const fillSamples = () => {
  const nav = $("samples");
  nav.replaceChildren();
  for (const sample of SAMPLES) {
    const btn = el("button", { className: "sample", text: sample.label, attrs: { type: "button" } });
    btn.addEventListener("click", () => {
      writeForm({
        title: sample.title,
        width: sample.width ?? DEFAULT_OPTIONS.width,
        padding: sample.padding ?? DEFAULT_OPTIONS.padding,
        fontSize: sample.fontSize ?? DEFAULT_OPTIONS.fontSize,
        lineHeight: DEFAULT_OPTIONS.lineHeight,
        maxLines: DEFAULT_OPTIONS.maxLines,
        wordBreak: DEFAULT_OPTIONS.wordBreak,
      });
      run();
    });
    nav.append(btn);
  }
};

const copyText = async (text: string, btn: HTMLElement, okLabel: string) => {
  const prev = btn.textContent;
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = okLabel;
  } catch {
    btn.textContent = "コピーできませんでした";
  }
  setTimeout(() => {
    btn.textContent = prev;
  }, 1500);
};

const init = () => {
  if (typeof Intl === "undefined" || typeof Intl.Segmenter !== "function") {
    renderError("このブラウザは Intl.Segmenter に対応していないため、デモを動かせません。最新の Chrome、Firefox、Safari、Edge で開いてください。");
    return;
  }
  fillSamples();
  writeForm({ ...DEFAULT_OPTIONS, title: "" });
  const fromQuery = parseQuery();
  if (Object.keys(fromQuery).length > 0) writeForm(fromQuery);
  else writeForm({ title: SAMPLES[0]!.title });

  $("form").addEventListener("input", run);
  $("copyLink").addEventListener("click", () => {
    copyText(location.href, $("copyLink"), "URLをコピーした");
  });
  $("copyPreview").addEventListener("click", () => {
    const text = ($("previewText") as HTMLElement).textContent ?? "";
    copyText(text, $("copyPreview"), "コピーした");
  });
  $("reset").addEventListener("click", () => {
    writeForm({ ...DEFAULT_OPTIONS, title: SAMPLES[0]!.title });
    run();
  });
  run();
};

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
