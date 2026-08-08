import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  MATRIX_SDF_ATLAS,
  MATRIX_SDF_ATLAS_URL,
  MATRIX_SDF_CELL_SIZE,
  MATRIX_SDF_DISTANCE_RANGE,
  MATRIX_SDF_GLYPHS,
  MATRIX_SDF_GRID_SIZE,
  MATRIX_SDF_TEXTURE_SIZE,
} from "../lib/effects/assets/matrix-binary-sdf.ts";

const expectedGlyphs = [
  "0", "1", "<", ">",
  "[", "]", "{", "}",
  "+", "-", "=", "/",
  "\\", ":", "#", "@",
];
const expectedDigest = "7e8a0b4f4993681d15688c9b159c917739b9f6f6c0c4ed359b45c70671ae3fa2";

test("Matrix uses a deterministic binary-led 4x4 SDF atlas", async () => {
  assert.deepEqual([...MATRIX_SDF_GLYPHS], expectedGlyphs);
  assert.equal(MATRIX_SDF_GRID_SIZE, 4);
  assert.equal(MATRIX_SDF_TEXTURE_SIZE, 512);
  assert.equal(MATRIX_SDF_CELL_SIZE, 128);
  assert.equal(MATRIX_SDF_DISTANCE_RANGE, 16);
  assert.equal(MATRIX_SDF_ATLAS.glyphs.length, 16);
  assert.equal(MATRIX_SDF_ATLAS.sourceFont, "/fonts/chakra-petch/ChakraPetch-Bold.ttf");
  assert.match(MATRIX_SDF_ATLAS.sourceFontLicense, /Open Font License/i);

  const atlas = await readFile(new URL(`../public${MATRIX_SDF_ATLAS_URL}`, import.meta.url));
  assert.deepEqual([...atlas.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(atlas.subarray(12, 16).toString("ascii"), "IHDR");
  assert.equal(atlas.readUInt32BE(16), MATRIX_SDF_TEXTURE_SIZE);
  assert.equal(atlas.readUInt32BE(20), MATRIX_SDF_TEXTURE_SIZE);
  assert.equal(atlas[24], 8, "the atlas should use eight-bit samples");
  assert.equal(atlas[25], 0, "PNG color type 0 keeps the atlas single-channel");
  assert.equal(createHash("sha256").update(atlas).digest("hex"), expectedDigest);
});

test("Ink wash fades the canvas-wide scrim and scopes contrast to dark text plates", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(
    css,
    /\.detail-hero \.shader-stage--preset-ink-wash::after\s*{\s*opacity:\s*0;/,
  );
  assert.match(
    css,
    /\.detail-hero:has\(\.shader-stage--preset-ink-wash\) \.detail-hero__summary/,
  );
  assert.match(css, /background:\s*rgba\(11, 18, 16, 0\.88\)/);
  const plateStart = css.indexOf(
    ".detail-hero:has(.shader-stage--preset-ink-wash) .breadcrumbs--floating,",
  );
  const plateEnd = css.indexOf("}", plateStart);
  assert.notEqual(plateStart, -1);
  assert.notEqual(plateEnd, -1);
  assert.doesNotMatch(css.slice(plateStart, plateEnd), /backdrop-filter/);
});

test("Stylized Point Field ships a correctly sized social card without the old title", async () => {
  const social = await readFile(new URL(
    "../public/og-stylized-point-field.png",
    import.meta.url,
  ));
  const site = await readFile(new URL("../lib/site.ts", import.meta.url), "utf8");

  assert.deepEqual([...social.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(social.readUInt32BE(16), 1_200);
  assert.equal(social.readUInt32BE(20), 630);
  assert.match(site, /SITE_STYLIZED_POINT_FIELD_SOCIAL_IMAGE/);
  assert.match(site, /og-stylized-point-field\.png/);
  assert.doesNotMatch(site, /SITE_MATERIALIZATION_REMIX_SOCIAL_IMAGE/);
});
