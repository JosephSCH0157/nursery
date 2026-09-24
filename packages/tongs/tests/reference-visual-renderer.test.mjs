import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { renderCanonicalReferenceVisual } from "../dist/reference-visual-renderer.js";

const evidence = [{ id: "e1", numeric_value: 72, unit: "percent", label: "Production decline" }];
const recipe = { visual_subtype: "stat_card", title: "Florida citrus production", attribution_text: "Florida citrus report", accessibility_text: "Production declined 72 percent", recipe_json: { value: 72 } };

test("canonical Reference Visual rendering is deterministic and produces delivery PNG metadata", async () => {
  const first = await renderCanonicalReferenceVisual(recipe, evidence);
  const second = await renderCanonicalReferenceVisual(recipe, evidence);
  assert.equal(first.canonicalSvg, second.canonicalSvg);
  assert.deepEqual(first.pngBytes, second.pngBytes);
  assert.equal(first.rendererName, "forge_stat_card_v3");
  const metadata = await sharp(first.pngBytes).metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, 1920);
  assert.equal(metadata.height, 1080);
});

test("all V1 deterministic renderer contracts are available and maps remain unsupported", async () => {
  for (const visual_subtype of ["chart", "timeline", "document_excerpt", "quote_card", "stat_card", "comparison"]) {
    const supportedEvidence = visual_subtype === "timeline"
      ? [{ ...evidence[0], evidence_date: "2025-01-01" }, { id: "e2", numeric_value: 74, unit: "percent", label: "Later production decline", evidence_date: "2026-01-01" }]
      : visual_subtype === "comparison"
        ? [{ ...evidence[0], source_set_member_id: "source-a", source_title: "Source A" }, { id: "e2", numeric_value: 74, unit: "percent", label: "Later production decline", source_set_member_id: "source-b", source_title: "Source B" }]
        : visual_subtype === "document_excerpt" || visual_subtype === "quote_card"
          ? [{ ...evidence[0], raw_excerpt: "Production declined 72 percent." }]
        : evidence;
    const result = await renderCanonicalReferenceVisual({ ...recipe, visual_subtype }, supportedEvidence);
    assert.equal(result.rendererName, visual_subtype === "timeline" || visual_subtype === "quote_card" || visual_subtype === "document_excerpt" || visual_subtype === "comparison" || visual_subtype === "stat_card" ? `forge_${visual_subtype}_v3` : `forge_${visual_subtype}_v1`);
  }
});

test("comparison renders both canonical Source members as distinct readable columns", async () => {
  const result = await renderCanonicalReferenceVisual(
    { ...recipe, visual_subtype: "comparison", title: "Transit fares compared", renderer_contract_version: "forge.reference-visual-renderer.v2" },
    [
      { id: "lynx-base", source_set_member_id: "lynx", source_title: "LYNX fare schedule", label: "Regular fare", numeric_value: 2, unit: "USD" },
      { id: "lynx-day", source_set_member_id: "lynx", source_title: "LYNX fare schedule", label: "All-day pass", numeric_value: 4.5, unit: "USD" },
      { id: "scout-base", source_set_member_id: "scout", source_title: "Seminole County Scout fare schedule", label: "Regular fare", numeric_value: 4, unit: "USD" },
      { id: "scout-discount", source_set_member_id: "scout", source_title: "Seminole County Scout fare schedule", label: "Discount eligibility", raw_excerpt: "Reduced fare available for qualifying riders." },
    ],
  );
  assert.equal(result.rendererName, "forge_comparison_v3");
  assert.match(result.canonicalSvg, /data-comparison-source="lynx"/);
  assert.match(result.canonicalSvg, /data-comparison-source="scout"/);
  assert.match(result.canonicalSvg, /LYNX fare schedule/);
  assert.match(result.canonicalSvg, /Seminole County Scout fare/);
  assert.match(result.canonicalSvg, />schedule<\/text>/);
  for (const id of ["lynx-base", "lynx-day", "scout-base", "scout-discount"]) assert.match(result.canonicalSvg, new RegExp(`data-evidence-id="${id}"`));
});

