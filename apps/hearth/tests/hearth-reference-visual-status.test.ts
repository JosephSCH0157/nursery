import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  projectReferenceVisualFailure,
  projectReferenceVisualSuccess,
} from "../src/lib/hearth-reference-visual-status";

const panelSource = readFileSync(
  new URL(
    "../src/components/visuals/CanonicalReferenceVisualPanel.tsx",
    import.meta.url,
  ),
  "utf8",
);
const visualStyles = readFileSync(
  new URL("../src/views/surfaces/VisualsSurface.css", import.meta.url),
  "utf8",
);

test("Source transition receipts explain what changed and what stayed safe", () => {
  const support = projectReferenceVisualSuccess("Adding supporting Source");
  assert.equal(support.tone, "success");
  assert.match(support.message, /Current Source stays in place/);
  assert.match(support.preservation ?? "", /remain saved/);

  const promotion = projectReferenceVisualSuccess("Changing Current Source");
  assert.match(promotion.message, /Earlier Sources remain attached as support/);
  assert.match(promotion.preservation ?? "", /exact Source binding/);
});

test("evidence reset receipts distinguish active work from immutable history", () => {
  const notice = projectReferenceVisualSuccess("Clearing evidence");
  assert.equal(notice.title, "Evidence cleared");
  assert.match(notice.message, /left the active workflow/);
  assert.match(notice.preservation ?? "", /immutable history remain saved/);
});

test("customer-correctable validation stays visible without masquerading as a technical failure", () => {
  const notice = projectReferenceVisualFailure(
    "Numeric evidence also requires a value and unit.",
  );
  assert.equal(notice.tone, "warning");
  assert.equal(notice.title, "Check the evidence details");
  assert.equal(notice.technicalDetail, undefined);
});

test("an unsupported AI summary is a decision warning, not a system error", () => {
  const notice = projectReferenceVisualFailure(
    "I couldn’t locate independent support for the claims in this AI summary.",
  );
  assert.equal(notice.tone, "warning");
  assert.equal(notice.title, "Independent support is still needed");
  assert.equal(notice.technicalDetail, undefined);
});

test("unexpected failures keep raw detail behind technical disclosure", () => {
  const notice = projectReferenceVisualFailure(
    "duplicate key value violates unique constraint internal_name_key",
  );
  assert.equal(notice.tone, "error");
  assert.equal(notice.title, "That change wasn’t saved");
  assert.match(notice.message, /existing Reference Visual work is unchanged/);
  assert.match(notice.technicalDetail ?? "", /duplicate key/);
  assert.doesNotMatch(notice.message, /duplicate key/);
});

test("stale authority becomes a recoverable warning", () => {
  const notice = projectReferenceVisualFailure(
    "The Source set changed since this request started.",
  );
  assert.equal(notice.tone, "warning");
  assert.match(notice.message, /Reload the current visual state/);
  assert.match(notice.technicalDetail ?? "", /Source set changed/);
});

test("the customer surface separates status, technical detail, notes, and history", () => {
  assert.match(panelSource, /ReferenceVisualCustomerNotice/);
  assert.match(panelSource, /<summary>Technical detail<\/summary>/);
  assert.match(panelSource, /Evidence notes \(\{evidenceIssues\.length\}\)/);
  assert.doesNotMatch(
    panelSource,
    /evidenceIssues\.map\(issue=><p role="alert"/,
  );
  assert.match(panelSource, /Historical candidates/);
  assert.match(panelSource, /cannot be selected/);
  assert.match(panelSource, /Design needs to be prepared again/);
  assert.match(visualStyles, /hs-reference-visual-notice\.is-success/);
  assert.match(visualStyles, /hs-reference-visual-notice\.is-warning/);
  assert.match(visualStyles, /hs-reference-visual-notice\.is-error/);
  assert.match(visualStyles, /hs-reference-visual-history/);
});
