import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { forgeNavTree } from "../src/nav/forgeNavTree";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outPath = path.join(__dirname, "..", "public", "forge-nav.json");

const payload = {
  schema: 1,
  generated_at: new Date().toISOString(),
  tree: forgeNavTree,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`[forge-nav] wrote ${outPath}`);
