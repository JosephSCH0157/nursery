const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const summaryPath = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.join(root, ".codex-full-suite-summary.json");

function* walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === ".git") continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      yield* walk(full);
      continue;
    }
    if (ent.name === "package.json") {
      yield full;
    }
  }
}

const tasks = [];
const rootPkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
if (rootPkg.scripts && rootPkg.scripts.smoke) {
  tasks.push({ label: "root:smoke", dir: root, script: "smoke" });
}

for (const file of walk(root)) {
  const dir = path.dirname(file);
  if (dir === root) continue;
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  const scriptNames = Object.keys(pkg.scripts || {})
    .filter((name) => name.startsWith("test:"))
    .sort();
  for (const script of scriptNames) {
    tasks.push({
      label: `${path.relative(root, dir).replace(/\\/g, "/")}:${script}`,
      dir,
      script,
    });
  }
}

const results = [];
for (const task of tasks) {
  const startedAt = Date.now();
  const run = spawnSync("pnpm", ["run", task.script], {
    cwd: task.dir,
    encoding: "utf8",
    shell: true,
    maxBuffer: 50 * 1024 * 1024,
  });
  const combined = `${run.stdout || ""}${run.stderr || ""}`;
  const lines = combined.split(/\r?\n/).filter(Boolean);
  const durationSec = Number(((Date.now() - startedAt) / 1000).toFixed(1));
  results.push({
    label: task.label,
    script: task.script,
    dir: path.relative(root, task.dir).replace(/\\/g, "/") || ".",
    exitCode: run.status ?? -1,
    durationSec,
    failureTail: run.status === 0 ? [] : lines.slice(-40),
  });
}

const failures = results.filter((result) => result.exitCode !== 0);
const summary = {
  generatedAt: new Date().toISOString(),
  root,
  total: results.length,
  passed: results.length - failures.length,
  failed: failures.length,
  failures,
};

fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
console.log(`Wrote ${summaryPath}`);
console.log(`Summary: ${summary.passed} passed, ${summary.failed} failed, total ${summary.total}`);
process.exit(failures.length === 0 ? 0 : 1);
