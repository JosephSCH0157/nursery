import fs from "node:fs";
import path from "node:path";

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function emptyDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, name), { recursive: true, force: true });
  }
}

const nurseryRoot = process.cwd();
const src = path.resolve(nurseryRoot, "..", "anvil", "dist");
const dest = path.resolve(nurseryRoot, "public", "anvil");

if (!fs.existsSync(src)) {
  console.error(`[sync-anvil] missing: ${src}`);
  console.error("[sync-anvil] build Anvil first (apps/anvil) so dist exists.");
  process.exit(1);
}

emptyDir(dest);
copyDir(src, dest);
console.log(`[sync-anvil] ${src} -> ${dest}`);
