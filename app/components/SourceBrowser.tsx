"use client";

/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- The scrollable source viewport needs a keyboard focus target. */

import { useEffect, useMemo, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";

export type DisplayShaderSource = {
  label: string;
  stage: string;
  path: string;
  source: string;
};

export function SourceBrowser({
  effectId,
  heading,
  sources,
}: {
  effectId: string;
  heading: string;
  sources: DisplayShaderSource[];
}) {
  const [activePath, setActivePath] = useState(sources[0]?.path ?? "");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const copyTimeout = useRef<number | null>(null);
  const active = useMemo(
    () => sources.find((source) => source.path === activePath) ?? sources[0],
    [activePath, sources],
  );

  useEffect(() => () => {
    if (copyTimeout.current !== null) window.clearTimeout(copyTimeout.current);
  }, []);

  if (!active) return null;

  async function copySource() {
    if (copyTimeout.current !== null) window.clearTimeout(copyTimeout.current);
    try {
      await navigator.clipboard.writeText(active.source);
      setCopyStatus("copied");
      trackEvent("source_copy", {
        effect_id: effectId,
        result: "success",
        source_path: active.path,
      });
    } catch {
      setCopyStatus("failed");
      trackEvent("source_copy", {
        effect_id: effectId,
        result: "failure",
        source_path: active.path,
      });
    }
    copyTimeout.current = window.setTimeout(() => setCopyStatus("idle"), 1800);
  }

  return (
    <section className="source-browser" aria-labelledby="source-heading">
      <div className="source-browser__heading">
        <div>
          <span className="section-kicker">Extracted source</span>
          <h2 id="source-heading">{heading}</h2>
        </div>
        <button className="copy-button" type="button" onClick={copySource}>
          {copyStatus === "copied" ? "Copied" : "Copy source"}
        </button>
        <span className="visually-hidden" role="status" aria-live="polite">
          {copyStatus === "copied" ? "Shader source copied." : null}
          {copyStatus === "failed" ? "Shader source could not be copied." : null}
        </span>
      </div>
      <div className="source-tabs" role="group" aria-label="Shader source files">
        {sources.map((source) => (
          <button
            key={source.path}
            className={source.path === active.path ? "is-active" : ""}
            type="button"
            aria-pressed={source.path === active.path}
            onClick={() => {
              setActivePath(source.path);
              trackEvent("source_tab_select", {
                effect_id: effectId,
                source_path: source.path,
                source_stage: source.stage,
              });
            }}
          >
            <span>{source.label}</span>
            <small>{source.stage}</small>
          </button>
        ))}
      </div>
      <div className="source-window">
        <div className="source-window__bar">
          <span>{active.path}</span>
          <span>{active.source.split("\n").length} lines</span>
        </div>
        <div
          className="source-scroll"
          role="region"
          aria-label={`${active.label} source code`}
          tabIndex={0}
        >
          <pre><code>{active.source}</code></pre>
        </div>
      </div>
    </section>
  );
}
