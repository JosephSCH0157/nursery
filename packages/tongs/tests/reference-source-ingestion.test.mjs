import assert from "node:assert/strict";
import test from "node:test";
import { ingestReferenceSourceUrl } from "../dist/reference-source-ingestion.js";

test("URL ingestion extracts metadata, provenance, publication date, and license findings",async()=>{
 const html=`<html><head><title>Fallback</title><meta property="og:title" content="Florida Citrus Report"><meta name="author" content="A. Researcher"><meta property="og:site_name" content="Florida Agriculture Authority"><meta property="article:published_time" content="2025-03-04"><link rel="canonical" href="https://example.com/report"><link rel="license" href="https://creativecommons.org/licenses/by/4.0/"></head></html>`;
 const result=await ingestReferenceSourceUrl("https://example.com/input",async()=>new Response(html,{status:200,headers:{"content-type":"text/html; charset=utf-8"}}));
 assert.equal(result.title,"Florida Citrus Report");assert.equal(result.publisher,"Florida Agriculture Authority");assert.equal(result.publishedAt,"2025-03-04T00:00:00.000Z");assert.equal(result.publicationDateStatus,"verified");assert.equal(result.license.status,"verified");assert.equal(result.canonicalUrl,"https://example.com/report");assert.match(result.provenance.content_hash,/^[0-9a-f]{64}$/);
});

test("missing publication and licensing metadata remain honestly unknown",async()=>{
 const result=await ingestReferenceSourceUrl("https://example.com/undated",async()=>new Response("<title>Undated report</title>",{status:200,headers:{"content-type":"text/html"}}));
 assert.equal(result.publishedAt,null);assert.equal(result.publicationDateStatus,"not_provided");assert.equal(result.license.status,"not_found");
});

test("PDF ingestion derives a usable title from response filename or document URL",async()=>{
 const fromHeader=await ingestReferenceSourceUrl("https://example.com/DocumentCenter/View/1/download",async()=>new Response(new Uint8Array([37,80,68,70]),{status:200,headers:{"content-type":"application/pdf","content-disposition":"attachment; filename=June-TDT-Collections.pdf"}}));
 assert.equal(fromHeader.title,"June TDT Collections");
 assert.ok(fromHeader.provenance.metadata_sources.includes("response_header:filename"));
 const fromUrl=await ingestReferenceSourceUrl("https://www.occompt.com/DocumentCenter/View/60536/2026-06-June-TDT-Collection-PDF",async()=>new Response(new Uint8Array([37,80,68,70]),{status:200,headers:{"content-type":"application/pdf"}}));
 assert.equal(fromUrl.title,"2026 06 June TDT Collection");
 assert.equal(fromUrl.publisher,"occompt.com");
 assert.ok(fromUrl.provenance.metadata_sources.includes("url_path:document_name"));
});

test("authoritative PDFs may exceed the conservative HTML intake limit",async()=>{
 const report=new Uint8Array(9*1024*1024);report.set([37,80,68,70]);
 const result=await ingestReferenceSourceUrl("https://metroplanorlando.org/regional-transit-needs.pdf",async()=>new Response(report,{status:200,headers:{"content-type":"application/pdf","content-length":String(report.length)}}));
 assert.equal(result.contentType,"application/pdf");
 await assert.rejects(()=>ingestReferenceSourceUrl("https://example.com/oversized-page",async()=>new Response(report,{status:200,headers:{"content-type":"text/html","content-length":String(report.length)}})),/reference_source_too_large/);
});

