import assert from "node:assert/strict";
import test from "node:test";
import { parseTongsReadFileResponse } from "../src/lib/tongsReadFileResponse";

test("canonical read-file success is present and preserves metadata", () => {
  const result = parseTongsReadFileResponse<{ value: number }>({ status: 200, responseOk: true, payload: { ok: true, data: { value: 1 }, file_row: { revision: 7, hash_value: "abc" } } });
  assert.equal(result.kind, "present");
  if (result.kind === "present") assert.deepEqual(result.fileRow, { revision: 7, hash_value: "abc" });
});

test("genuine not-found responses and documented absence shapes are absent", () => {
  assert.equal(parseTongsReadFileResponse({ status: 404, responseOk: false, payload: { ok: true, exists: false } }).kind, "absent");
  assert.equal(parseTongsReadFileResponse({ status: 404, responseOk: false, payload: { ok: false, error: { code: "not_found" } } }).kind, "absent");
  assert.equal(parseTongsReadFileResponse({ status: 404, responseOk: false, payload: null }).kind, "absent");
  assert.equal(parseTongsReadFileResponse({ status: 200, responseOk: true, payload: { ok: true, exists: false } }).kind, "absent");
  assert.equal(parseTongsReadFileResponse({ status: 403, responseOk: false, payload: { ok: true, exists: false } }).kind, "failure");
  assert.equal(parseTongsReadFileResponse({ status: 200, responseOk: true, payload: { ok: true, data: {} } }).kind, "failure");
});

test("legacy present envelope remains compatible", () => {
  assert.equal(parseTongsReadFileResponse({ status: 200, responseOk: true, payload: { ok: true, exists: true, data: { value: 1 } } }).kind, "present");
});
