import { spawnSync } from "node:child_process";
import process from "node:process";

const probe = spawnSync(process.execPath, ["--input-type=module", "--eval", "throw new Error('expected gate probe failure')"], {
  encoding: "utf8",
});
if (probe.status === 0) {
  console.error("Test-runner exit preflight failed: uncaught exception returned status 0.");
  process.exit(1);
}
console.log("Test-runner exit preflight passed.");