test("URL ingestion exposes unique provenance-bound archival image candidates and ignores page chrome",async()=>{
 const html=`<main><img src="/photos/freeze-1895.jpg" alt="Frozen citrus grove"><img data-src="https://archive.example.net/freeze.jpg" alt="Packing house after the freeze"><img src="/photos/freeze-1895.jpg"><img src="/assets/site-logo.png"><img src="data:image/png;base64,abc"></main>`;
 const result=await ingestReferenceSourceUrl("https://example.com/freeze",async()=>new Response(html,{status:200,headers:{"content-type":"text/html"}}));
 assert.deepEqual(result.imageCandidates,[
  {url:"https://example.com/photos/freeze-1895.jpg",alt:"Frozen citrus grove",ordinal:1,sourcePageUrl:"https://example.com/freeze"},
  {url:"https://archive.example.net/freeze.jpg",alt:"Packing house after the freeze",ordinal:2,sourcePageUrl:"https://example.com/freeze"},
 ]);
 assert.ok(result.provenance.metadata_sources.includes("document_content:images"));
});

test("URL ingestion denies local and credential-bearing URLs",async()=>{
 await assert.rejects(()=>ingestReferenceSourceUrl("http://127.0.0.1/private"),/external_url_scheme_unsupported/);
 await assert.rejects(()=>ingestReferenceSourceUrl("https://user:pass@example.com/private"),/external_url_credentials_unsupported/);
});

test("Highcharts containers discover bounded first-party CSV candidates without executing scripts",async()=>{
 const html=`<base href="/energyexplained/"><main>
  <h3>Gasoline and crude-oil prices</h3><div class="article-chart" id="average-monthly-prices"></div>
  <h3>Gasoline demand and retail price</h3><div class="article-chart" id="regular-grade-gasoline-demand-retail-price"></div>
  <h3>Gasoline inventories</h3><div class="article-chart" id="us-gasoline-stocks"></div>
  <script src="/global/analytics.js"></script><script src="includes/bundles/main.js"></script>
 </main>`;
 const script=["average-monthly-prices","regular-grade-gasoline-demand-retail-price","us-gasoline-stocks"].map(id=>`const elementId = '${id}'; Highcharts.chart(elementId,{data:{csvURL: appPath + '/gasoline/charts/' + elementId + '.csv'}});`).join("\n"),csv="Date,Price dollars\n2025,3.10";
 const fetchImpl=async value=>{const url=String(value);return new Response(url.endsWith("main.js")?script:url.endsWith(".csv")?csv:html,{status:200,headers:{"content-type":url.endsWith(".js")?"application/javascript":url.endsWith(".csv")?"text/csv":"text/html"}})};
 const first=await ingestReferenceSourceUrl("https://www.eia.gov/energyexplained/gasoline/price-fluctuations.php",fetchImpl),second=await ingestReferenceSourceUrl("https://www.eia.gov/energyexplained/gasoline/price-fluctuations.php",fetchImpl);
 assert.deepEqual(first.structuredDataCandidates.map(item=>item.dataUrl),[
  "https://www.eia.gov/energyexplained/gasoline/charts/average-monthly-prices.csv",
  "https://www.eia.gov/energyexplained/gasoline/charts/regular-grade-gasoline-demand-retail-price.csv",
  "https://www.eia.gov/energyexplained/gasoline/charts/us-gasoline-stocks.csv",
 ]);
 assert.deepEqual(first.structuredDataCandidates.map(item=>item.candidateId),second.structuredDataCandidates.map(item=>item.candidateId));
 assert.equal(first.graphicCandidates.length,3);assert.ok(first.graphicCandidates.every(item=>item.extractionCapability==="structured_data"));
});

test("structured links are HTTPS first-party and duplicate URLs are deduplicated",async()=>{
 const html=`<a href="https://example.com/data.csv">CSV</a><a href="https://example.com/data.csv">duplicate</a><a href="http://example.com/unsafe.csv">unsafe</a><a href="https://other.example/data.csv">third party</a>`;
 const result=await ingestReferenceSourceUrl("https://example.com/report",async value=>new Response(String(value).endsWith(".csv")?"Label,Percent share\nCrude oil,52":html,{status:200,headers:{"content-type":String(value).endsWith(".csv")?"text/csv":"text/html"}}));
 assert.equal(result.structuredDataCandidates.length,1);assert.equal(result.structuredDataCandidates[0].dataUrl,"https://example.com/data.csv");
});
