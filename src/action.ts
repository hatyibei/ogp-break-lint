/**
 * GitHub Action entry (bundled to dist/index.cjs).
 * Reads INPUT_* env vars set by the runner, runs `preview` (same exit codes as `lint`),
 * writes the text preview to the job summary and the exit-code output, then exits with that code.
 */
import { appendFileSync } from "node:fs";
import { run } from "./main.ts";

function input(name: string): string {
  return (process.env[`INPUT_${name.replace(/ /g, "_").toUpperCase()}`] ?? "").trim();
}

async function main(): Promise<void> {
  const args = ["preview"];
  const opt = (flag: string, name: string) => {
    const v = input(name);
    if (v) args.push(flag, v);
  };
  opt("--title", "title");
  opt("--file", "file");
  if (input("list").toLowerCase() === "true") args.push("--list");
  opt("--config", "config");
  opt("--width", "width");
  opt("--font-size", "font-size");
  opt("--padding", "padding");
  opt("--line-height", "line-height");
  opt("--max-lines", "max-lines");
  opt("--word-break", "word-break");
  opt("--font", "font");

  let out = "";
  let err = "";
  const code = await run(args, {
    stdout: (s) => {
      out += s + "\n";
      process.stdout.write(s + "\n");
    },
    stderr: (s) => {
      err += s + "\n";
      process.stderr.write(s + "\n");
    },
  });

  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    const body = (out + err).replace(/```/g, "ˋˋˋ");
    appendFileSync(summary, `### ogp-break-lint\n\n\`\`\`\n${body}\`\`\`\n`);
  }
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) appendFileSync(outputFile, `exit-code=${code}\n`);
  if (code === 1) {
    process.stdout.write("::error::ogp-break-lint: OGP title breaks badly (mid-phrase / kinsoku / overflow)\n");
  }
  process.exit(code);
}

void main();
