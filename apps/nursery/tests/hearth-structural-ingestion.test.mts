import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { parseCreatorSuppliedResearch } from "../server/hearth/hearth-creator-research-ingest";

test("unfamiliar dense entity records are segmented without fixture vocabulary", () => {
  const pasted = "Restaurants, Cafes & BarsCopper Finch Cafe (41 N Maple Avenue)Neighborhood coffee and pastries.River House Grill (88 Harbor Road)Dinner and drinks.Corporate & Professional HubsNorthwind Studio4.7(82)Corporate officeAttractions & EntertainmentRiverbend Arena4.5(120)Arena";
  const parsed = parseCreatorSuppliedResearch(pasted);
  const byName = new Map(parsed.entities.map((entity) => [entity.name, entity]));

  assert.equal(byName.size, 4);
  assert.equal(byName.get("Copper Finch Cafe")?.address, "41 N Maple Avenue");
  assert.equal(byName.get("Copper Finch Cafe")?.entityRole, "customer_facing");
  assert.equal(byName.get("Northwind Studio")?.entityRole, "office");
  assert.equal(byName.get("Riverbend Arena")?.entityRole, "venue");
  assert.ok(parsed.entities.every((entity) => entity.sourceSpan.end > entity.sourceSpan.start));
});

test("certification fixture names do not become production decision or ingestion heuristics", () => {
  const root = resolve(import.meta.dirname, "..");
  const productionFiles = [
    "server/hearth/hearth-turn-decision.ts",
    "server/hearth/hearth-creator-research-ingest.ts",
    "server/hearth/hearth-source-evidence-policy.ts",
  ];
  const forbidden = ["Church Street", "Big Boy 4014", "Florida Oranges", "Apollo 12"];
  for (const file of productionFiles) {
    const source = readFileSync(resolve(root, file), "utf8");
    for (const fixtureName of forbidden) assert.doesNotMatch(source, new RegExp(fixtureName, "i"), `${fixtureName} leaked into ${file}`);
  }
});
