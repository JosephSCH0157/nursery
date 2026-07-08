import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveBarStockSparkHearthWorkpieceId,
  shouldDisplaySparkInHearthLibrary,
  type BarStockSpark,
} from "../src/lib/barstock-sparks";

function buildSpark(overrides: Partial<BarStockSpark> = {}): BarStockSpark {
  return {
    id: "spark-1",
    createdAt: 1,
    updatedAt: 1,
    body: "A spark body",
    ...overrides,
  };
}

test("forged spark with surviving Hearth workpiece stays visible", () => {
  const spark = buildSpark({
    status: "forged",
    links: {
      hearthWorkpieceId: "123e4567-e89b-42d3-a456-426614174000",
    },
  });

  assert.equal(resolveBarStockSparkHearthWorkpieceId(spark), "123e4567-e89b-42d3-a456-426614174000");
  assert.equal(shouldDisplaySparkInHearthLibrary(spark), true);
});

test("forged spark without surviving Hearth workpiece is hidden from the library", () => {
  const spark = buildSpark({
    status: "forged",
    links: {
      hearthDraftId: "draft-buffer-only",
    },
  });

  assert.equal(resolveBarStockSparkHearthWorkpieceId(spark), null);
  assert.equal(shouldDisplaySparkInHearthLibrary(spark), false);
});

test("open spark without Hearth workpiece remains visible", () => {
  const spark = buildSpark({
    status: "raw",
  });

  assert.equal(shouldDisplaySparkInHearthLibrary(spark), true);
});

test("graduated spark without surviving Hearth workpiece is hidden from the library", () => {
  const spark = buildSpark({
    status: "graduated",
  });

  assert.equal(shouldDisplaySparkInHearthLibrary(spark), false);
});
