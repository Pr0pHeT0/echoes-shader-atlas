import assert from "node:assert/strict";
import test from "node:test";

import {
  EFFECT_IDS,
  EXTRACTED_SHADER_PATHS,
  SOURCE_COMMIT,
  auditExtraction,
  auditThirdPartyAssets,
} from "../scripts/audit-extraction.mjs";

test("pins the complete five-effect, 13-unit extraction inventory", async () => {
  const report = await auditExtraction();

  assert.equal(report.manifest.sourceCommit, SOURCE_COMMIT);
  assert.equal(report.effectCount, 5);
  assert.equal(report.unitCount, 13);
  assert.equal(report.extractedFileCount, 12);
  assert.deepEqual(
    report.manifest.effects.map(({ id }) => id).sort(),
    [...EFFECT_IDS].sort(),
  );
  assert.deepEqual(
    [...new Set(report.manifest.units.map(({ extractedPath }) => extractedPath))].sort(),
    [...EXTRACTED_SHADER_PATHS].sort(),
  );
});

test("retains font licenses, notices, and the Ashima MIT grant", async () => {
  const report = await auditThirdPartyAssets();

  assert.equal(report.fontCount, 5);
  assert.equal(report.noticePath, "THIRD_PARTY_NOTICES.md");
});