test("facts-only stat cards preserve approximation and omit an empty public attribution", async () => {
  const result = await renderCanonicalReferenceVisual(
    { ...recipe, attribution_text: "", renderer_contract_version: "forge.reference-visual-renderer.v2" },
    [{ id: "e90", numeric_value: 90, unit: "percent", label: "Florida citrus production decline", raw_excerpt: "Production declined roughly 90% over two decades." }],
  );
  assert.match(result.canonicalSvg, />~90%<\/text>/);
  assert.doesNotMatch(result.canonicalSvg, /Source:/);
  assert.match(result.canonicalSvg, /Florida citrus production decline/);
  assert.equal(result.rendererName, "forge_stat_card_v3");
  assert.equal(result.rendererVersion, "3");
});

test("stat cards use the collection-aware renderer even for historical recipes", async () => {
  const result = await renderCanonicalReferenceVisual({ ...recipe, attribution_text: "" }, evidence);
  assert.equal(result.rendererName, "forge_stat_card_v3");
  assert.equal(result.rendererVersion, "3");
  assert.doesNotMatch(result.canonicalSvg, /Source:/);
  assert.match(result.canonicalSvg, /data-stat-item="0"/);
});

test("stat cards render every confirmed point from every canonical Source member", async () => {
  const points = [
    { id: "lynx-single", source_set_member_id: "lynx", source_title: "LYNX fares and passes", label: "Single ride", numeric_value: 2, unit: "dollars" },
    { id: "lynx-day", source_set_member_id: "lynx", source_title: "LYNX fares and passes", label: "All-day pass", numeric_value: 4.5, unit: "dollars" },
    { id: "scout-single", source_set_member_id: "scout", source_title: "Seminole County SCOUT fares", label: "Single zone", numeric_value: 4, unit: "dollars" },
    { id: "scout-cross", source_set_member_id: "scout", source_title: "Seminole County SCOUT fares", label: "Cross-zone trip", numeric_value: 6, unit: "dollars" },
  ];
  const result = await renderCanonicalReferenceVisual({ ...recipe, title: "Average fares", renderer_contract_version: "forge.reference-visual-renderer.v2" }, points);
  assert.equal(result.rendererName, "forge_stat_card_v3");
  assert.equal((result.canonicalSvg.match(/data-stat-item=/g) ?? []).length, points.length);
  for (const point of points) assert.match(result.canonicalSvg, new RegExp(`data-evidence-id="${point.id}"`));
  assert.match(result.canonicalSvg, /LYNX fares and passes/);
  assert.match(result.canonicalSvg, /Seminole County SCOUT fares/);
  assert.match(result.canonicalSvg, />2 dollars<\/text>/);
  assert.match(result.canonicalSvg, />6 dollars<\/text>/);
});

test("single-point stat cards separate source, value, and label vertically", async () => {
  const result = await renderCanonicalReferenceVisual(
    { ...recipe, title: "Average Fare", renderer_contract_version: "forge.reference-visual-renderer.v2" },
    [{ id: "scout-fare", source_set_member_id: "scout", source_title: "Service Area & Fares", label: "$4 — trips within a single zone", numeric_value: 4, unit: "dollars" }],
  );
  const sourceY = Number(result.canonicalSvg.match(/<text x="148" y="([\d.]+)"[^>]*>Service Area &amp; Fares<\/text>/)?.[1]);
  const valueY = Number(result.canonicalSvg.match(/<text x="148" y="([\d.]+)"[^>]*>4 dollars<\/text>/)?.[1]);
  const labelY = Number(result.canonicalSvg.match(/<text x="148" y="([\d.]+)"[^>]*>\$4 — trips within a single zone<\/text>/)?.[1]);
  assert.ok(sourceY > 0 && valueY - sourceY >= 90);
  assert.ok(labelY - valueY >= 120);
});

