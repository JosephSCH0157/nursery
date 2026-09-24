import test from "node:test";
import assert from "node:assert/strict";
import { extractReferenceSourceEvidence, inspectReferenceResearchLead, inspectReferenceSourceEvidence, isMoreDirectReferenceSource, parseStructuredCsv } from "../dist/reference-source-ingestion.js";

const htmlResponse=(html)=>new Response(html,{status:200,headers:{"content-type":"text/html"}});

test("extracts dated and numeric claims without inventing publication dates",async()=>{
  const claims=await extractReferenceSourceEvidence("https://example.org/history",async()=>htmlResponse(`<main><p>Florida citrus production expanded rapidly in 1894 after new rail connections arrived.</p><p>This undated overview contains no event.</p><p>Growers shipped 12 million boxes in 1920.</p></main>`));
  assert.deepEqual(claims.map(claim=>claim.evidenceDate),[null,null]);
  assert.deepEqual(claims.map(claim=>claim.provenance.historical_date_text),["1894","1920"]);
  assert.equal(claims[1].numericValue,12);
  assert.equal(claims[1].unit,"million");
  assert.equal(claims[0].provenance.extraction_contract,"forge.reference-source-evidence.v4");
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
  assert.equal(claims[0].provenance.extraction_contract,"forge.reference-source-evidence.v4");
});

test("numeric-stat mode rejects dates, report years, and an irrelevant seasonal gasoline fact",async()=>{
  const claims=await extractReferenceSourceEvidence("https://www.eia.gov/gasoline",async()=>htmlResponse(`<main>
    <p>Publication date September 6, 2024.</p>
    <p>See the 2025 Annual Report and the earlier 2008 edition.</p>
    <p>Retail gasoline prices in August were about 40 cents per gallon higher than in January.</p>
  </main>`),{intent:"numeric_stat",editorialFocus:"The cost of crude oil is usually the largest component of the retail price of gasoline.",desiredMaterial:"An EIA-backed gasoline price component graphic."});
  assert.deepEqual(claims,[]);
});

