import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { useNewTakeThenOpen } from "../src/app/hammerTakeAdoption";

const target = {
  workspaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  workpieceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
};

test("Use New Take adopts first and opens only after canonical authority returns", async () => {
  const calls: string[] = [];
  await useNewTakeThenOpen({
    target,
    adopt: async () => {
      calls.push("adopt");
      return { outcome: "adopted", canonicalRecordingId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" };
    },
    open: (_target, authority) => calls.push(`open:${authority.canonicalRecordingId}`),
  });
  assert.deepEqual(calls, ["adopt", "open:cccccccc-cccc-4ccc-8ccc-cccccccccccc"]);
});

test("failed take adoption never opens Hammer", async () => {
  let opened = false;
  await assert.rejects(() => useNewTakeThenOpen({
    target,
    adopt: async () => { throw new Error("adoption failed"); },
    open: () => { opened = true; },
  }), /adoption failed/);
  assert.equal(opened, false);
});

test("Landing Pad cards are informational and expose independent commands", async () => {
  const source = await readFile(new URL("../src/app/HammerProjectLibrary.tsx", import.meta.url), "utf8");
  const articleStart = source.indexOf("<article\n              key={project.workpieceId}");
  const bodyStart = source.indexOf('<div className="hammer-project-library__card-body">', articleStart);
  const articleOpening = source.slice(articleStart, bodyStart);
  assert.ok(articleStart >= 0 && bodyStart > articleStart);
  assert.doesNotMatch(articleOpening, /onClick|onKeyDown|tabIndex/);
  assert.match(source, />\s*Open Current Edit\s*</);
  assert.match(source, /"Use New Take"/);
});
