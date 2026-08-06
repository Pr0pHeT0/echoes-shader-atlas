"use client";

import { useMemo, useState } from "react";
import { effectFamilies, shaderEffects } from "@/lib/catalog/effects";
import type { EffectFamily, EffectId, EffectStatus } from "@/lib/catalog/types";
import { trackEvent } from "@/lib/analytics";
import { SITE_GITHUB_URL } from "@/lib/site";
import { ShaderStage } from "./ShaderStage";

const driverFilters = ["all", "Pointer", "Synthetic level", "Reveal progress", "Local geometry"] as const;

export function HomeGallery() {
  const [selectedId, setSelectedId] = useState<EffectId>(shaderEffects[0].id);
  const [family, setFamily] = useState<EffectFamily | "all">("all");
  const [driver, setDriver] = useState<(typeof driverFilters)[number]>("all");
  const [status, setStatus] = useState<EffectStatus | "all">("all");

  const selected = shaderEffects.find((effect) => effect.id === selectedId) ?? shaderEffects[0];
  const filtered = useMemo(
    () => shaderEffects.filter((effect) => {
      if (family !== "all" && effect.family !== family) return false;
      if (status !== "all" && effect.status !== status) return false;
      if (driver !== "all" && !effect.drivers.includes(driver)) return false;
      return true;
    }),
    [driver, family, status],
  );
  function selectEffect(effectId: EffectId) {
    setSelectedId(effectId);
    trackEvent("effect_select", { effect_id: effectId, placement: "home_reel" });
  }

  function setCatalogFilter(filterType: "family" | "driver" | "state", value: string) {
    trackEvent("catalog_filter", { filter_type: filterType, filter_value: value });
  }

  return (
    <>
      <section className="atlas-hero" aria-labelledby="hero-title">
        <ShaderStage
          effectId={selected.id}
          preset={selected.presets[0]?.id}
          syntheticAudio={selected.drivers.some((driverName) => driverName.startsWith("Synthetic"))}
          label={`${selected.name} live shader preview`}
        />
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-content">
          <div className="hero-copy">
            <div className="hero-index">
              <strong>{String(selected.index).padStart(2, "0")}</strong>
              <span aria-hidden="true" />
              <span>{selected.family}</span>
              {selected.status === "archived" ? <span>Archived study</span> : null}
            </div>
            <h1 className="hero-title" id="hero-title">
              Open-source <span>GLSL shaders.</span>
            </h1>
            <div className="hero-study-heading" aria-live="polite">
              <span>Featured study</span>
              <h2>{selected.name}</h2>
            </div>
            <p className="hero-summary">
              Explore five live WebGL2 studies with readable GLSL source, interactive controls,
              implementation notes, and MIT-licensed project code. Now viewing: {selected.summary}
            </p>
            <div className="hero-actions">
              <a
                className="primary-link"
                href={`/effects/${selected.slug}`}
                onClick={() => trackEvent("study_open", {
                  effect_id: selected.id,
                  placement: "home_hero",
                })}
              >
                Explore {selected.shortName} <span aria-hidden="true">↗</span>
              </a>
            </div>
          </div>

          <div className="effect-reel" aria-label="Choose a shader system">
            <div className="effect-reel__label">
              <span>Live index</span>
              <span>05 systems</span>
            </div>
            {shaderEffects.map((effect) => (
              <button
                key={effect.id}
                className={effect.id === selected.id ? "is-active" : ""}
                type="button"
                aria-pressed={effect.id === selected.id}
                onClick={() => selectEffect(effect.id)}
              >
                <span className="effect-reel__number">{String(effect.index).padStart(2, "0")}</span>
                <span className="effect-reel__name">{effect.shortName}</span>
                <span className="effect-reel__type">{effect.status === "archived" ? "Archive" : "Live"}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="catalog-section" id="catalog" aria-labelledby="catalog-title">
        <div className="catalog-heading">
          <div>
            <span className="section-kicker">Shader index</span>
            <h2 id="catalog-title">Open source shaders.</h2>
          </div>
          <p>
            Compare each shader by its render primitive, input signal, motion model, and GPU
            pipeline. Filter the collection, then open any study to inspect the GLSL.
          </p>
        </div>

        <div className="catalog-filters" aria-label="Filter shader systems">
          <FilterRow label="Family">
            <FilterButton active={family === "all"} onClick={() => {
              setFamily("all");
              setCatalogFilter("family", "all");
            }}>All</FilterButton>
            {effectFamilies.map((value) => (
              <FilterButton key={value} active={family === value} onClick={() => {
                setFamily(value);
                setCatalogFilter("family", value);
              }}>
                {value}
              </FilterButton>
            ))}
          </FilterRow>
          <FilterRow label="Driver">
            {driverFilters.map((value) => (
              <FilterButton key={value} active={driver === value} onClick={() => {
                setDriver(value);
                setCatalogFilter("driver", value);
              }}>
                {value === "all" ? "All" : value}
              </FilterButton>
            ))}
          </FilterRow>
          <FilterRow label="State">
            {(["all", "active", "archived"] as const).map((value) => (
              <FilterButton key={value} active={status === value} onClick={() => {
                setStatus(value);
                setCatalogFilter("state", value);
              }}>
                {value === "all" ? "All" : value}
              </FilterButton>
            ))}
          </FilterRow>
        </div>

        <div className="effect-grid">
          {filtered.map((effect) => (
            <article
              className="effect-card"
              key={effect.id}
              style={{
                "--card-accent": effect.accent.primary,
                "--card-image": `url("/effect-previews/${effect.slug}.png")`,
              } as React.CSSProperties}
            >
              <div className="effect-card__visual" aria-hidden="true" />
              <span className="effect-card__number" aria-hidden="true">
                {String(effect.index).padStart(2, "0")}
              </span>
              <div className="effect-card__body">
                <div className="effect-card__meta">
                  <span>{effect.family}</span>
                  <span>·</span>
                  <span>{effect.statusLabel}</span>
                </div>
                <h3>{effect.name}</h3>
                <p>{effect.summary}</p>
                <a
                  className="effect-card__link"
                  href={`/effects/${effect.slug}`}
                  onClick={() => trackEvent("study_open", {
                    effect_id: effect.id,
                    placement: "catalog_card",
                  })}
                >
                  Open {effect.shortName} shader study <span aria-hidden="true">→</span>
                </a>
              </div>
            </article>
          ))}
          {filtered.length === 0 ? (
            <div className="empty-state">No system matches this classification.</div>
          ) : null}
        </div>
      </section>

      <section className="editorial-section" aria-labelledby="open-source-title">
        <div className="editorial-section__copy">
          <span className="section-kicker">Fully open source</span>
          <h2 id="open-source-title">Read the code.<br />Remix the shaders.</h2>
          <p>
            Every shader, runtime, control, procedural geometry generator, and test lives in the
            public repository under the MIT License. Fork it, study it, and make it your own.
          </p>
          <a className="text-link" href={SITE_GITHUB_URL} target="_blank" rel="noreferrer">
            Explore the GitHub repository <span aria-hidden="true">↗</span>
          </a>
        </div>
        <div className="editorial-stats" aria-label="Open-source project statistics">
          <div className="editorial-stat"><strong>05</strong><span>Open-source shader studies</span></div>
          <div className="editorial-stat"><strong>13</strong><span>Readable GLSL source units</span></div>
          <div className="editorial-stat"><strong>07</strong><span>Documented GPU programs</span></div>
          <div className="editorial-stat"><strong>MIT</strong><span>Permissive project license</span></div>
        </div>
      </section>
    </>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="filter-row">
      <span>{label}</span>
      <div className="filter-options" role="group" aria-label={label + " filter"}>
        {children}
      </div>
    </div>
  );
}

function FilterButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button className={active ? "is-active" : ""} type="button" aria-pressed={active} onClick={onClick}>
      {children}
    </button>
  );
}
