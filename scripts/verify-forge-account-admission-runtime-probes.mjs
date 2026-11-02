import { readFileSync } from "node:fs";
import {
  executeAdmissionRuntimeProbes,
} from "./lib/forge-account-admission-runtime-probes.mjs";

function parse(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value) throw new Error("runtime_probe_argument_invalid");
    result[key.slice(2)] = value;
    index += 1;
  }
  return result;
}

const args = parse(process.argv.slice(2));
if (!args.bundle) throw new Error("runtime_probe_bundle_path_required");
const bundle = JSON.parse(readFileSync(args.bundle, "utf8"));
const receipt = await executeAdmissionRuntimeProbes(bundle, {
  mode: args.mode,
  environment: args.environment,
  projectRef: args["project-ref"],
  apiOrigin: args["api-origin"],
});
process.stdout.write(`${JSON.stringify(receipt)}\n`);
