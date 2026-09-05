import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const route=await readFile(new URL("../../nursery/src/routes/Quench.tsx",import.meta.url),"utf8");
const adapter=await readFile(new URL("../src/adapters/adapter.contract.ts",import.meta.url),"utf8");

test("mutable option effects cannot invoke publication",()=>{
  const effects=[...route.matchAll(/useEffect\(\(\) => \{[\s\S]*?\n  \}, \[[^\]]*\]\);/g)].map((match)=>match[0]).join("\n");
  assert.doesNotMatch(effects,/adapter\.publish\(/);
  assert.match(route,/async function establishAndRunPublicationStub/);
  assert.match(route,/finalize-destination-package[\s\S]+establish-publication[\s\S]+claim-publication-attempt[\s\S]+enqueue-youtube-publication/);
  assert.doesNotMatch(route.slice(route.indexOf("async function establishAndRunPublicationStub"),route.indexOf("async function selectRumbleThumbnail")),/adapter\.publish|complete-publication-stub/);
});

test("adapters require durable operation and attempt context",()=>{
  assert.match(adapter,/interface PublicationExecutionContext extends PublishContext/);
  for(const field of ["publication_operation_id","publication_attempt_id","manifest_snapshot_id","release_decision_id","executable_destination_id","destination_capability_revision_id"])assert.match(adapter,new RegExp(field));
  assert.match(adapter,/publish\([\s\S]+context: PublicationExecutionContext/);
  assert.match(adapter,/retry\([\s\S]+context: PublicationExecutionContext/);
});
