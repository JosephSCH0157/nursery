import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { formatMinuteSecondTimecode, parseMinuteSecondTimecode } from "../src/lib/hearth-timecode";

const panel = await readFile(new URL("../src/components/visuals/CanonicalReferenceClipPanel.tsx", import.meta.url), "utf8");
const authority = await readFile(new URL("../src/lib/hearth-reference-clip-authority.ts", import.meta.url), "utf8");

test("Reference Clip workflow offers a first-class YouTube external-reference path", () => {
  assert.match(panel, /YouTube reference/i);
  assert.match(panel, /YouTube URL/);
  assert.match(panel, /Start \(minutes:seconds\)/);
  assert.match(panel, /End \(minutes:seconds\)/);
  assert.match(panel, /placeholder="15:45"/);
  assert.match(panel, /attachYouTubeReferenceClip/);
  assert.match(panel, /Verify, attach, and use YouTube reference/);
  assert.match(panel, /completes the opportunity by saving the verified reference in its canonical selection set/);
  assert.match(panel, /c\.embedUrl/);
  assert.match(panel, /does not download or claim ownership/i);
});

test("verified YouTube references are selected canonically before the UI reports completion", () => {
  assert.match(authority, /candidateRevisionId=str\(candidateRevision\?\.id\)/);
  assert.match(authority, /opportunity\.selectedRevisionIds\.includes\(candidateRevisionId\)/);
  assert.match(authority, /selectedRevisionIds:\[\.\.\.opportunity\.selectedRevisionIds,candidateRevisionId\]/);
  assert.match(authority, /commitReferenceClipSelectionSet/);
  assert.match(panel, /verifyReferenceClipHammerReadback\(workpieceId,result\.data\)/);
});

test("minute:second input converts exactly to canonical milliseconds", () => {
  assert.equal(parseMinuteSecondTimecode("15:45"), 945_000);
  assert.equal(parseMinuteSecondTimecode("0:00"), 0);
  assert.equal(parseMinuteSecondTimecode("125:09"), 7_509_000);
  for (const invalid of ["15", "15:5", "15:60", "1:2:03", "-1:30", "hello"]) assert.equal(parseMinuteSecondTimecode(invalid), null);
  assert.equal(formatMinuteSecondTimecode(945_000), "15:45");
  assert.equal(formatMinuteSecondTimecode(7_509_999), "125:09");
});

test("YouTube selection retains canonical source, anchor, rights, provenance, and time range", () => {
  for (const field of [
    "opportunity_revision_id",
    "source_revision_id",
    "source_link_revision_id",
    "rights",
    "provenance",
    "external_media_id",
    "external_url",
    "start_ms",
    "end_ms",
  ]) assert.match(authority, new RegExp(field));
  assert.match(authority, /verifyReferenceClipHammerReadback/);
  assert.match(authority, /deliveryKind==="youtube_external_reference"/);
  assert.match(authority, /externalEvidence\.video_id/);
  assert.match(authority, /issues\.push\("external_reference"\)/);
});
