import test from "node:test";
import assert from "node:assert/strict";
import { extractReferenceSourceEvidence, inspectReferenceResearchLead } from "../dist/reference-source-ingestion.js";

const htmlResponse=(html,url="https://example.org/history")=>new Response(html,{status:200,headers:{"content-type":"text/html"}});

test("extracts dated and numeric claims without inventing publication dates",async()=>{
  const claims=await extractReferenceSourceEvidence("https://example.org/history",async()=>htmlResponse(`<main><p>Florida citrus production expanded rapidly in 1894 after new rail connections arrived.</p><p>This undated overview contains no event.</p><p>Growers shipped 12 million boxes in 1920.</p></main>`));
  assert.deepEqual(claims.map(claim=>claim.evidenceDate),[null,null]);
  assert.deepEqual(claims.map(claim=>claim.provenance.historical_date_text),["1894","1920"]);
  assert.equal(claims[1].numericValue,12);
  assert.equal(claims[1].unit,"million");
  assert.equal(claims[0].provenance.extraction_contract,"forge.reference-source-evidence.v2");
});

test("AI Mode shares are research leads and expose only external citations",async()=>{
  const lead=await inspectReferenceResearchLead("https://share.google/aimode/example",async()=>htmlResponse(`<a href="https://www.google.com/search?q=citrus">Search</a><a href="https://www.fdacs.gov/history">Florida Agriculture</a><a href="https://www.fdacs.gov/history">duplicate</a>`));
  assert.equal(lead.classification,"derivative_ai_research_lead");
  assert.deepEqual(lead.citationUrls,["https://www.fdacs.gov/history"]);
});

test("inaccessible AI Mode shares remain labeled research leads",async()=>{
  const lead=await inspectReferenceResearchLead("https://share.google/aimode/example",async()=>{throw new Error("blocked")});
  assert.equal(lead.accessStatus,"inaccessible");
  assert.deepEqual(lead.citationUrls,[]);
});
