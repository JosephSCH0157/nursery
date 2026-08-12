import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const shell=readFileSync(new URL("../src/routes/HearthShell.tsx",import.meta.url),"utf8");

test("header and Release readiness consume the canonical media workflow",()=>{
 assert.match(shell,/canonicalMediaWorkflow = deriveHearthMediaWorkflow\(mediaWorkflowInput\)/);
 assert.match(shell,/mediaMapStatus: canonicalMediaPlanStatus/);
 assert.match(shell,/visualCount: mediaWorkflowInput\.visualPlan\.total/);
 assert.match(shell,/coverageLevel: canonicalMediaComplete \? "complete"/);
});

test("a ready canonical framing pack satisfies Release framing readiness",()=>{
 assert.match(shell,/metadataComplete: metadataComplete \|\| framingPackReady/);
});
