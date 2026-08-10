import assert from "node:assert/strict";
import test from "node:test";
import {
  addReferenceClipSelectionId,
  removeReferenceClipSelectionId,
  validateReferenceClipSelectionReceipt,
} from "../src/lib/hearth-reference-clip-authority";

const committed=(ids:string[],revision=2)=>({
  disposition:"committed",
  selected_candidate_revision_ids:ids,
  selection_set_revision:{revision},
});

test("addition preserves canonical order and rejects a duplicate",()=>{
 assert.deepEqual(addReferenceClipSelectionId(["one"],"two"),["one","two"]);
 assert.deepEqual(addReferenceClipSelectionId(["one","two"],"three"),["one","two","three"]);
 assert.equal(addReferenceClipSelectionId(["one","two"],"two"),null);
});

test("removal preserves remaining order and permits the empty set",()=>{
 assert.deepEqual(removeReferenceClipSelectionId(["one","two","three"],"two"),["one","three"]);
 assert.deepEqual(removeReferenceClipSelectionId(["one"],"one"),[]);
});

test("collection receipts require an exact ordered collection",()=>{
 assert.deepEqual(validateReferenceClipSelectionReceipt(committed(["one","two"]),["one","two"],1),{ok:true,data:{revision:2}});
 assert.equal(validateReferenceClipSelectionReceipt(committed(["two","one"]),["one","two"],1).ok,false);
 assert.equal(validateReferenceClipSelectionReceipt(committed(["one"]),["one","two"],1).ok,false);
 assert.equal(validateReferenceClipSelectionReceipt(committed([],3),[],2).ok,true);
});

test("HTTP-200 conflict and malformed or stale receipts are errors",()=>{
 assert.deepEqual(validateReferenceClipSelectionReceipt({disposition:"selection_revision_conflict"},["one"],1),{ok:false,status:409,code:"selection_revision_conflict",error:"Reference Clip selection was not committed."});
 assert.equal(validateReferenceClipSelectionReceipt({disposition:"committed",selected_candidate_revision_ids:"one",selection_set_revision:{revision:2}},["one"],1).ok,false);
 assert.equal(validateReferenceClipSelectionReceipt(committed(["one"],1),["one"],1).ok,false);
});

test("a replayed committed receipt validates the same complete collection",()=>{
 const receipt=committed(["one","two","three"],4);
 assert.deepEqual(validateReferenceClipSelectionReceipt(receipt,["one","two","three"],3),{ok:true,data:{revision:4}});
 assert.deepEqual(validateReferenceClipSelectionReceipt(receipt,["one","two","three"],3),{ok:true,data:{revision:4}});
});
