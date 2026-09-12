import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveHearthAiActionAvailability } from "../src/lib/hearth-ai-admission";

const chatSurfaceSource = readFileSync(
  new URL("../src/views/surfaces/ChatSurface.tsx", import.meta.url),
  "utf8",
);

test("an authoritative admission failure hides artifact actions and blocks another AI submission", () => {
  const availability = resolveHearthAiActionAvailability("admission_failure");
  assert.equal(availability.showArtifactActions, false);
  assert.equal(availability.allowAiSubmission, false);
});

test("provider and model-output failures do not masquerade as account admission failures", () => {
  assert.deepEqual(resolveHearthAiActionAvailability("provider_failure"), {
    showArtifactActions: true,
    allowAiSubmission: true,
  });
  assert.deepEqual(resolveHearthAiActionAvailability(null), {
    showArtifactActions: true,
    allowAiSubmission: true,
  });
});

test("ChatSurface does not leave generation controls or submission enabled after admission failure", () => {
  assert.match(chatSurfaceSource, /!props\.aiAdmissionBlocked \? <div className="hs-ai-format-row"/);
  assert.match(chatSurfaceSource, /!props\.aiAdmissionBlocked \? <div className="hs-ai-shortcut-row"/);
  assert.match(chatSurfaceSource, /props\.aiAdmissionBlocked \|\| !props\.aiEpisodeReady/);
});
