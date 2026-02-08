import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sourcePath = path.join(__dirname, "..", "src", "nav", "forgeNavTree.ts");
const outPath = path.join(__dirname, "..", "public", "forge-nav.json");

async function loadForgeNavTreeFromTsModule(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filePath,
  }).outputText;

  const encoded = Buffer.from(transpiled, "utf8").toString("base64");
  const moduleUrl = `data:text/javascript;base64,${encoded}`;
  const mod = await import(moduleUrl);
  return mod.forgeNavTree;
}

try {
  const forgeNavTree = await loadForgeNavTreeFromTsModule(sourcePath);
  if (!Array.isArray(forgeNavTree)) {
    throw new Error("forgeNavTree export is not an array.");
  }

  const payload = {
    schema: 1,
    generated_at: new Date().toISOString(),
    tree: forgeNavTree,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`[forge-nav] wrote ${outPath}`);
} catch (err) {
  console.error("[forge-nav] failed to generate nav JSON", err);
  process.exit(1);
}
