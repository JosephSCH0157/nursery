const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const progressPath = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.join(root, ".codex-full-suite-progress.json");

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
const rootPkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
if (rootPkg.scripts && rootPkg.scripts.smoke) {
  tasks.push({ label: "root:smoke", dir: root, script: "smoke" });
}
for (const file of walk(root)) {
  const dir = path.dirname(file);
  if (dir === root) continue;
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  const scriptNames = Object.keys(pkg.scripts || {}).filter((name) => name.startsWith("test:")).sort();
  for (const script of scriptNames) {
    tasks.push({ label: `${path.relative(root, dir).replace(/\\/g, "/")}:${script}`, dir, script });
  }
}

const state = {
  generatedAt: new Date().toISOString(),
  total: tasks.length,
  current: null,
  completed: [],
  failures: [],
};

function flush() {
  fs.writeFileSync(progressPath, JSON.stringify(state, null, 2));
}

flush();
for (const task of tasks) {
  state.current = task.label;
  flush();
  const startedAt = Date.now();
  const run = spawnSync("pnpm", ["run", task.script], {
    cwd: task.dir,
    encoding: "utf8",
    shell: true,
    maxBuffer: 50 * 1024 * 1024,
  });
  const lines = `${run.stdout || ""}${run.stderr || ""}`.split(/\r?\n/).filter(Boolean);
  const result = {
    label: task.label,
    exitCode: run.status ?? -1,
    durationSec: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
  };
  state.completed.push(result);
  if (result.exitCode !== 0) {
    state.failures.push({ ...result, failureTail: lines.slice(-40) });
  }
  flush();
}
state.current = null;
flush();
process.exit(state.failures.length === 0 ? 0 : 1);
