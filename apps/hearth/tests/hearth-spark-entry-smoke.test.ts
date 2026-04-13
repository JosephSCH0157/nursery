import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(process.cwd(), "src/routes/HearthShell.tsx"),
  "utf8",
);

assert.match(source, /preferredWorkspaceTab:\s*"script"/);
assert.match(source, /preferredEditorPanel:\s*"script"/);
assert.doesNotMatch(source, /pendingDraftEditorPanelRef\.current = "manual"/);
assert.match(
  source,
  /const mobileMainContent = incomingBarStockIntakeRoute && routeSparkId && !routeProjectId && !hasActiveEpisode\s*\n\s*\?\s*renderSparkRouteBootstrapView\(\)\s*\n\s*:\s*renderEpisodesView\(\);/s,
);

console.log("[ok] hearth-spark-entry-smoke");
