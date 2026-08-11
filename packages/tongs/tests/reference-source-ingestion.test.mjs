/* global Response */
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
