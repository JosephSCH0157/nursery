import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const authority = fs.readFileSync(path.join(root, "src/lib/hearth-broll-v2-authority.ts"), "utf8");
const hook = fs.readFileSync(path.join(root, "src/hooks/visuals/useCanonicalBrollV2.ts"), "utf8");
const panel = fs.readFileSync(path.join(root, "src/components/visuals/BrollPlanPanel.tsx"), "utf8");
const shell = fs.readFileSync(path.join(root, "src/routes/HearthShell.tsx"), "utf8");

assert.match(authority, /read_current_broll_plan/);
assert.match(authority, /commit_broll_plan/);
assert.match(authority, /select_broll_candidate/);
assert.match(authority, /broll-v2\/acquire/);
assert.match(authority, /p_expected_selection_revision: args\.current\.selectionRevision/);
assert.match(authority, /poster_asset_id/);
assert.match(authority, /signedAssetUrl/);
assert.match(authority, /broll_current_creative_input/);
assert.match(authority, /broll-v2\/prompt-interpret/);
assert.match(authority, /broll-v2\/prompt-edit/);
assert.match(authority, /readCanonicalBrollPromptStatus/);
assert.match(authority, /generateCanonicalBrollVideo/);
assert.match(authority, /provider_pending/);
assert.match(authority, /prompt_revision_id: args\.prompt\.revisionId/);
assert.match(authority, /prompt_content_hash: args\.prompt\.contentHash/);

assert.match(hook, /readCanonicalBrollV2/);
assert.match(hook, /commitCanonicalBrollPlan/);
assert.match(hook, /acquireCanonicalBroll/);
assert.match(hook, /selectCanonicalBrollCandidate/);
assert.match(hook, /canonical_anchor_assessment: exactAnchor/);
assert.match(hook, /generateCanonicalBrollPrompt/);
assert.match(hook, /editCanonicalBrollPrompt/);
assert.match(hook, /generateCanonicalBrollVideo/);
assert.match(hook, /setMessage\(null\)/);

assert.match(panel, /data-testid="broll-v2-panel"/);
assert.match(panel, />Generate Video</);
assert.match(panel, /props\.promptState\.status !== "current" && props\.promptState\.status !== "creator_edited"/);
assert.match(panel, /Fetch and verify external clip/);
assert.match(panel, /Legacy B-roll compatibility/);
assert.match(panel, /<video/);
assert.match(panel, /Generate motion prompt/);
assert.match(panel, /Canonical final motion prompt/);
assert.match(panel, /Save prompt as new revision/);
assert.match(panel, /Copy canonical prompt/);

assert.match(shell, /canonicalV2: true/);
assert.match(shell, /canonicalBrollV2\.upload/);
assert.match(shell, /canonicalBrollV2\.select/);
assert.match(shell, /canonicalBrollV2\.attachExternal/);
assert.match(shell, /canonicalBrollV2\.generatePrompt/);
assert.match(shell, /canonicalBrollV2\.editPrompt/);
assert.match(shell, /canonicalBrollV2\.generateVideo/);
assert.match(shell, /promptsByBeat\[selectedBrollBeat\.id\]\?\.finalPrompt/);
assert.match(shell, /navigator\.clipboard\.writeText\(canonicalPrompt\)/);
assert.doesNotMatch(shell.match(/const brollSurfaceInput = \{[\s\S]*?\n    \};/)?.[0] ?? "", /persistBrollPlan/);

console.log("hearth b-roll v2 integration: passed");
