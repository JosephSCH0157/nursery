import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../src/", import.meta.url);
const imageActions = readFileSync(new URL("hooks/visuals/useImageMapCandidateActions.ts", root), "utf8");
const imageRepo = readFileSync(new URL("lib/hearth-image-map-repo.ts", root), "utf8");
const thumbnailActions = readFileSync(new URL("hooks/visuals/useThumbnailGenerationActions.ts", root), "utf8");
const thumbnailApi = readFileSync(new URL("lib/hearth-thumbnail-api.ts", root), "utf8");
const referenceVisualPanel = readFileSync(new URL("components/visuals/CanonicalReferenceVisualPanel.tsx", root), "utf8");
const spendingConfirmation = readFileSync(
  new URL("../../../packages/tongs/src/customer-spending-confirmation.ts", import.meta.url),
  "utf8",
);
const workpieceApi = readFileSync(
  new URL("../../../packages/tongs/src/workpiece-commit-api.ts", import.meta.url),
  "utf8",
);

test("Episode Images quotes first and forwards the exact accepted quote identity", () => {
  const quoteAt = imageActions.indexOf("requestCandidateGeneration(expectedMetadataUpdatedAt)");
  const acceptanceAt = imageActions.indexOf("requestCustomerSpendingAcceptance(quote.billingQuote)", quoteAt);
  const executionAt = imageActions.indexOf("requestCandidateGeneration(expectedMetadataUpdatedAt, acceptance)", acceptanceAt);
  assert.ok(quoteAt >= 0 && acceptanceAt > quoteAt && executionAt > acceptanceAt);
  assert.match(imageActions, /confirmSpend: Boolean\(spendingAcceptance\)/);
  assert.match(imageActions, /spendingAcceptance,/);
  assert.match(imageActions, /if \(quote\.ok \|\| !quote\.requiresConfirmation\)[\s\S]*unexpectedly generated media before approval/);
  assert.match(imageActions, /if \(!quote\.billingQuote\)[\s\S]*spending quote could not be verified/);
  assert.match(imageRepo, /\.\.\.\(args\.spendingAcceptance \? \{ spending_acceptance: args\.spendingAcceptance \} : \{\}\)/);
  assert.match(spendingConfirmation, /quote_id: quote\.quote_id,[\s\S]*operation_id: quote\.operation_id,[\s\S]*quote_hash: quote\.quote_hash,[\s\S]*request_fingerprint: quote\.request_fingerprint/);
  assert.doesNotMatch(imageActions, /requestCandidateGeneration\(expectedMetadataUpdatedAt,\s*(?:true|false|confirmed)\)/);
  assert.match(workpieceApi, /body\.spending_acceptance != null && !spendingAcceptance[\s\S]*invalid_spending_acceptance/);
  assert.match(workpieceApi, /acceptance: input\.spending_acceptance \?\? null/);
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
