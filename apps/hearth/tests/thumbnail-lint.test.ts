import assert from "node:assert/strict";
import {
  lintThumbnail,
  type Rect,
  type RenderedThumbnail,
  type ThumbnailMetadata,
  type ThumbnailPixelData,
} from "../src/lib/thumbnail-lint";
import {
  HEARTH_THUMBNAIL_TITLE_CONTRACT,
  deriveHearthThumbnailOverlayText,
  isLegacyDerivedHearthThumbnailOverlayText,
  resolveHearthThumbnailOverlayText,
} from "../src/lib/hearth-thumbnail-title-contract";
import { hydrateEpisodePackageV2, parseSeoTitlesFromText } from "../src/lib/episode-package-v2";

function createSolidPixelData(
  width: number,
  height: number,
  rgb: [number, number, number],
): ThumbnailPixelData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const index = i * 4;
    data[index] = rgb[0];
    data[index + 1] = rgb[1];
    data[index + 2] = rgb[2];
    data[index + 3] = 255;
  }
  return { width, height, data };
}

function createCheckerPixelData(width: number, height: number): ThumbnailPixelData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const isLight = (x + y) % 2 === 0;
      const value = isLight ? 255 : 0;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }
  return { width, height, data };
}

function createRenderedThumbnail(
  overrides?: Partial<RenderedThumbnail>,
  rectOverrides?: Partial<Rect>,
): RenderedThumbnail {
  return {
    width: 1280,
    height: 720,
    textBoundingBox: {
      x: 120,
      y: 96,
      width: 420,
      height: 120,
      ...rectOverrides,
    },
    textLineCount: 2,
    backgroundImageData: createSolidPixelData(1280, 720, [16, 16, 16]),
    ...overrides,
  };
}

function createMetadata(overrides?: Partial<ThumbnailMetadata>): ThumbnailMetadata {
  return {
    overlayText: "IT GETS WORSE",
    titleStyle: {
      font_preset: "bold_sans",
      text_color: "#FFFFFF",
      shadow: {
        enabled: true,
        strength: "medium",
      },
    },
    brandTemplateId: "b8ef4130-57d9-4e62-9eb7-b59b74c0bd7d",
    seoTitle: "Why Gas Prices Are Rising Again",
    ...overrides,
  };
}

function testShortAndLongTextThresholds() {
  const warning = lintThumbnail(
    createRenderedThumbnail(),
    createMetadata({ overlayText: "THIS GETS BAD VERY FAST" }),
  );
  assert.equal(warning.checks.find((check) => check.id === "text-length")?.status, "warning");

  const fail = lintThumbnail(
    createRenderedThumbnail(),
    createMetadata({ overlayText: "THIS REALLY DOES GET MUCH WORSE FAST" }),
  );
  assert.equal(fail.checks.find((check) => check.id === "text-length")?.status, "fail");
}

function testContrastThresholds() {
  const fail = lintThumbnail(
    createRenderedThumbnail({
      backgroundImageData: createSolidPixelData(1280, 720, [180, 180, 180]),
    }),
    createMetadata({ titleStyle: { text_color: "#FFFFFF" } }),
  );
  assert.equal(fail.checks.find((check) => check.id === "contrast")?.status, "fail");

  const warning = lintThumbnail(
    createRenderedThumbnail({
      backgroundImageData: createSolidPixelData(1280, 720, [110, 110, 110]),
    }),
    createMetadata({ titleStyle: { text_color: "#FFFFFF" } }),
  );
  assert.equal(warning.checks.find((check) => check.id === "contrast")?.status, "warning");

  const pass = lintThumbnail(
    createRenderedThumbnail({
      backgroundImageData: createSolidPixelData(1280, 720, [20, 20, 20]),
    }),
    createMetadata({ titleStyle: { text_color: "#FFFFFF" } }),
  );
  assert.equal(pass.checks.find((check) => check.id === "contrast")?.status, "pass");
}

function testRedundancyDetection() {
  const fail = lintThumbnail(
    createRenderedThumbnail(),
    createMetadata({
      overlayText: "Why Gas Prices Are Rising Again",
      seoTitle: "Why Gas Prices Are Rising Again",
    }),
  );
  assert.equal(fail.checks.find((check) => check.id === "title-redundancy")?.status, "fail");

  const warning = lintThumbnail(
    createRenderedThumbnail(),
    createMetadata({
      overlayText: "Why gas prices rising again",
      seoTitle: "Why gas prices are rising again",
    }),
  );
  assert.equal(warning.checks.find((check) => check.id === "title-redundancy")?.status, "warning");

  const pass = lintThumbnail(
    createRenderedThumbnail(),
    createMetadata({
      overlayText: "Gas prices rising again",
      seoTitle: "Why gas prices are rising again",
    }),
  );
  assert.equal(pass.checks.find((check) => check.id === "title-redundancy")?.status, "pass");
}

