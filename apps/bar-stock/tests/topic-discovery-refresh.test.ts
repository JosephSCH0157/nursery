import assert from "node:assert/strict";
import test from "node:test";
import { formatNextEligibleAt, getCollapsedTopicBasis, getDailyRefreshOperation, isPreviousResultSet, localCalendarDateKey, TopicDiscoveryRequestError } from "../src/lib/topic-discovery-refresh";

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

test("the previous-results state is derived only from revision mismatch", () => {
  assert.equal(isPreviousResultSet(8, 2), true);
  assert.equal(isPreviousResultSet(8, 8), false);
  assert.equal(isPreviousResultSet(8, null), false);
});

test("next eligibility is formatted for the user's local calendar day", () => {
  const now = new Date(2026, 8, 15, 13, 30);
  const sameDay = formatNextEligibleAt(new Date(2026, 8, 15, 19, 42).toISOString(), now);
  const nextDay = formatNextEligibleAt(new Date(2026, 8, 16, 9, 5).toISOString(), now);

  assert.ok(sameDay);
  assert.ok(!sameDay.includes("2026"));
  assert.ok(nextDay);
  assert.match(nextDay, /Sep|9/);
  assert.equal(formatNextEligibleAt("not-a-date", now), null);
});

test("budget errors preserve structured eligibility metadata", () => {
  const error = new TopicDiscoveryRequestError("budget_blocked", {
    outcome: "budget_blocked",
    next_eligible_at: "2026-09-15T23:17:00Z",
  });

  assert.equal(error.outcome, "budget_blocked");
  assert.equal(error.nextEligibleAt, "2026-09-15T23:17:00Z");
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