test("quote cards deduplicate repeated recipe text and responsively contain a long canonical quote", async () => {
  const quote = "The citrus industry generates an estimated $7 billion annually for Florida’s economy and supports tens of thousands of jobs statewide.";
  const result = await renderCanonicalReferenceVisual(
    { ...recipe, visual_subtype: "quote_card", title: quote, subtitle: quote, attribution_text: "News6 Orlando", renderer_contract_version: "forge.reference-visual-renderer.v2" },
    [{ id: "quote-evidence", raw_excerpt: quote, label: "Economic impact" }],
  );
  assert.equal(result.rendererName, "forge_quote_card_v3");
  assert.equal(result.rendererVersion, "3");
  assert.match(result.canonicalSvg, /data-quote-layout="responsive"/);
  assert.equal((result.canonicalSvg.match(/The citrus industry generates/g) ?? []).length, 1);
  assert.match(result.canonicalSvg, /Source: News6 Orlando/);
  const quoteLines = [...result.canonicalSvg.matchAll(/<text x="190" y="([\d.]+)" font-size="([\d.]+)"/g)];
  assert.ok(quoteLines.length >= 2);
  for (const [, y, size] of quoteLines) {
    assert.ok(Number(y) >= 220 && Number(y) + Number(size) <= 930);
  }
  const metadata = await sharp(result.pngBytes).metadata();
  assert.equal(metadata.width, 1920);
  assert.equal(metadata.height, 1080);
});

test("document excerpts deduplicate repeated agenda text and fit it inside a responsive document panel", async () => {
  const agenda = "Request Board approval to submit a grant application to the Florida Department of Transportation, District Five, for the SFY 2028 Public Transit Service Development Program, seeking up to $1,500,000 for enhancements to the Seminole County SCOUT micro-transit program; and approve and authorize the Chairman to execute all documents associated with the grant application.";
  const result = await renderCanonicalReferenceVisual(
    { ...recipe, visual_subtype: "document_excerpt", title: `2028: ${agenda}`, subtitle: agenda },
    [{ id: "agenda", raw_excerpt: agenda, label: `2028: ${agenda}` }],
  );
  assert.equal(result.rendererName, "forge_document_excerpt_v3");
  assert.match(result.canonicalSvg, /data-document-layout="responsive"/);
  assert.equal((result.canonicalSvg.match(/Request Board approval/g) ?? []).length, 1);
  assert.doesNotMatch(result.canonicalSvg, /font-size="66"/);
  const metadata = await sharp(result.pngBytes).metadata();
  assert.equal(metadata.width, 1920);
  assert.equal(metadata.height, 1080);
});

