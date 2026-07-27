import assert from "node:assert/strict";
import test from "node:test";
import type { EpisodePackageV2 } from "../src/lib/episode-package-v2";
import {
  buildHearthMetadataMeta,
  isHearthMetadataComplete,
  resolveHearthMetadataLoadStatus,
} from "../src/routes/hearth-shell/buildHearthMetadataViewModel";
import { buildHearthMetadataProgress } from "../src/routes/hearth-shell/hearth-metadata-progress";

function episodePackage(input: {
  titles?: string[];
  tags?: string[];
  short?: string | null;
  long?: string | null;
}): EpisodePackageV2 {
  return {
    seo: {
      titles: (input.titles ?? []).map((text, index) => ({
        id: `title-${index}`,
        label: String.fromCharCode(65 + index),
        text,
        is_primary: index === 0,
      })),
      tags: input.tags ?? [],
      description_short: input.short ?? null,
      description_long: input.long ?? null,
    },
  } as EpisodePackageV2;
}

const canonical = episodePackage({
  titles: ["A canonical title"],
  tags: ["canonical"],
  short: "Short description",
  long: "Long description",
});

test("inactive, loading, failed, unavailable, absent, and loaded remain distinct", () => {
  assert.equal(resolveHearthMetadataLoadStatus({
    active: false, loaded: false, failed: false, authorityAvailable: true, canonicalPresent: false,
  }), "inactive");
  assert.equal(resolveHearthMetadataLoadStatus({
    active: true, loaded: false, failed: false, authorityAvailable: true, canonicalPresent: false,
  }), "loading");
  assert.equal(resolveHearthMetadataLoadStatus({
    active: true, loaded: false, failed: true, authorityAvailable: true, canonicalPresent: false,
  }), "failed");
  assert.equal(resolveHearthMetadataLoadStatus({
    active: true, loaded: false, failed: false, authorityAvailable: false, canonicalPresent: false,
  }), "unavailable");
  assert.equal(resolveHearthMetadataLoadStatus({
    active: true, loaded: true, failed: false, authorityAvailable: true, canonicalPresent: false,
  }), "absent");
  assert.equal(resolveHearthMetadataLoadStatus({
    active: true, loaded: true, failed: false, authorityAvailable: true, canonicalPresent: true,
  }), "loaded");
});

test("canonical required fields complete only under loaded authority", () => {
  const progress = buildHearthMetadataProgress({
    active: true,
    loaded: true,
    authorityAvailable: true,
    episodePackage: canonical,
    canonicalTitleCount: 0,
    canonicalTagCount: 0,
    canonicalHasDescriptions: false,
    dirty: false,
  });
  assert.equal(progress.completion, "complete");
  assert.equal(isHearthMetadataComplete(progress), true);
});

test("empty canonical arrays and fields cannot complete", () => {
  const progress = buildHearthMetadataProgress({
    active: true,
    loaded: true,
    authorityAvailable: true,
    episodePackage: episodePackage({}),
    canonicalTitleCount: 0,
    canonicalTagCount: 0,
    canonicalHasDescriptions: false,
    dirty: false,
  });
  assert.equal(progress.completion, "incomplete");
  assert.equal(isHearthMetadataComplete(progress), false);
});

test("local dirty state cannot become canonical completion", () => {
  const progress = buildHearthMetadataProgress({
    active: true,
    loaded: true,
    authorityAvailable: true,
    episodePackage: canonical,
    canonicalTitleCount: 1,
    canonicalTagCount: 1,
    canonicalHasDescriptions: true,
    dirty: true,
  });
  assert.equal(progress.completion, "dirty");
  assert.equal(isHearthMetadataComplete(progress), false);
});

test("failed or unavailable authority cannot complete cached canonical metadata", () => {
  const common = {
    active: true,
    episodePackage: canonical,
    canonicalTitleCount: 1,
    canonicalTagCount: 1,
    canonicalHasDescriptions: true,
    dirty: false,
  };
  assert.equal(buildHearthMetadataProgress({
    ...common, loaded: false, authorityAvailable: true,
  }).completion, "loading");
  assert.equal(buildHearthMetadataProgress({
    ...common, loaded: true, authorityAvailable: false,
  }).completion, "unavailable");
});

test("display metadata is derived without changing canonical state", () => {
  const before = JSON.stringify(canonical);
  assert.equal(buildHearthMetadataMeta({
    titleCount: 2,
    tagCount: 5,
    framingPackReady: true,
  }), "2 titles · 5 tags · Pack ready");
  assert.equal(JSON.stringify(canonical), before);
});
