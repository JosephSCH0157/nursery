import test from "node:test";
import assert from "node:assert/strict";
import { extractReferenceSourceEvidence, inspectReferenceResearchLead } from "../dist/reference-source-ingestion.js";

const htmlResponse=(html)=>new Response(html,{status:200,headers:{"content-type":"text/html"}});

test("extracts dated and numeric claims without inventing publication dates",async()=>{
  const claims=await extractReferenceSourceEvidence("https://example.org/history",async()=>htmlResponse(`<main><p>Florida citrus production expanded rapidly in 1894 after new rail connections arrived.</p><p>This undated overview contains no event.</p><p>Growers shipped 12 million boxes in 1920.</p></main>`));
  assert.deepEqual(claims.map(claim=>claim.evidenceDate),[null,null]);
  assert.deepEqual(claims.map(claim=>claim.provenance.historical_date_text),["1894","1920"]);
  assert.equal(claims[1].numericValue,12);
  assert.equal(claims[1].unit,"million");
  assert.equal(claims[0].provenance.extraction_contract,"forge.reference-source-evidence.v3");
});

function textPdf(lines){
  const escaped=lines.map(line=>line.replace(/([\\()])/g,"\\$1"));
  const stream=`BT /F1 12 Tf 72 720 Td ${escaped.map((line,index)=>`${index?"0 -18 Td ":""}(${line}) Tj`).join(" ")} ET`;
  const objects=[
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body="%PDF-1.4\n",offsets=[0];
  objects.forEach((object,index)=>{offsets.push(Buffer.byteLength(body));body+=`${index+1} 0 obj\n${object}\nendobj\n`;});
  const xref=Buffer.byteLength(body);body+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(offset=>`${String(offset).padStart(10,"0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(body);
}

test("extracts dated currency claims from a canonical PDF report",async()=>{
  const bytes=textPdf(["June 2026 Tourist Development Tax Collections","Total collections $12,345,678.90 compared with June 2025"]);
  const claims=await extractReferenceSourceEvidence("https://example.org/June-TDT-Collection.pdf",async()=>new Response(bytes,{status:200,headers:{"content-type":"application/pdf"}}));
  assert.ok(claims.length>=1);
  assert.ok(claims.some(claim=>claim.numericValue===12345678.9&&claim.unit==="dollars"));
  assert.ok(claims.every(claim=>claim.documentLocator.kind==="pdf_text"));
  assert.equal(claims[0].provenance.extraction_contract,"forge.reference-source-evidence.v3");
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
