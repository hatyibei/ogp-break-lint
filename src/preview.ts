// 折れた行のテキストプレビュー。
import type { LintResult } from "./lint.ts";

export function formatPreview(r: LintResult): string {
  const out: string[] = [];
  const l = r.layout;
  out.push(`タイトル: ${r.title}`);
  out.push(
    `幅 ${l.width}px / padding ${l.padding}px → 利用幅 ${l.contentWidth}px, fontSize ${l.fontSize}px, ` +
      `${l.measure === "font" ? "実フォント幅" : "推定幅"}, word-break ${l.wordBreak}`,
  );
  out.push(`文節(BudouX): ${r.segments.join(" / ")}`);
  const numW = String(r.lines.length).length;
  r.lines.forEach((line, i) => {
    const n = String(i + 1).padStart(numW, " ");
    const range = `[${line.start}-${line.end})`;
    out.push(`${n}| ${line.text}    ${range} ${Math.round(line.width)}px`);
    const breaks = r.violations.filter((v) => v.offset === line.end && v.type !== "overflow");
    if (i < r.lines.length - 1) {
      if (breaks.length === 0) {
        out.push(`${" ".repeat(numW)}  ✓ ${line.end}文字目の後で折れ（文節境界）`);
      } else {
        for (const v of breaks) out.push(`${" ".repeat(numW)}  ✗ ${line.end}文字目の後で折れ [${label(v)}] ${v.message}`);
      }
    }
  });
  for (const v of r.violations.filter((v) => v.type === "overflow")) out.push(`  ✗ [overflow] ${v.message}`);
  out.push(r.violations.length === 0 ? "結果: 違反なし" : `結果: 違反 ${r.violations.length} 件`);
  return out.join("\n");
}

function label(v: { type: string; rule?: string }): string {
  return v.rule ? `${v.type}:${v.rule}` : v.type;
}
