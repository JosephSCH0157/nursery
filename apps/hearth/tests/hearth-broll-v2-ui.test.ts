import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const panel = fs.readFileSync(path.join(root, "src/components/visuals/BrollPlanPanel.tsx"), "utf8");
const shellStyles = fs.readFileSync(path.join(root, "src/routes/HearthShell.css"), "utf8");
const visualsSurface = fs.readFileSync(path.join(root, "src/views/surfaces/VisualsSurface.tsx"), "utf8");
const visualsStyles = fs.readFileSync(path.join(root, "src/views/surfaces/VisualsSurface.css"), "utf8");

assert.match(panel, /What should this clip show/);
assert.match(panel, /View motion brief/);
assert.match(panel, /B-roll acquisition method/);
assert.match(panel, /hs-broll-final-prompt/);
assert.match(panel, /hs-broll-prompt-actions/);
assert.match(panel, /hs-broll-candidate-chips/);
assert.match(panel, /Use this clip/);
assert.match(panel, /Advanced details/);
assert.doesNotMatch(panel.match(/if \(props\.canonicalV2\) \{[\s\S]*?\n  \}\n\n  return/)?.[0] ?? "", /max-height: clamp/);

assert.match(shellStyles, /\.hs-broll-v2-layout \.hs-imap-list,[\s\S]*?max-height: none/);
assert.match(shellStyles, /\.hs-broll-v2 \.hs-imap-candidate-card[\s\S]*?max-width: 800px/);
assert.match(shellStyles, /\.hs-broll-final-prompt[\s\S]*?min-height: 13rem/);
assert.match(shellStyles, /\.hs-broll-v2-header[\s\S]*?background: #111827/);
assert.match(visualsSurface, /hs-media-completed-summaries\$\{displayedStage==="broll"\?" is-compact":""\}/);
assert.match(visualsStyles, /#hearth-broll-plan-panel \.hs-focus-panel-body-inner\{overflow:visible\}/);
assert.match(visualsStyles, /\.hs-media-completed-summaries\.is-compact/);

console.log("hearth b-roll v2 creator UI: passed");