function testSafeZoneDetection() {
  const warning = lintThumbnail(
    createRenderedThumbnail(undefined, {
      x: 20,
      y: 120,
      width: 480,
      height: 120,
    }),
    createMetadata(),
  );
  assert.equal(warning.checks.find((check) => check.id === "safe-zone")?.status, "warning");

  const fail = lintThumbnail(
    createRenderedThumbnail(undefined, {
      x: 0,
      y: 0,
      width: 220,
      height: 140,
    }),
    createMetadata(),
  );
  assert.equal(fail.checks.find((check) => check.id === "safe-zone")?.status, "fail");
}

function testFrameCoverageThresholds() {
  const warning = lintThumbnail(
    createRenderedThumbnail(undefined, {
      width: 800,
      height: 320,
    }),
    createMetadata(),
  );
  assert.equal(warning.checks.find((check) => check.id === "frame-coverage")?.status, "warning");

  const fail = lintThumbnail(
    createRenderedThumbnail(undefined, {
      width: 1000,
      height: 400,
    }),
    createMetadata(),
  );
  assert.equal(fail.checks.find((check) => check.id === "frame-coverage")?.status, "fail");
}

function testBackgroundClutterEstimation() {
  const cluttered = lintThumbnail(
    createRenderedThumbnail({
      backgroundImageData: createCheckerPixelData(1280, 720),
    }),
    createMetadata(),
  );
  assert.equal(cluttered.checks.find((check) => check.id === "background-clutter")?.status, "fail");

  const calm = lintThumbnail(
    createRenderedThumbnail({
      backgroundImageData: createSolidPixelData(1280, 720, [24, 24, 24]),
    }),
    createMetadata(),
  );
  assert.equal(calm.checks.find((check) => check.id === "background-clutter")?.status, "pass");
}

function testLineCountAndTemplateChecks() {
  const fail = lintThumbnail(
    createRenderedThumbnail({ textLineCount: 4 }),
    createMetadata({ brandTemplateId: null }),
  );
  assert.equal(fail.checks.find((check) => check.id === "line-count")?.status, "fail");
  assert.equal(fail.checks.find((check) => check.id === "template-consistency")?.status, "warning");
}

function testThumbnailOverlayContractDerivation() {
  const overlay = deriveHearthThumbnailOverlayText("Why Gas Prices Are Rising Again Right Now");
  assert.equal(overlay, "Gas Prices Rising Again");
  assert.equal(
    overlay.split(/\s+/).filter(Boolean).length <= HEARTH_THUMBNAIL_TITLE_CONTRACT.preferred_max_words,
    true,
  );

  const parsed = parseSeoTitlesFromText([
    "SEO_TITLES:",
    "- SAFE: Why Gas Prices Are Rising Again Right Now",
    "- SPICY: The Hidden Reason Rent Keeps Crushing Workers",
  ].join("\n"));
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0]?.thumbnail_text, null);
  assert.equal(parsed[1]?.thumbnail_text, null);

  const fullTitle = "Why Is Gasoline So Expensive in the United States?";
  assert.equal(fullTitle.split(/\s+/).length, 9);
  assert.equal(resolveHearthThumbnailOverlayText({ text: fullTitle, thumbnail_text: null }), fullTitle);
  assert.equal(resolveHearthThumbnailOverlayText({ text: fullTitle, thumbnail_text: "WHY SO EXPENSIVE?" }), "WHY SO EXPENSIVE?");
  assert.equal(isLegacyDerivedHearthThumbnailOverlayText({ text: fullTitle, thumbnail_text: "Gasoline So Expensive United" }), true);
  assert.equal(isLegacyDerivedHearthThumbnailOverlayText({ text: fullTitle, thumbnail_text: "WHY SO EXPENSIVE?" }), false);

  const hydrated = hydrateEpisodePackageV2({ episode: { seo: { titles: [
    { id: "title-a", label: "A", text: fullTitle, thumbnail_text: null, is_primary: true },
    { id: "title-b", label: "B", text: "An explicit title", thumbnail_text: "AUTHORED COPY", is_primary: false },
  ] } } });
  assert.equal(hydrated.seo.titles[0]?.thumbnail_text, null);
  assert.equal(hydrated.seo.titles[1]?.thumbnail_text, "AUTHORED COPY");
}

function run() {
  testShortAndLongTextThresholds();
  testContrastThresholds();
  testRedundancyDetection();
  testSafeZoneDetection();
  testFrameCoverageThresholds();
  testBackgroundClutterEstimation();
  testLineCountAndTemplateChecks();
  testThumbnailOverlayContractDerivation();
  // eslint-disable-next-line no-console
  console.log("Thumbnail lint tests passed.");
}

run();
