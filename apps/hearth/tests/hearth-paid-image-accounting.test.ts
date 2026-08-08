import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../src/", import.meta.url);
const imageActions = readFileSync(new URL("hooks/visuals/useImageMapCandidateActions.ts", root), "utf8");
const imageRepo = readFileSync(new URL("lib/hearth-image-map-repo.ts", root), "utf8");
const thumbnailActions = readFileSync(new URL("hooks/visuals/useThumbnailGenerationActions.ts", root), "utf8");
const thumbnailApi = readFileSync(new URL("lib/hearth-thumbnail-api.ts", root), "utf8");
const referenceVisualPanel = readFileSync(new URL("components/visuals/CanonicalReferenceVisualPanel.tsx", root), "utf8");

test("Episode Images obtains the canonical ceiling before creator approval and replays one operation identity", () => {
  assert.match(imageActions, /requestCandidateGeneration\(expectedMetadataUpdatedAt, false\)/);
  assert.match(imageActions, /requiresConfirmation/);
  assert.match(imageActions, /authorizedCustomerCeiling/);
  assert.match(imageActions, /window\.confirm\(quote\.authorizationMessage/);
  assert.match(imageActions, /requestCandidateGeneration\(expectedMetadataUpdatedAt, confirmed\)/);
  assert.match(imageRepo, /details\?\.requires_confirmation === true/);
  assert.match(imageRepo, /details\?\.authorized_customer_ceiling/);
  assert.doesNotMatch(imageActions, /estimated token|prompt\.length\s*\/\s*4/i);
});

test("thumbnail paid generation quotes and approves the same stable operation", () => {
  assert.match(thumbnailActions, /const operationId = crypto\.randomUUID\(\);/);
  assert.match(thumbnailActions, /operationId,/);
  assert.match(thumbnailActions, /confirmSpend: false/);
  assert.match(thumbnailActions, /window\.confirm\(quote\.authorizationMessage/);
  assert.match(thumbnailActions, /confirmSpend: confirmed/);
  assert.match(thumbnailApi, /operation_id: args\.operationId/);
  assert.match(thumbnailApi, /authorized_customer_ceiling/);
});

test("deterministic Reference Visual rendering stays outside paid-image authorization", () => {
  assert.doesNotMatch(referenceVisualPanel, /paid_image_authorization|confirmSpend|authorizedCustomerCeiling|Generate 2 images/);
});
