// CLI entry (bundled to dist/cli.cjs).
import { run } from "./main.ts";

run(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
