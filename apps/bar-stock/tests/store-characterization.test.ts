import assert from "node:assert/strict";
import test from "node:test";
import { removeSpark, upsertSpark } from "../src/lib/store";
import type { Spark } from "../src/lib/model";

const spark = { id: "spark-1", title: "one" } as Spark;

test("current store upsert prepends new sparks and replaces matching ids", () => {
  assert.deepEqual(upsertSpark([], spark), [spark]);
  const replacement = { ...spark, title: "two" } as Spark;
  assert.deepEqual(upsertSpark([spark], replacement), [replacement]);
});

test("current store removal is identity scoped", () => {
  assert.deepEqual(removeSpark([spark], spark.id), []);
  assert.deepEqual(removeSpark([spark], "other" as Spark["id"]), [spark]);
});