test("numeric-stat mode accepts a relevant value with measure, exact excerpt, and relevance evidence",async()=>{
  const claims=await extractReferenceSourceEvidence("https://www.eia.gov/gasoline",async()=>htmlResponse(`<main><p>Crude oil accounted for 52 percent of the retail gasoline price in 2024.</p></main>`),{intent:"numeric_stat",editorialFocus:"The cost of crude oil is usually the largest component of the retail price of gasoline.",desiredMaterial:"An EIA-backed gasoline price component graphic."});
  assert.equal(claims.length,1);
  assert.equal(claims[0].numericValue,52);
  assert.equal(claims[0].unit,"percent");
  assert.equal(claims[0].editorialRelevance.supports,true);
  assert.equal(claims[0].evidenceIntent,"numeric_stat");
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

test("bounded CSV parsing preserves headers and rejects malformed or excessive input",()=>{
 assert.deepEqual(parseStructuredCsv('Category,"Percent share"\n"Crude oil",51.7'),{headers:["Category","Percent share"],rows:[["Crude oil","51.7"]],headerRow:1});
 assert.deepEqual(parseStructuredCsv('Chart title,,\nData source,,\n,regular gasoline,crude oil\nJan-2025,3.10,0.74'),{headers:["","regular gasoline","crude oil"],rows:[["Jan-2025","3.10","0.74"]],headerRow:3});
 assert.throws(()=>parseStructuredCsv('Category,Category\nA,1'),/ambiguous_headers/);
 assert.throws(()=>parseStructuredCsv('Category,Value\n"unterminated,1'),/csv_malformed/);
 assert.throws(()=>parseStructuredCsv(`A\n${Array.from({length:5001},(_,index)=>index).join("\n")}`),/rows_exceeded/);
});

test("price-fluctuations fixture inspects three CSV datasets but rejects unrelated numbers",async()=>{
 const ids=["average-monthly-prices","regular-grade-gasoline-demand-retail-price","us-gasoline-stocks"],html=`<base href="/energyexplained/"><p>Gasoline prices generally follow crude oil prices.</p>${ids.map(id=>`<div class="article-chart" id="${id}"></div>`).join("")}<script src="includes/bundles/main.js"></script>`,script=ids.map(id=>`const elementId = '${id}'; Highcharts.chart(elementId,{data:{csvURL: appPath + '/gasoline/charts/' + elementId + '.csv'}});`).join("\n"),csv="Month,Gasoline price dollars,Crude oil price dollars\nJanuary 2025,3.10,70.00\nAugust 2025,3.50,75.00";
 const fetchImpl=async value=>{const url=String(value);return new Response(url.endsWith("main.js")?script:url.endsWith(".csv")?csv:html,{status:200,headers:{"content-type":url.endsWith("main.js")?"application/javascript":url.endsWith(".csv")?"text/csv":"text/html"}})};
 const inspection=await inspectReferenceSourceEvidence("https://www.eia.gov/energyexplained/gasoline/price-fluctuations.php",fetchImpl,{intent:"numeric_stat",editorialFocus:"The cost of crude oil is usually the largest component of the retail price of gasoline.",desiredMaterial:"An EIA-backed gasoline price component graphic."});
 assert.equal(inspection.structuredData.discovered,3);assert.equal(inspection.structuredData.inspected,3);assert.equal(inspection.state,"structured_data_available");assert.deepEqual(inspection.claims,[]);assert.match(inspection.message,/inspected it, but it does not support/);assert.equal(inspection.claims.some(item=>item.numericValue===40&&item.unit.includes("cents")),false);
});

test("inline SVG exposes explicit labeled component percentages without vision or geometry inference",async()=>{
 const html=`<main><p>Crude oil is the largest component of retail gasoline prices.</p><div class="article-chart"><svg id="gasoline-components"><text y="100"><tspan>refining costs and profits</tspan></text><text y="430"><tspan>crude oil</tspan></text><text><tspan y="100">15.0%</tspan><tspan y="430">51.7%</tspan></text><text style="display:none"><tspan y="430">99.9%</tspan></text></svg></div></main>`;
 const inspection=await inspectReferenceSourceEvidence("https://www.eia.gov/energyexplained/gasoline/factors-affecting-gasoline-prices.php",async()=>htmlResponse(html),{intent:"numeric_stat",editorialFocus:"The cost of crude oil is usually the largest component of the retail price of gasoline.",desiredMaterial:"An EIA-backed gasoline price component graphic."});
 assert.equal(inspection.state,"numeric_evidence_found");assert.equal(inspection.claims.length,1);assert.equal(inspection.claims[0].numericValue,51.7);assert.equal(inspection.claims[0].unit,"percent");assert.equal(inspection.claims[0].documentLocator.kind,"svg_text");assert.equal(inspection.claims[0].provenance.extraction_method,"inline_svg_text");assert.equal(inspection.claims.some(item=>item.numericValue===99.9),false);
});

test("relevant structured CSV produces an exact provenance-bound proposal",async()=>{
 const html=`<a href="/component-share.csv">Download chart data</a>`,csv=`Category,Percent share,Year\nCrude oil,51.7,2025\nRefining,15.0,2025`;
 const inspection=await inspectReferenceSourceEvidence("https://example.com/report",async value=>new Response(String(value).endsWith(".csv")?csv:html,{status:200,headers:{"content-type":String(value).endsWith(".csv")?"text/csv":"text/html"}}),{intent:"numeric_stat",editorialFocus:"Crude oil is the largest component of retail gasoline price.",desiredMaterial:"Gasoline component-share chart"});
 assert.equal(inspection.claims.length,1);assert.equal(inspection.claims[0].numericValue,51.7);assert.equal(inspection.claims[0].documentLocator.kind,"csv_cell");assert.equal(inspection.claims[0].provenance.data_url,"https://example.com/component-share.csv");assert.match(inspection.claims[0].provenance.data_content_hash,/^[0-9a-f]{64}$/);
});

test("exact claim support outranks generic hostname and path similarity without automatic replacement",()=>{
 const base={claims:[],state:"textual_support_only",pageText:{supportingDiscussion:true,qualifyingNumericEvidence:0},structuredData:{discovered:3,inspected:3,directlySupporting:0,titles:[]},graphics:{discovered:3,machineReadable:3,requiresInterpretation:0,titles:[]},message:"text only",nextActions:[],structuredDataCandidates:[],graphicCandidates:[],relevanceScore:8},exact={...base,claims:[{numericValue:51.7}],state:"numeric_evidence_found",relevanceScore:108};
 assert.equal(isMoreDirectReferenceSource(base.relevanceScore,exact),true);assert.equal(isMoreDirectReferenceSource(exact.relevanceScore,base),false);
});

test("no-result taxonomy distinguishes text support, unparsed graphics, and true no-data",async()=>{
 const options={intent:"numeric_stat",editorialFocus:"Crude oil is the largest component of retail gasoline price.",desiredMaterial:"Gasoline component-share chart"},inspect=html=>inspectReferenceSourceEvidence("https://example.com/report",async()=>htmlResponse(html),options);
 assert.equal((await inspect("<p>Crude oil is the largest component of retail gasoline prices, but this page gives no percentage.</p>")).state,"textual_support_only");
 assert.equal((await inspect('<div class="article-chart" id="component-chart"></div>')).state,"graphic_requires_interpretation");
 assert.equal((await inspect("<p>This page discusses refinery maintenance schedules.</p>")).state,"no_relevant_numeric_evidence");
});
