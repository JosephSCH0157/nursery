import { config } from "dotenv";
import { spawn } from "node:child_process";

config({ path: "apps/nursery/.env.local" });

const cmd = process.argv.slice(2);
if (cmd.length === 0) {
  console.error("Usage: node scripts/run-with-nursery-env.mjs <command> [...args]");
  process.exit(1);
}

const child = spawn(cmd[0], cmd.slice(1), {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

child.on("exit", (code) => process.exit(code ?? 0));
