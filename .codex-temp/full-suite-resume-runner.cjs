const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const summaryPath = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.join(root, ".codex-full-suite-resume-summary.json");
const startAt = process.argv[4] || null;

function* walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === ".git") continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      yield* walk(full);
      continue;
    }
    if (ent.name === "package.json") yield full;
  }
}

const tasks = [];
for (const file of walk(root)) {
  const dir = path.dirname(file);
  if (dir === root) continue;
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  const scriptNames = Object.keys(pkg.scripts || {}).filter((name) => name.startsWith("test:")).sort();
  for (const script of scriptNames) {
    tasks.push({
      label: `${path.relative(root, dir).replace(/\\/g, "/")}:${script}`,
      dir,
      script,
    });
  }
}

const startIndex = startAt ? tasks.findIndex((task) => task.label === startAt) : 0;
if (startAt && startIndex === -1) {
  throw new Error(`Unknown start label: ${startAt}`);
}

const selectedTasks = tasks.slice(startIndex >= 0 ? startIndex : 0);
const results = [];
for (const task of selectedTasks) {
  const startedAt = Date.now();
  const run = spawnSync("pnpm", ["run", task.script], {
    cwd: task.dir,
    encoding: "utf8",
    shell: true,
    maxBuffer: 50 * 1024 * 1024,
  });
  const lines = `${run.stdout || ""}${run.stderr || ""}`.split(/\r?\n/).filter(Boolean);
  results.push({
    label: task.label,
    exitCode: run.status ?? -1,
    durationSec: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
    failureTail: run.status === 0 ? [] : lines.slice(-60),
  });
}

const failures = results.filter((item) => item.exitCode !== 0);
const summary = {
  generatedAt: new Date().toISOString(),
  startAt,
  total: results.length,
  passed: results.length - failures.length,
  failed: failures.length,
  failures,
};
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
console.log(`Wrote ${summaryPath}`);
console.log(`Summary: ${summary.passed} passed, ${summary.failed} failed, total ${summary.total}`);
process.exit(failures.length === 0 ? 0 : 1);
