import { spawnSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const commands = [
  ["pnpm", ["preflight:workspace"]],
  ["pnpm", ["--dir", "apps/anvil", "run", "lint"]],
  ["pnpm", ["--dir", "apps/anvil", "run", "typecheck"]],
  ["pnpm", ["--dir", "apps/anvil", "run", "check:cycles"]],
  ["pnpm", ["--dir", "apps/anvil", "run", "build"]],
  ["pnpm", ["--filter", "@forge/tongs", "build"]],
  ["node", ["--test", "packages/tongs/tests/venue-neutral-recording-authority.test.mjs", "packages/tongs/tests/anvil-capture-authority.test.mjs", "packages/tongs/tests/recording-canonical-media-verification.test.mjs"]],
  ["pnpm", ["--dir", "apps/anvil", "exec", "jest", "--config", "jest.config.cjs", "tests/recording", "--runInBand"]],
  ["pnpm", ["--dir", "apps/anvil", "run", "test:recording-boundary-browser"]],
  ["node", ["scripts/certify-anvil-migration-chain.mjs"]],
  ["pnpm", ["--dir", "apps/anvil", "run", "smoke:strict"]],
  ["pnpm", ["--filter", "nursery", "exec", "playwright", "test", "-c", "playwright.config.ts", "playwright/hearth.phase4.anvil-handoff.spec.ts", "--workers=1"]],
];

for (const [command, args] of commands) {
  process.stdout.write(`\n[anvil-release] ${command} ${args.join(" ")}\n`);
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
process.stdout.write("\nAnvil automated release gate passed.\n");
