import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { isIntroOutroPackagingClip } from "../src/editor/hammerPackagingTransport";
import VisualTimelineDock, {
  resolveVisualTimelineDisplayDurationSec,
} from "../src/visuals/components/VisualTimelineDock";
import type { HammerVisualClip } from "../src/visuals/model/hammerVisualTypes";
import { layoutVisualClipRows } from "../src/visuals/components/VisualTimelineLane";

test("dock identifies composition and packaging counts without duplicating packaging", () => {
  const authorizedTargetId = "placement_mm_from_media_still_broll-beat-f89a4ff5-04b5-408d-9cc9-83a7ad9a65a2";
  const packagingIntroId = "placement:bd3c4759-ebaf-4994-8462-f3956361b275";
  const clips = Array.from({ length: 29 }, (_, index) => ({
    clipId: index === 21 ? authorizedTargetId : `composition-${index}`,
    label: `Composition ${index}`,
    startSec: index,
    endSec: index + 1,
    selected: false,
  }));
  const markup = renderToStaticMarkup(
    <VisualTimelineDock
      clips={clips}
      playheadSec={0}
      durationSec={30}
      selectedClipId={null}
      editable={false}
      onSelectClip={() => undefined}
    />,
  );
  const packagingIntro = {
    clip_id: packagingIntroId,
    entry_id: "packaging:intro",
    asset_id: "asset_0b368a47",
    system_type: "intro",
  } as HammerVisualClip;
  const canonicalPlacementIds = new Set([...clips.map((clip) => clip.clipId), packagingIntro.clip_id]);
  const mountedCompositionIds = new Set(clips.map((clip) => clip.clipId));
  const canonicalOnlyIds = [...canonicalPlacementIds].filter((id) => !mountedCompositionIds.has(id));

  assert.equal(isIntroOutroPackagingClip(packagingIntro), true);
  assert.equal(canonicalPlacementIds.size, 30);
  assert.equal(mountedCompositionIds.size, 29);
  assert.deepEqual(canonicalOnlyIds, [packagingIntroId]);
  assert.equal(clips.filter((clip) => clip.clipId === authorizedTargetId).length, 1);
  assert.match(markup, /29 composition clips/);
  assert.equal((markup.match(/data-clip-id=/g) ?? []).length, 29);
  assert.equal((markup.match(new RegExp(`data-clip-id="${authorizedTargetId}"`, "g")) ?? []).length, 1);
  assert.doesNotMatch(markup, /packaging:intro/);
  assert.doesNotMatch(markup, new RegExp(packagingIntroId));
});

test("rendered collisions receive deterministic independent rows", () => {
  const target = { clipId: "target", label: "Target", startSec: 386.5, endSec: 389.25, selected: false };
  const duplicate = { ...target, clipId: "duplicate" };
  const separated = { clipId: "separated", label: "Separated", startSec: 416.622, endSec: 419.322, selected: false };

  const narrow = layoutVisualClipRows([target, duplicate, separated], 462.894, 160);
  assert.equal(narrow.rowByClipId.get("target"), 0);
  assert.equal(narrow.rowByClipId.get("duplicate"), 1);
  assert.equal(narrow.rowByClipId.get("separated"), 2);
  assert.equal(narrow.rowCount, 3);

  const wide = layoutVisualClipRows([target, duplicate, separated], 462.894, 800);
  assert.equal(wide.rowByClipId.get("target"), 0);
  assert.equal(wide.rowByClipId.get("duplicate"), 1);
  assert.equal(wide.rowByClipId.get("separated"), 0);
  assert.equal(wide.rowCount, 2);
});

test("dock display duration includes mounted clips beyond playback duration", () => {
  const target = {
    clipId: "placement-target",
    label: "Entire seasons lost.",
    startSec: 386.5,
    endSec: 389.2,
    selected: false,
  };
  const later = {
    clipId: "placement-later",
    label: "Later placement",
    startSec: 416.6,
    endSec: 419.3,
    selected: false,
  };

  assert.equal(resolveVisualTimelineDisplayDurationSec(30, [target, later]), 419.3);

  const markup = renderToStaticMarkup(
    <VisualTimelineDock
      clips={[target, later]}
      playheadSec={0}
      durationSec={30}
      selectedClipId={null}
      editable
      onSelectClip={() => undefined}
    />,
  );

  assert.match(markup, /data-clip-id="placement-target"[^>]*style="left:92\.1774[^"]*;width:1%[^"]*"/);
  assert.match(markup, /data-clip-id="placement-later"[^>]*style="left:99\.3560[^"]*;width:1%[^"]*"/);
  assert.doesNotMatch(markup, /data-clip-id="placement-target"[^>]*style="left:100%/);
});
