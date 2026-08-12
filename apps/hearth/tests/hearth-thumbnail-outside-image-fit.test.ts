import assert from "node:assert/strict";
import test from "node:test";
import { calculateOutsideImageContainFit } from "../src/lib/hearth-thumbnail-outside-image-fit";

test("contains a landscape upload inside a portrait frame without distortion", () => {
  const fit = calculateOutsideImageContainFit(1600, 900, 1080, 1920);

  assert.equal(fit.rendered_width, 1080);
  assert.equal(fit.rendered_height, 608);
  assert.equal(fit.offset_x, 0);
  assert.equal(fit.offset_y, 656);
  assert.equal(fit.rendered_width / fit.rendered_height, 1080 / 608);
  assert.ok(fit.rendered_width <= fit.target_width);
  assert.ok(fit.rendered_height <= fit.target_height);
});

test("contains a portrait upload inside a landscape frame and centers it", () => {
  const fit = calculateOutsideImageContainFit(900, 1600, 1280, 720);

  assert.equal(fit.rendered_width, 405);
  assert.equal(fit.rendered_height, 720);
  assert.equal(fit.offset_x, 437);
  assert.equal(fit.offset_y, 0);
  assert.equal(fit.scale, 0.45);
});

test("fills a matching frame without cropping or padding", () => {
  const fit = calculateOutsideImageContainFit(1920, 1080, 1280, 720);

  assert.equal(fit.rendered_width, 1280);
  assert.equal(fit.rendered_height, 720);
  assert.equal(fit.offset_x, 0);
  assert.equal(fit.offset_y, 0);
  assert.equal(fit.fit_mode, "contain");
  assert.equal(fit.contract_version, "forge.outside-image-contain-fit.v1");
});

test("rejects invalid source or frame dimensions", () => {
  assert.throws(() => calculateOutsideImageContainFit(0, 900, 1280, 720), /positive/);
  assert.throws(() => calculateOutsideImageContainFit(1600, 900, Number.NaN, 720), /positive/);
});
