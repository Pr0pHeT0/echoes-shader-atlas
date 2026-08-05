"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { createEffectRuntime } from "@/lib/effects";
import { ShaderStageController } from "@/lib/effects/stage-controller";
import type { StageEnvironment, StageQuality } from "@/lib/effects/stage-controller";
import type { AudioMetrics, EffectId } from "@/lib/effects";

export type ShaderStageAudio = AudioMetrics;
export type ShaderStageQuality = StageQuality;

type ShaderStageProps = {
  effectId: EffectId;
  preset?: string;
  paused?: boolean;
  quality?: ShaderStageQuality;
  syntheticAudio?: boolean;
  audio?: ShaderStageAudio;
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
  syntheticAudio = false,
  audio = ZERO_AUDIO,
  label,
}: ShaderStageProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<ShaderStageController | null>(null);
  const mountedEffectRef = useRef(effectId);
  const latestPropsRef = useRef({ effectId, preset, paused, syntheticAudio, audio });
  const [failure, setFailure] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    latestPropsRef.current = { effectId, preset, paused, syntheticAudio, audio };
  }, [audio, effectId, paused, preset, syntheticAudio]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const initial = latestPropsRef.current;
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
      createRenderer: (stageCanvas, context, stageQuality) => {
        const renderer = new THREE.WebGLRenderer({
          canvas: stageCanvas as HTMLCanvasElement,
          context: context as WebGL2RenderingContext,
          antialias: stageQuality !== "low",
          alpha: false,
          powerPreference: "high-performance",
        });
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setClearColor(0x030506, 1);
        return renderer;
      },
      createEffect: (id, context) => createEffectRuntime(id, {
        ...context,
        renderer: context.renderer as THREE.WebGLRenderer,
      }),
      onStatus: (status) => {
        setLoading(status.loading);
        setFailure(status.failure);
      },
    });
    controllerRef.current = controller;
    void controller.mount();

    return () => {
      controllerRef.current = null;
      controller.dispose();
    };
  }, [quality]);

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
    <div className="shader-stage" ref={hostRef} aria-busy={loading}>
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
