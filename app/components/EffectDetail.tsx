"use client";

import { useMemo, useState } from "react";
import type { ShaderEffectMeta } from "@/lib/catalog/types";
import { effectShaderSources } from "@/lib/effects/source-registry";
import { ShaderStage, type ShaderStageAudio, type ShaderStageQuality } from "./ShaderStage";
import { SourceBrowser } from "./SourceBrowser";

const defaultAudio: ShaderStageAudio = {
  level: 0.5,
  bass: 0.56,
  mid: 0.48,
  treble: 0.42,
};

export function EffectDetail({ effect }: { effect: ShaderEffectMeta }) {
  const [preset, setPreset] = useState(effect.presets[0]?.id ?? "default");
  const [paused, setPaused] = useState(false);
  const [quality, setQuality] = useState<ShaderStageQuality>("auto");
  const [restartKey, setRestartKey] = useState(0);
  const [automaticAudio, setAutomaticAudio] = useState(true);
  const [audio, setAudio] = useState<ShaderStageAudio>(defaultAudio);
  const hasAudio = effect.drivers.some((driver) => driver.startsWith("Synthetic"));
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

  function setAudioBand(band: keyof ShaderStageAudio, value: number) {
    setAutomaticAudio(false);
    setAudio((current) => ({ ...current, [band]: value }));
  }

  return (
    <>
      <section className="detail-hero" aria-labelledby="effect-title">
        <ShaderStage
          key={`${effect.id}-${restartKey}`}
          effectId={effect.id}
          preset={preset}
          paused={paused}
          quality={quality}
          syntheticAudio={automaticAudio}
          audio={audio}
          label={`${effect.name} interactive shader study`}
        />
        <div className="hero-grid" aria-hidden="true" />
        <div className="detail-hero__content">
          <div>
            <span className="section-kicker">{effect.eyebrow}</span>
            <h1 className="detail-hero__title" id="effect-title">{effect.name}</h1>
          </div>
          <p className="detail-hero__summary">{effect.summary}</p>
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
                onClick={() => setPreset(candidate.id)}
              >
                {candidate.label}
              </button>
            ))}
          </div>
          <div className="control-group" role="group" aria-label="Playback">
            <span className="control-group__label">Playback</span>
            <button className="control-button" type="button" onClick={() => setPaused((value) => !value)}>
              {paused ? "Play" : "Pause"}
            </button>
            <button className="control-button" type="button" onClick={() => setRestartKey((value) => value + 1)}>
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
                onClick={() => setQuality(value)}
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
            <h2 id="anatomy-title">Classified by what moves it.</h2>
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
            <div className="technical-notes" aria-label="Compatibility and credits">
              <p>
                <strong>Compatibility</strong>
                The live study requires WebGL2. Source, classification, and notes remain readable
                when graphics are unavailable, animation is disabled, or the context is lost.
              </p>
              <p>
                <strong>Credit</strong>
                First-party GLSL is extracted from commit <code>d018f6d057c8f30144979bbcc95436cfb405d7c5</code>
                {usesAshimaNoise ? "; the shared 4D simplex dependency retains the Ashima MIT notice" : ""}.
              </p>
            </div>
          </div>
        </section>

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
              onClick={() => setAutomaticAudio((value) => !value)}
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

        <SourceBrowser sources={sources} />
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
