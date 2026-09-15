import assert from "node:assert/strict";
import test from "node:test";
import { getCollapsedTopicBasis, getDailyRefreshOperation, localCalendarDateKey } from "../src/lib/topic-discovery-refresh";

const workspaceId = "workspace-1";
const preference = { revision: 7, enabled: true, auto_refresh_authorized: true };

test("first use without a successful topic search does not auto-refresh", () => {
  assert.equal(getDailyRefreshOperation(workspaceId, preference, null, new Date(2026, 8, 15, 9)), null);
  assert.equal(getCollapsedTopicBasis(null, false), null);
});

test("the collapsed summary shows only the saved primary topic", () => {
  const configured = {
    enabled: true,
    genre: "Chicago Bears",
    topic_interests: ["injury reports"],
    editorial_scope: "Local analysis",
    language: "English",
    region: "Chicago",
  };

  assert.equal(getCollapsedTopicBasis(configured, false), "Chicago Bears");
  assert.equal(getCollapsedTopicBasis({ ...configured, genre: "Trending" }, false), "Trending");
  assert.equal(getCollapsedTopicBasis(configured, true), null);
});

test("a saved configuration refreshes once per local calendar day", () => {
  const now = new Date(2026, 8, 15, 9);
  const previousDay = new Date(2026, 8, 14, 23, 55).toISOString();
  const sameDay = new Date(2026, 8, 15, 0, 5).toISOString();

  assert.deepEqual(getDailyRefreshOperation(workspaceId, preference, previousDay, now), {
    operationKey: `auto:${workspaceId}:7:${localCalendarDateKey(now)}`,
    preferenceRevision: 7,
  });
  assert.equal(getDailyRefreshOperation(workspaceId, preference, sameDay, now), null);
});

test("daily refresh stays disabled unless the saved preference authorizes it", () => {
  const previousDay = new Date(2026, 8, 14, 9).toISOString();
  const now = new Date(2026, 8, 15, 9);

  assert.equal(getDailyRefreshOperation(workspaceId, { ...preference, enabled: false }, previousDay, now), null);
  assert.equal(getDailyRefreshOperation(workspaceId, { ...preference, auto_refresh_authorized: false }, previousDay, now), null);
});

test("an unchanged last-success timestamp keeps the same idempotent daily operation after failure", () => {
  const previousSuccess = new Date(2026, 8, 14, 9).toISOString();
  const now = new Date(2026, 8, 15, 9);

  const beforeFailure = getDailyRefreshOperation(workspaceId, preference, previousSuccess, now);
  const afterFailure = getDailyRefreshOperation(workspaceId, preference, previousSuccess, now);
  assert.deepEqual(afterFailure, beforeFailure);
});
