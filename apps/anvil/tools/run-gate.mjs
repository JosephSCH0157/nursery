import { spawn } from "node:child_process";

const steps = [
  ["lint"],
  ["lint:badchars"],
  ["types"],
  ["build:router"],
  ["smoke:strict"],
  ["smoke:rehearsal"],
  ["smoke:hud"],
  ["smoke:reh_api"],
  ["ui:crawl"],
  ["ui:crawl:validate"],
];

function runStep(args) {
  return new Promise((resolve, reject) => {
    const name = args.join(" ");
    console.log(`\n=== GATE STEP: ${name} ===`);

    const proc = spawn("npm", ["run", ...args], { stdio: "inherit", shell: true });
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Step failed: ${name} (exit ${code})`));
    });
  });
}

try {
  for (const step of steps) {
    await runStep(step);
  }
  console.log("\n\u2705 GATE COMPLETE");
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("\n\u274c GATE FAILED:", msg);
  process.exit(1);
}
