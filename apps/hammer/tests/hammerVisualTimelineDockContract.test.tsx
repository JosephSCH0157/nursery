import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { isIntroOutroPackagingClip } from "../src/editor/hammerPackagingTransport";
import VisualTimelineDock, {
  resolveVisualTimelineDisplayDurationSec,
} from "../src/visuals/components/VisualTimelineDock";
import type { HammerVisualClip } from "../src/visuals/model/hammerVisualTypes";

test("dock identifies composition and packaging counts without duplicating packaging", () => {
  const clips = Array.from({ length: 29 }, (_, index) => ({
    clipId: `composition-${index}`,
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
    clip_id: "placement:bd3c4759-ebaf-4994-8462-f3956361b275",
    entry_id: "packaging:intro",
    asset_id: "asset_0b368a47",
    system_type: "intro",
  } as HammerVisualClip;
  assert.equal(isIntroOutroPackagingClip(packagingIntro), true);
  assert.equal(clips.length + Number(isIntroOutroPackagingClip(packagingIntro)), 30);
  assert.match(markup, /29 composition clips/);
  assert.equal((markup.match(/data-clip-id=/g) ?? []).length, 29);
  assert.doesNotMatch(markup, /packaging:intro/);
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

  assert.match(markup, /data-clip-id="placement-target"[^>]*style="left:92\.1774[^"]*;width:1%"/);
  assert.match(markup, /data-clip-id="placement-later"[^>]*style="left:99\.3560[^"]*;width:1%"/);
  assert.doesNotMatch(markup, /data-clip-id="placement-target"[^>]*style="left:100%/);
});
