import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./verify-he3c-synthetic-history-lifecycle.mts", import.meta.url), "utf8");
assert.match(source, /assertLoopback/);
assert.match(source, /wtvdjndyxegudufrompx/);
assert.match(source, /encoding=base64/);
assert.match(source, /signInWithPassword/);
assert.match(source, /anonymous: "denied"/);
assert.match(source, /cross_workspace: "denied"/);
assert.match(source, /x-forge-user-authorization/);
assert.match(source, /forbidden identity\/host in request/);
assert.match(source, /non-loopback request refused/);
assert.match(source, /byte_exact_artifacts: seeded\.size/);
assert.match(source, /startAndHydrateHammerHistoryEpoch/);
assert.match(source, /reopenedController\.undo\(\)/);
assert.match(source, /reopenedController\.redo\(\)/);
assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie/);
console.log("HE-3C synthetic authenticated fixture contract passed.");
