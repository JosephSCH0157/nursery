import assert from "node:assert/strict";
import { appendAnvilDevFlagsToHref } from "../src/lib/anvil-dev-flags";

function createStorage(values: Record<string, string>): { getItem(key: string): string | null } {
  return {
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
    },
  };
}

{
  const href = appendAnvilDevFlagsToHref({
    href: "/anvil/teleprompter_pro.html?dev=1&workspace_id=w&workpiece_id=p",
    search: "?dev=1&asr_visual_chairperson_owner=true",
    storage: createStorage({}),
  });
  assert.equal(
    href,
    "/anvil/teleprompter_pro.html?dev=1&workspace_id=w&workpiece_id=p&asr_visual_chairperson_owner=true",
  );
}

{
  const href = appendAnvilDevFlagsToHref({
    href: "/anvil/teleprompter_pro.html?dev=1&workspace_id=w&workpiece_id=p",
    search: "?dev=1",
    storage: createStorage({ asr_visual_chairperson_owner: "true" }),
  });
  assert.equal(
    href,
    "/anvil/teleprompter_pro.html?dev=1&workspace_id=w&workpiece_id=p&asr_visual_chairperson_owner=true",
  );
}

{
  const href = appendAnvilDevFlagsToHref({
    href: "/anvil/teleprompter_pro.html?dev=1&asr_visual_chairperson_owner=1",
    search: "?dev=1",
    storage: createStorage({ asr_visual_chairperson_owner: "true" }),
  });
  assert.equal(
    href,
    "/anvil/teleprompter_pro.html?dev=1&asr_visual_chairperson_owner=1",
  );
}

console.log("anvil-dev-flag-forwarding ok");
