"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Breadcrumbs } from "./Breadcrumbs";
import type { ShaderEffectMeta } from "@/lib/catalog/types";
import { effectShaderSources } from "@/lib/effects/source-registry";
import { trackEvent } from "@/lib/analytics";
import { SITE_GITHUB_URL, SITE_MANIFEST_URL, SITE_THREE_VERSION } from "@/lib/site";
import { ShaderStage, type ShaderStageAudio, type ShaderStageQuality } from "./ShaderStage";
import { SourceBrowser } from "./SourceBrowser";
import type { MaterializationPointCloud } from "@/lib/effects/types";

const defaultAudio: ShaderStageAudio = {
  level: 0.5,
  bass: 0.56,
  mid: 0.48,
  treble: 0.42,
};

type ModelImportState = {
  phase: "idle" | "reading" | "ready" | "error";
  message: string;
};

const defaultModelImportState: ModelImportState = {
  phase: "idle",
  message: "Procedural torus knot is active.",
};

const modelImportResultCodes = new Set([
  "format",
  "empty",
  "size",
  "external",
  "compression",
  "complexity",
  "geometry",
  "degenerate",
  "parse",
  "memory",
]);

export function EffectDetail({ effect }: { effect: ShaderEffectMeta }) {
  const [preset, setPreset] = useState(effect.presets[0]?.id ?? "default");
  const [paused, setPaused] = useState(false);
  const [quality, setQuality] = useState<ShaderStageQuality>("auto");
  const [restartKey, setRestartKey] = useState(0);
  const [automaticAudio, setAutomaticAudio] = useState(true);
  const [audio, setAudio] = useState<ShaderStageAudio>(defaultAudio);
  const [pointCloud, setPointCloud] = useState<MaterializationPointCloud | null>(null);
  const [modelFileName, setModelFileName] = useState<string | null>(null);
  const [modelImport, setModelImport] = useState<ModelImportState>(defaultModelImportState);
  const modelImportGeneration = useRef(0);
  const modelInputRef = useRef<HTMLInputElement>(null);
  const hasAudio = effect.drivers.some((driver) => driver.startsWith("Synthetic"));
  const acceptsLocalModel = effect.id === "audio-reactive-materialization";
  const usesAshimaNoise = effect.sourceUnits.some((source) => source.id === "simplex-noise-4d");
  const sources = useMemo(
    () => effectShaderSources[effect.id].map((source) => ({
      label: source.label,
      stage: source.stage,
      path: source.path,
      source: source.source,
    })),
    [effect.id],
  );

  useEffect(() => () => {
    modelImportGeneration.current += 1;
  }, []);

  function setAudioBand(band: keyof ShaderStageAudio, value: number) {
    if (automaticAudio) {
      trackEvent("synthetic_audio_mode", {
        effect_id: effect.id,
        mode: "manual",
        trigger: band,
      });
    }
    setAutomaticAudio(false);
    setAudio((current) => ({ ...current, [band]: value }));
  }

  function selectPreset(candidateId: string) {
    setPreset(candidateId);
    trackEvent("preset_change", { effect_id: effect.id, preset_id: candidateId });
  }

  function togglePlayback() {
    const nextPaused = !paused;
    setPaused(nextPaused);
    trackEvent("playback_change", {
      action: nextPaused ? "pause" : "play",
      effect_id: effect.id,
      placement: "effect_detail",
    });
  }

  function restartPlayback() {
    setRestartKey((value) => value + 1);
    trackEvent("playback_change", {
      action: "restart",
      effect_id: effect.id,
      placement: "effect_detail",
    });
  }

  function selectQuality(value: ShaderStageQuality) {
    setQuality(value);
    trackEvent("quality_change", { effect_id: effect.id, quality: value });
  }

  function toggleAutomaticAudio() {
    const nextAutomatic = !automaticAudio;
    setAutomaticAudio(nextAutomatic);
    trackEvent("synthetic_audio_mode", {
      effect_id: effect.id,
      mode: nextAutomatic ? "automatic" : "manual",
      trigger: "button",
    });
  }

  async function importLocalModel(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const generation = modelImportGeneration.current + 1;
    modelImportGeneration.current = generation;
    setModelImport({ phase: "reading", message: `Reading ${file.name} locally…` });

    try {
      const modelModule = await import("@/lib/effects/materialization-model");
      const prepared = await modelModule.createMaterializationPointCloudFromFile(file);
      if (modelImportGeneration.current !== generation) return;
      setPointCloud(prepared);
      setModelFileName(file.name);
      setModelImport({
        phase: "ready",
        message: `${file.name} is ready as a four-section particle target.`,
      });
      setPreset("materialize");
      setPaused(false);
      setRestartKey((value) => value + 1);
      trackEvent("local_model_import", {
        effect_id: effect.id,
        result: "success",
      });
    } catch (error) {
      if (modelImportGeneration.current !== generation) return;
      const message = error instanceof Error
        ? error.message
        : "This model could not be prepared. The current target has not changed.";
      const candidateResult = error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "unknown";
      const result = modelImportResultCodes.has(candidateResult) ? candidateResult : "unknown";
      setModelImport({ phase: "error", message });
      trackEvent("local_model_import", {
        effect_id: effect.id,
        result,
      });
    } finally {
      if (modelInputRef.current) modelInputRef.current.value = "";
    }
  }

  function restoreProceduralModel() {
    modelImportGeneration.current += 1;
    setPointCloud(null);
    setModelFileName(null);
    setModelImport({ phase: "idle", message: "Procedural torus knot restored." });
    setPreset("materialize");
    setPaused(false);
    setRestartKey((value) => value + 1);
    if (modelInputRef.current) modelInputRef.current.value = "";
    trackEvent("local_model_import", {
      effect_id: effect.id,
      result: "restore_default",
    });
  }

  return (
    <>
      <section className="detail-hero" aria-labelledby="effect-title">
        <Breadcrumbs current={effect.name} floating />
        <ShaderStage
          key={`${effect.id}-${restartKey}`}
          effectId={effect.id}
          preset={preset}
          paused={paused}
          quality={quality}
          syntheticAudio={automaticAudio}
          audio={audio}
          pointCloud={pointCloud}
          label={`${effect.name} interactive shader study`}
        />
        <div className="hero-grid" aria-hidden="true" />
        <div className="detail-hero__content">
          <div>
            <span className="section-kicker">{effect.eyebrow}</span>
            <h1 className="detail-hero__title" id="effect-title">
              {effect.name}
              <span className="detail-hero__title-context">{effect.seo.headingQualifier}</span>
            </h1>
          </div>
          <p className="detail-hero__summary">{effect.seo.description}</p>
        </div>

        <div className="detail-controls" aria-label="Shader preview controls">
          <div className="control-group" role="group" aria-label="Preset">
            <span className="control-group__label">Preset</span>
            {effect.presets.map((candidate) => (
              <button
                key={candidate.id}
                className={`control-button${candidate.id === preset ? " is-active" : ""}`}
                type="button"
                aria-pressed={candidate.id === preset}
                title={candidate.description}
                onClick={() => selectPreset(candidate.id)}
              >
                {candidate.label}
              </button>
            ))}
          </div>
          <div className="control-group" role="group" aria-label="Playback">
            <span className="control-group__label">Playback</span>
            <button className="control-button" type="button" onClick={togglePlayback}>
              {paused ? "Play" : "Pause"}
            </button>
            <button className="control-button" type="button" onClick={restartPlayback}>
              Restart
            </button>
          </div>
          <div className="control-group" role="group" aria-label="Quality">
            <span className="control-group__label">Quality</span>
            {(["low", "auto", "high"] as const).map((value) => (
              <button
                key={value}
                className={`control-button${quality === value ? " is-active" : ""}`}
                type="button"
                aria-pressed={quality === value}
                onClick={() => selectQuality(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="detail-body">
        <section className="detail-intro" aria-labelledby="anatomy-title">
          <div>
            <span className="section-kicker">System anatomy</span>
            <h2 id="anatomy-title">{effect.seo.anatomyHeading}</h2>
            <dl className="detail-classification">
              <ClassificationRow label="Family" value={effect.family} />
              <ClassificationRow label="Status" value={effect.statusLabel} />
              <ClassificationRow label="Drivers" value={effect.drivers.join(" · ")} />
              <ClassificationRow label="Primitive" value={effect.primitives.join(" · ")} />
              <ClassificationRow label="Pipeline" value={effect.techniques.join(" · ")} />
              <ClassificationRow label="Source" value={`${effect.sourceUnits.length} mapped units`} />
            </dl>
          </div>
          <div className="detail-prose">
            <p>{effect.description}</p>
            <p>
              The visual equations and production defaults are retained. Only application-specific
              orchestration and unlicensed model inputs were replaced, leaving a focused study that
              can be read independently of the original product.
            </p>
            <p>
              This preview uses one managed WebGL2 context, a capped pixel ratio, deterministic
              geometry, and complete GPU cleanup when you leave or switch studies.
            </p>
            <div className="effect-workflow" aria-labelledby="workflow-title">
              <h3 id="workflow-title">Pipeline, step by step</h3>
              <ol>
                {effect.seo.workflow.map((step) => (
                  <li key={step.title}>
                    <strong>{step.title}</strong>
                    <p>{step.description}</p>
                  </li>
                ))}
              </ol>
            </div>
            <div className="technical-notes" aria-label="Compatibility and credits">
              <p>
                <strong>Compatibility</strong>
                The live study uses Three.js {SITE_THREE_VERSION} and requires WebGL2. Source,
                classification, and notes remain readable when graphics are unavailable,
                animation is disabled, or the context is lost.
              </p>
              <p>
                <strong>Credit</strong>
                First-party GLSL is extracted from commit <code>d018f6d057c8f30144979bbcc95436cfb405d7c5</code>
                {usesAshimaNoise ? "; the shared 4D simplex dependency retains the Ashima MIT notice" : ""}.
              </p>
              <p>
                <strong>Open-source adaptation</strong>
                {effect.seo.adaptation}
              </p>
            </div>
            <div className="source-links" aria-label="Repository source links">
              <a className="inline-link" href={SITE_MANIFEST_URL} target="_blank" rel="noreferrer">
                Extraction manifest <span aria-hidden="true">↗</span>
              </a>
              {effect.sourceUnits.map((unit) => (
                <a
                  className="inline-link"
                  href={`${SITE_GITHUB_URL}/blob/main/${unit.extractedPath}`}
                  key={unit.id}
                  target="_blank"
                  rel="noreferrer"
                >
                  {unit.label} source <span aria-hidden="true">↗</span>
                </a>
              ))}
            </div>
          </div>
        </section>

        {acceptsLocalModel ? (
          <section className="detail-section model-import" aria-labelledby="model-import-title">
            <div className="model-import__copy">
              <span className="section-kicker">Local geometry</span>
              <h2 id="model-import-title">Materialize your own model.</h2>
              <p className="hero-summary" id="model-import-help">
                Choose one self-contained GLB 2.0 file. Echoes uses only its triangle geometry,
                centers and scales it to fit, samples up to 64K points, and divides the result into
                four reveal sections.
              </p>
              <p className="model-import__privacy">
                The file is processed in memory in this browser tab. It is never uploaded, stored,
                or included in analytics.
              </p>
            </div>
            <div
              className="model-import__panel"
              aria-busy={modelImport.phase === "reading"}
            >
              <div className="model-import__target">
                <span>Current target</span>
                <strong title={modelFileName ?? undefined}>
                  {modelFileName ?? "Procedural torus knot"}
                </strong>
                <small>
                  {pointCloud
                    ? `${pointCloud.meshCount} ${pointCloud.meshCount === 1 ? "mesh" : "meshes"} · ${Math.round(pointCloud.count / 1024)}K sampled particles · local only`
                    : "Built-in deterministic geometry"}
                </small>
              </div>
              <p className="model-import__requirements" id="model-import-requirements">
                GLB 2.0 · 20 MB maximum · static triangle meshes. Materials, textures, animation,
                cameras, and lights are ignored. Draco, Meshopt, and instancing are not supported.
              </p>
              <div className="model-import__actions">
                <label className="model-import__chooser">
                  <input
                    ref={modelInputRef}
                    type="file"
                    accept=".glb,model/gltf-binary"
                    aria-describedby="model-import-help model-import-requirements model-import-status"
                    disabled={modelImport.phase === "reading"}
                    onChange={importLocalModel}
                  />
                  <span>{pointCloud ? "Replace local GLB" : "Choose local GLB"}</span>
                </label>
                {pointCloud ? (
                  <button
                    className="ghost-button"
                    type="button"
                    disabled={modelImport.phase === "reading"}
                    onClick={restoreProceduralModel}
                  >
                    Restore torus knot
                  </button>
                ) : null}
                {pointCloud ? (
                  <a className="model-import__stage-link" href="#effect-title">
                    View in live stage ↑
                  </a>
                ) : null}
              </div>
              <p
                className={`model-import__status model-import__status--${modelImport.phase}`}
                id="model-import-status"
                role={modelImport.phase === "error" ? "alert" : "status"}
                aria-live={modelImport.phase === "error" ? "assertive" : "polite"}
                aria-atomic="true"
              >
                {modelImport.message}
              </p>
            </div>
          </section>
        ) : null}

        {hasAudio ? (
          <section className="detail-section" aria-labelledby="audio-title">
            <span className="section-kicker">Synthetic signal</span>
            <h2 id="audio-title">Audio response, without a microphone.</h2>
            <p className="hero-summary">
              Automatic mode generates deterministic level and frequency curves. Move any slider
              to hold a manual signal instead.
            </p>
            <button
              className={`ghost-button${automaticAudio ? " is-active" : ""}`}
              type="button"
              aria-pressed={automaticAudio}
              onClick={toggleAutomaticAudio}
            >
              {automaticAudio ? "Automatic signal on" : "Use automatic signal"}
            </button>
            <div className="audio-controls">
              {(Object.keys(audio) as Array<keyof ShaderStageAudio>).map((band) => (
                <label
                  className="audio-control"
                  htmlFor={`audio-${band}`}
                  aria-label={`${band} synthetic audio level`}
                  key={band}
                >
                  <span><span>{band}</span><span>{audio[band].toFixed(2)}</span></span>
                  <input
                    id={`audio-${band}`}
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={audio[band]}
                    onChange={(event) => setAudioBand(band, Number(event.target.value))}
                  />
                </label>
              ))}
            </div>
          </section>
        ) : null}

        <SourceBrowser effectId={effect.id} heading={effect.seo.sourceHeading} sources={sources} />
      </div>
    </>
  );
}

function ClassificationRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="classification-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
