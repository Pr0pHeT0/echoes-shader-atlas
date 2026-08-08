"use client";

import { useEffect, useRef, useState } from "react";
import type { WebGPURenderer } from "three/webgpu";
import { createEffectRuntime } from "@/lib/effects/runtime-registry";
import { ShaderStageController } from "@/lib/effects/stage-controller";
import type { StageEnvironment, StageQuality } from "@/lib/effects/stage-controller";
import type {
  AudioMetrics,
  EffectId,
  MaterializationPointCloud,
  StylizedPointTarget,
} from "@/lib/effects/types";

export type ShaderStageAudio = AudioMetrics;
export type ShaderStageQuality = StageQuality;
export type ShaderStageRenderer = "webgpu" | "webgl2";

type ShaderStageProps = {
  effectId: EffectId;
  preset?: string;
  paused?: boolean;
  quality?: ShaderStageQuality;
  rendererMode?: ShaderStageRenderer;
  syntheticAudio?: boolean;
  audio?: ShaderStageAudio;
  pointCloud?: MaterializationPointCloud | null;
  pointTarget?: StylizedPointTarget;
  label: string;
};

const ZERO_AUDIO: ShaderStageAudio = { level: 0, bass: 0, mid: 0, treble: 0 };

function createBrowserEnvironment(): StageEnvironment {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return {
    now: () => performance.now(),
    requestAnimationFrame: (callback) => window.requestAnimationFrame(callback),
    cancelAnimationFrame: (handle) => window.cancelAnimationFrame(handle),
    isDocumentHidden: () => document.hidden,
    matchMedia: (query) => window.matchMedia(query),
    devicePixelRatio: window.devicePixelRatio || 1,
    hardwareConcurrency: navigator.hardwareConcurrency || 8,
    saveData: Boolean(connection?.saveData),
    addWindowListener: (type, listener) => window.addEventListener(type, listener),
    removeWindowListener: (type, listener) => window.removeEventListener(type, listener),
    createResizeObserver: typeof ResizeObserver === "undefined"
      ? undefined
      : (callback) => new ResizeObserver(callback),
  };
}

export function ShaderStage({
  effectId,
  preset,
  paused = false,
  quality = "auto",
  rendererMode,
  syntheticAudio = false,
  audio = ZERO_AUDIO,
  pointCloud = null,
  pointTarget,
  label,
}: ShaderStageProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<ShaderStageController | null>(null);
  const mountedEffectRef = useRef(effectId);
  const latestPropsRef = useRef({
    effectId,
    preset,
    paused,
    syntheticAudio,
    audio,
    pointCloud,
    pointTarget,
  });
  const [failure, setFailure] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    latestPropsRef.current = {
      effectId,
      preset,
      paused,
      syntheticAudio,
      audio,
      pointCloud,
      pointTarget,
    };
  }, [audio, effectId, paused, pointCloud, pointTarget, preset, syntheticAudio]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    let cancelled = false;
    let activeController: ShaderStageController | null = null;

    // Let the static heading and copy paint before parsing Three.js and
    // creating a GPU context. The shader remains the hero, but no longer
    // blocks the page's first useful render on constrained devices.
    const prepareTimer = window.setTimeout(() => {
      void import("three/webgpu").then((THREE) => {
        if (cancelled) return;
        const initial = latestPropsRef.current;
        const forceWebGL = rendererMode === "webgl2"
          || (rendererMode === undefined
            && new URLSearchParams(window.location.search).get("renderer") === "webgl2");
        mountedEffectRef.current = initial.effectId;
        const controller = new ShaderStageController({
          effectId: initial.effectId,
          quality,
          host,
          canvas,
          environment: createBrowserEnvironment(),
          preset: initial.preset,
          paused: initial.paused,
          syntheticAudio: initial.syntheticAudio,
          audio: initial.audio,
          pointCloud: initial.pointCloud,
          pointTarget: initial.pointTarget,
          createRenderer: (stageCanvas, stageQuality) => {
            const renderer = new THREE.WebGPURenderer({
              canvas: stageCanvas as HTMLCanvasElement,
              antialias: stageQuality !== "low",
              alpha: false,
              depth: true,
              forceWebGL,
              powerPreference: "high-performance",
            });
            renderer.outputColorSpace = THREE.SRGBColorSpace;
            renderer.setClearColor(0x030506, 1);
            return renderer;
          },
          createEffect: (id, context) => createEffectRuntime(id, {
            ...context,
            renderer: context.renderer as WebGPURenderer,
          }),
          onStatus: (status) => {
            setLoading(status.loading);
            setFailure(status.failure);
          },
        });
        activeController = controller;
        controllerRef.current = controller;
        void controller.mount();
      }).catch(() => {
        if (!cancelled) {
          setLoading(false);
          setFailure("The WebGPU/WebGL2 runtime could not be loaded in this browser.");
        }
      });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(prepareTimer);
      controllerRef.current = null;
      activeController?.dispose();
    };
  }, [quality, rendererMode]);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller || mountedEffectRef.current === effectId) return;
    mountedEffectRef.current = effectId;
    void controller.switchEffect(effectId, preset);
  }, [effectId, preset]);

  useEffect(() => {
    controllerRef.current?.setPreset(preset);
  }, [preset]);

  useEffect(() => {
    controllerRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    controllerRef.current?.setSyntheticAudio(syntheticAudio);
  }, [syntheticAudio]);

  useEffect(() => {
    controllerRef.current?.setAudio(audio);
  }, [audio]);

  return (
    <div
      className={`shader-stage shader-stage--${effectId}${preset ? ` shader-stage--preset-${preset}` : ""}${paused ? " shader-stage--paused" : ""}`}
      ref={hostRef}
      aria-busy={loading}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label}
      />
      {failure ? (
        <div className="shader-stage__fallback" role="status" aria-live="polite">
          <div>
            <strong>Static study mode</strong>
            <p>{failure} The extracted source and classification remain available below.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
