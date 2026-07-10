import { readFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

const hammerRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = resolve(hammerRoot, "lint-warning-baseline.json");
const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
const eslint = new ESLint({ cwd: hammerRoot });
const results = await eslint.lintFiles(["src", "tests"]);
const formatter = await eslint.loadFormatter("stylish");
const errors = results.flatMap((result) => result.messages.filter((message) => message.severity === 2));
const unexpectedWarnings = results.flatMap((result) =>
  result.messages.filter(
    (message) => message.severity === 1 && message.ruleId !== "react-hooks/exhaustive-deps",
  ),
);

if (errors.length > 0 || unexpectedWarnings.length > 0) {
  console.error(await formatter.format(results));
  throw new Error(
    `Hammer lint failed with ${errors.length} error(s) and ${unexpectedWarnings.length} unexpected warning(s).`,
  );
}

const warningCounts = Object.fromEntries(
  results
    .map((result) => {
      const file = relative(hammerRoot, result.filePath).split(sep).join("/");
      const count = result.messages.filter((message) => message.severity === 1).length;
      return [file, count];
    })
    .filter(([, count]) => count > 0),
);

const regressions = Object.entries(warningCounts).filter(
  ([file, count]) => count > (baseline.files[file] ?? 0),
);
if (regressions.length > 0) {
  for (const [file, count] of regressions) {
    console.error(`${file}: ${count} Hook warning(s), baseline ${baseline.files[file] ?? 0}.`);
  }
  throw new Error("Hammer Hook warning baseline increased.");
}

const warningTotal = Object.values(warningCounts).reduce((sum, count) => sum + count, 0);
const baselineTotal = Object.values(baseline.files).reduce((sum, count) => sum + count, 0);
console.log(
  `Hammer lint gate passed: 0 errors; ${warningTotal}/${baselineTotal} grandfathered Hook warning(s).`,
);
