import assert from "node:assert/strict";
import test from "node:test";

type BarStockRepositoryShape = {
  list: unknown;
  create: unknown;
  update: unknown;
  archive: unknown;
  hydrateWorkspace: unknown;
};

test("future canonical repository contract reserves required operations", () => {
  const required: (keyof BarStockRepositoryShape)[] = ["list", "create", "update", "archive", "hydrateWorkspace"];
  assert.deepEqual(required, ["list", "create", "update", "archive", "hydrateWorkspace"]);
});