test("dense timelines remain chronological, associated, contained, and responsive without internal category labels", async () => {
  const denseEvidence = [
    { id: "event-2008", evidence_date: "2008-01-01", label: "Statewide monitoring expands after researchers confirm a sustained pattern across multiple growing regions.", category: "timeline" },
    { id: "event-1998", evidence_date: "1998-01-01", label: "A coordinated eradication program begins while growers adopt new inspection and reporting practices.", category: "timeline" },
    { id: "event-2017", evidence_date: "2017-01-01", label: "Long-term production data documents the cumulative effect on harvest volume and regional operations.", category: "timeline" },
    { id: "event-2005", evidence_date: "2005-01-01", label: "The first confirmed finding prompts an immediate response across commercial citrus operations statewide.", category: "timeline" },
    { id: "event-2023", evidence_date: "2023-01-01", label: "Updated field research supports a broader recovery strategy focused on resilient groves and improved practices.", category: "timeline" },
    { id: "event-2012", evidence_date: "2012-01-01", label: "Growers and scientists establish shared trials to evaluate treatments under real production conditions.", category: "timeline" },
  ];
  const result = await renderCanonicalReferenceVisual({ ...recipe, visual_subtype: "timeline", title: "A dense evidence timeline", subtitle: "Confirmed milestones remain connected to their dates." }, denseEvidence);
  const dates = [...result.canonicalSvg.matchAll(/data-evidence-date="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(dates, ["1998-01-01", "2005-01-01", "2008-01-01", "2012-01-01", "2017-01-01", "2023-01-01"]);
  for (const entry of denseEvidence) {
    assert.match(result.canonicalSvg, new RegExp(`data-evidence-id="${entry.id}"[^>]*data-evidence-date="${entry.evidence_date}"`));
    assert.match(result.canonicalSvg, new RegExp(entry.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").split(" ").slice(0, 4).join(" ")));
  }
  assert.equal((result.canonicalSvg.match(/data-timeline-event=/g) ?? []).length, denseEvidence.length);
  assert.match(result.canonicalSvg, /viewBox="0 0 1920 1080"/);
  assert.match(result.canonicalSvg, /data-timeline-side="left"/);
  assert.match(result.canonicalSvg, /data-timeline-side="right"/);
  assert.doesNotMatch(result.canonicalSvg, />timeline<\/text>/);
  const cards = [...result.canonicalSvg.matchAll(/<rect x="(150|1110)" y="([\d.]+)" width="660" height="([\d.]+)"/g)];
  assert.equal(cards.length, denseEvidence.length);
  for (const [, x, y, height] of cards) {
    assert.ok(Number(x) >= 70 && Number(x) + 660 <= 1850);
    assert.ok(Number(y) >= 350 && Number(y) + Number(height) <= 920.001);
  }
  const metadata = await sharp(result.pngBytes).metadata();
  assert.equal(metadata.width, 1920);
  assert.equal(metadata.height, 1080);
});

test("rejects misleading timeline and numeric treatments when canonical evidence cannot support them", async () => {
  await assert.rejects(
    () => renderCanonicalReferenceVisual({ ...recipe, visual_subtype: "timeline" }, [{ id: "undated", label: "Create a TIF district over 25 years" }]),
    /at least two confirmed evidence items with explicit dates/,
  );
  await assert.rejects(
    () => renderCanonicalReferenceVisual({ ...recipe, visual_subtype: "chart" }, [{ id: "text-only", label: "Policy proposal" }]),
    /confirmed numeric evidence/,
  );
  await assert.rejects(
    () => renderCanonicalReferenceVisual({ ...recipe, visual_subtype: "comparison" }, [{ id: "only-one", numeric_value: 25, unit: "years" }]),
    /confirmed evidence from exactly two canonical Source members/,
  );
});

test("the live-density timeline derives missing canonical dates and contains all 24 long events", async () => {
  const liveDensity = Array.from({ length: 24 }, (_, index) => {
    const year = 2023 - index * 3;
    return { id: `live-${year}`, evidence_date: null, label: `${year}: ${"A detailed confirmed milestone remains readable and associated with its exact chronological node. ".repeat(2).trim()}`, category: "timeline" };
  });
  const result = await renderCanonicalReferenceVisual({ ...recipe, visual_subtype: "timeline", title: "Timeline", renderer_contract_version: "forge.reference-visual-renderer.v2" }, liveDensity);
  const dates = [...result.canonicalSvg.matchAll(/data-evidence-date="([^"]+)"/g)].map((match) => Number(match[1]));
  assert.deepEqual(dates, [...dates].sort((left, right) => left - right));
  assert.equal((result.canonicalSvg.match(/data-timeline-event=/g) ?? []).length, 24);
  assert.equal((result.canonicalSvg.match(/data-timeline-layout="grid"/g) ?? []).length, 24);
  assert.doesNotMatch(result.canonicalSvg, />timeline<\/text>/);
  assert.equal(result.rendererName, "forge_timeline_v3");
  assert.equal(result.rendererVersion, "3");
  const cards = [...result.canonicalSvg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" rx="13"/g)];
  assert.equal(cards.length, 24);
  for (const [, x, y, width, height] of cards) {
    assert.ok(Number(x) >= 128 && Number(x) + Number(width) <= 1792.001);
    assert.ok(Number(y) >= 342 && Number(y) + Number(height) <= 925.001);
  }
});
