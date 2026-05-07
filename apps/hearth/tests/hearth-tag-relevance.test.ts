import assert from "node:assert/strict";
import test from "node:test";
import {
  scoreTagRelevance,
  sortTagsByRelevance,
  type TagRelevanceContext,
} from "../src/lib/hearth-tag-relevance";

// -----------------------------------------------------------------------
// scoreTagRelevance
// -----------------------------------------------------------------------

test("tag relevance: returns 0 for tag with no match", () => {
  const ctx: TagRelevanceContext = {
    body: "This is a podcast about cats.",
    titleTexts: ["Feline Friends"],
  };
  assert.strictEqual(scoreTagRelevance("javascript", ctx), 0);
});

test("tag relevance: scores body frequency (3 pts each, capped at 15)", () => {
  const ctx: TagRelevanceContext = {
    body: "lobbying lobbying lobbying lobbying lobbying lobbying lobbying",
    titleTexts: [],
  };
  // 7 occurrences * 3 = 21, capped at 15
  assert.strictEqual(scoreTagRelevance("lobbying", ctx), 15);
});

test("tag relevance: scores single body occurrence as 3", () => {
  const ctx: TagRelevanceContext = {
    body: "The lobbying bill was passed.",
    titleTexts: [],
  };
  assert.strictEqual(scoreTagRelevance("lobbying", ctx), 3);
});

test("tag relevance: adds 5 pts for title match", () => {
  const ctx: TagRelevanceContext = {
    body: "No match here.",
    titleTexts: ["Congress Lobbying Exposed"],
  };
  assert.strictEqual(scoreTagRelevance("lobbying", ctx), 5);
});

test("tag relevance: combines body and title scores", () => {
  const ctx: TagRelevanceContext = {
    body: "lobbying lobbying",
    titleTexts: ["Lobbying Reform"],
  };
  // 2 * 3 (body) + 5 (title) = 11
  assert.strictEqual(scoreTagRelevance("lobbying", ctx), 11);
});

test("tag relevance: matching is case-insensitive", () => {
  const ctx: TagRelevanceContext = {
    body: "LOBBYING is covered in the LOBBYING bill.",
    titleTexts: ["LOBBYING Reform"],
  };
  // 2 * 3 + 5 = 11
  assert.strictEqual(scoreTagRelevance("lobbying", ctx), 11);
});

// -----------------------------------------------------------------------
// sortTagsByRelevance
// -----------------------------------------------------------------------

test("sort tags: higher scoring tags appear first", () => {
  const ctx: TagRelevanceContext = {
    body: "congress congress congress lobbying",
    titleTexts: [],
  };
  const sorted = sortTagsByRelevance(["lobbying", "congress", "policy"], ctx);
  assert.deepEqual(sorted, ["congress", "lobbying", "policy"]);
});

test("sort tags: ties preserve original order", () => {
  const ctx: TagRelevanceContext = {
    body: "nothing matches here",
    titleTexts: [],
  };
  const sorted = sortTagsByRelevance(["alpha", "beta", "gamma"], ctx);
  assert.deepEqual(sorted, ["alpha", "beta", "gamma"]);
});

test("sort tags: does not mutate the input array", () => {
  const ctx: TagRelevanceContext = { body: "beta beta beta", titleTexts: [] };
  const input = ["alpha", "beta"];
  sortTagsByRelevance(input, ctx);
  assert.deepEqual(input, ["alpha", "beta"]);
});
