import type {
  AudioMetrics,
  EffectFrame,
  EffectId,
  EffectInstance,
  EffectPointer,
  MaterializationPointCloud,
} from "./types";

export type StageQuality = "low" | "auto" | "high";

export interface StageDeviceLostInfo {
  api: "WebGL" | "WebGPU";
  message: string;
  reason: string | null;
  originalEvent: unknown;
}

export interface StageRenderer {
  init(): Promise<unknown>;
  render(scene: EffectInstance["scene"], camera: EffectInstance["camera"]): void;
  setPixelRatio(dpr: number): void;
  setSize(width: number, height: number, updateStyle: boolean): void;
  onDeviceLost?: (info: StageDeviceLostInfo) => void;
  dispose(): void;
}

export interface StageHost {
  getBoundingClientRect(): { width: number; height: number; left?: number; top?: number };
}

export interface StageCanvas {
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

export interface StageResizeObserver {
  observe(target: StageHost): void;
  disconnect(): void;
}

export interface StageEnvironment {
  now(): number;
  requestAnimationFrame(callback: FrameRequestCallback): number;
  cancelAnimationFrame(handle: number): void;
  isDocumentHidden(): boolean;
  matchMedia(query: string): { matches: boolean };
  readonly devicePixelRatio: number;
  readonly hardwareConcurrency: number;
  readonly saveData: boolean;
  addWindowListener(type: "resize" | "pointermove" | "pointerout" | "blur", listener: EventListener): void;
  removeWindowListener(type: "resize" | "pointermove" | "pointerout" | "blur", listener: EventListener): void;
  createResizeObserver?(callback: () => void): StageResizeObserver;
}

export interface StageRuntimeContext {
  renderer: StageRenderer;
  width: number;
  height: number;
  dpr: number;
  particleCount: number;
  reducedMotion: boolean;
  pointCloud?: MaterializationPointCloud | null;
}

export interface StageStatus {
  loading: boolean;
  failure: string | null;
}

export interface StageControllerOptions {
  effectId: EffectId;
  quality: StageQuality;
  host: StageHost;
  canvas: StageCanvas;
  environment: StageEnvironment;
  createRenderer(canvas: StageCanvas, quality: StageQuality): StageRenderer | Promise<StageRenderer>;
  createEffect(effectId: EffectId, context: StageRuntimeContext): Promise<EffectInstance>;
  onStatus(status: StageStatus): void;
  preset?: string;
  paused?: boolean;
  syntheticAudio?: boolean;
  audio?: AudioMetrics;
  pointCloud?: MaterializationPointCloud | null;
}

const ZERO_AUDIO: AudioMetrics = { level: 0, bass: 0, mid: 0, treble: 0 };
export function syntheticStageAudio(elapsed: number): AudioMetrics {
  const pulse = (frequency: number, phase = 0) => 0.5 + 0.5 * Math.sin(elapsed * frequency + phase);
  return {
    level: 0.28 + pulse(1.15) * 0.42,
    bass: 0.18 + Math.pow(pulse(0.72, 0.8), 2) * 0.68,
    mid: 0.2 + pulse(1.46, 2.1) * 0.58,
    treble: 0.12 + Math.pow(pulse(2.62, 4.2), 3) * 0.7,
  };
}

export function selectStageParticleCount(
  quality: StageQuality,
  environment: Pick<StageEnvironment, "hardwareConcurrency" | "saveData" | "matchMedia">,
): number {
  if (quality === "low") return 16_384;
  if (quality === "high") return 65_536;
  const constrained = environment.saveData
    || environment.hardwareConcurrency <= 4
    || environment.matchMedia("(max-width: 760px)").matches;
  return constrained ? 16_384 : 65_536;
}

/** Owns one canvas renderer and exactly one lazily-created effect instance. */
export class ShaderStageController {
  private readonly options: StageControllerOptions;
  private readonly reducedMotion: boolean;
  private readonly dpr: number;
  private readonly particleCount: number;
  private renderer: StageRenderer | null = null;
  private instance: EffectInstance | null = null;
  private resizeObserver: StageResizeObserver | null = null;
  private animationFrame = 0;
  private generation = 0;
  private mounted = false;
  private disposed = false;
  private deviceLost = false;
  private rebuildingRenderer = false;
  private rendererRebuildRequested = false;
  private rendererGeneration = 0;
  private previousFrameTime = 0;
  private activeElapsed = 0;
  private effectId: EffectId;
  private preset?: string;
  private paused: boolean;
  private useSyntheticAudio: boolean;
  private audio: AudioMetrics;
  private pointCloud: MaterializationPointCloud | null;
  private pointer: EffectPointer | null = null;

  constructor(options: StageControllerOptions) {
    this.options = options;
    this.effectId = options.effectId;
    this.preset = options.preset;
    this.paused = options.paused ?? false;
    this.useSyntheticAudio = options.syntheticAudio ?? false;
    this.audio = options.audio ?? ZERO_AUDIO;
    this.pointCloud = options.pointCloud ?? null;
    this.reducedMotion = options.environment.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.dpr = Math.min(Math.max(options.environment.devicePixelRatio || 1, 0.5), 1.5);
    this.particleCount = selectStageParticleCount(options.quality, options.environment);
  }

  async mount(): Promise<boolean> {
    if (this.mounted || this.disposed) return false;
    this.mounted = true;
    if (!await this.initializeRenderer()) return false;

    this.options.environment.addWindowListener("resize", this.onResize);
    this.options.environment.addWindowListener("pointermove", this.onPointerMove);
    this.options.environment.addWindowListener("pointerout", this.onPointerOut);
    this.options.environment.addWindowListener("blur", this.onPointerClear);
    this.resizeObserver = this.options.environment.createResizeObserver?.(() => this.resize()) ?? null;
    this.resizeObserver?.observe(this.options.host);
    this.resize();
    this.previousFrameTime = this.options.environment.now();
    const loaded = await this.switchEffect(this.effectId, this.preset);
    if (loaded) this.startAnimationLoop();
    return loaded;
  }

  async switchEffect(effectId: EffectId, preset = this.preset): Promise<boolean> {
    if (this.disposed) return false;
    this.effectId = effectId;
    this.preset = preset;
    if (!this.renderer) return false;
    const generation = ++this.generation;
    const previous = this.instance;
    this.instance = null;
    previous?.dispose();
    this.setStatus({ loading: true, failure: null });
    const { width, height } = this.measure();
    let instance: EffectInstance | null = null;

    try {
      instance = await this.options.createEffect(effectId, {
        renderer: this.renderer,
        width,
        height,
        dpr: this.dpr,
        particleCount: this.particleCount,
        reducedMotion: this.reducedMotion,
        pointCloud: this.pointCloud,
      });
      if (this.disposed || generation !== this.generation) {
        instance.dispose();
        return false;
      }
      this.instance = instance;
      this.activeElapsed = 0;
      this.previousFrameTime = this.options.environment.now();
      if (this.preset) instance.setPreset(this.preset);
      const currentSize = this.measure();
      instance.resize(currentSize.width, currentSize.height, this.dpr);
      this.renderStaticFrame();
      this.setStatus({ loading: false, failure: null });
      return true;
    } catch (error) {
      if (instance) {
        if (this.instance === instance) this.instance = null;
        instance.dispose();
      }
      if (!this.disposed && generation === this.generation) {
        console.error("Shader runtime failed to load", error);
        this.setStatus({
          loading: false,
          failure: "This shader study could not be prepared on the current GPU.",
        });
      }
      return false;
    }
  }

  setPreset(preset?: string): void {
    this.preset = preset;
    if (preset) this.instance?.setPreset(preset);
    if (this.paused || this.reducedMotion) this.renderStaticFrame();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.renderStaticFrame();
  }

  setSyntheticAudio(enabled: boolean): void {
    this.useSyntheticAudio = enabled;
    if (this.paused || this.reducedMotion) this.renderStaticFrame();
  }

  setAudio(audio: AudioMetrics): void {
    this.audio = audio;
    if (this.paused || this.reducedMotion) this.renderStaticFrame();
  }

  setPointer(pointer: EffectPointer | null): void {
    this.pointer = pointer;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    this.rendererGeneration += 1;
    if (this.animationFrame) this.options.environment.cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.options.environment.removeWindowListener("resize", this.onResize);
    this.options.environment.removeWindowListener("pointermove", this.onPointerMove);
    this.options.environment.removeWindowListener("pointerout", this.onPointerOut);
    this.options.environment.removeWindowListener("blur", this.onPointerClear);
    this.instance?.dispose();
    this.instance = null;
    this.renderer?.dispose();
    this.renderer = null;
  }

  private setStatus(status: StageStatus): void {
    if (!this.disposed) this.options.onStatus(status);
  }

  private measure(): { width: number; height: number } {
    const bounds = this.options.host.getBoundingClientRect();
    return {
      width: Math.max(1, Math.round(bounds.width)),
      height: Math.max(1, Math.round(bounds.height)),
    };
  }

  private resize(): void {
    if (!this.renderer) return;
    const { width, height } = this.measure();
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(width, height, false);
    this.instance?.resize(width, height, this.dpr);
  }

  private startAnimationLoop(): void {
    if (
      this.reducedMotion
      || this.animationFrame
      || this.disposed
      || this.deviceLost
      || !this.renderer
    ) return;
    this.animationFrame = this.options.environment.requestAnimationFrame(this.frame);
  }

  private renderStaticFrame(): void {
    if (!this.renderer || !this.instance || this.deviceLost) return;
    const elapsed = this.reducedMotion ? 0 : this.activeElapsed;
    this.instance.update({
      elapsed,
      delta: 0,
      static: this.paused || this.reducedMotion,
      pointer: this.pointer,
      audio: this.useSyntheticAudio ? syntheticStageAudio(elapsed) : this.audio,
    });
    this.renderer.render(this.instance.scene, this.instance.camera);
  }

  private readonly frame: FrameRequestCallback = (now) => {
    this.animationFrame = 0;
    if (this.disposed || this.deviceLost) return;
    this.startAnimationLoop();
    const rawDelta = Math.min(Math.max((now - this.previousFrameTime) / 1_000, 0), 0.05);
    this.previousFrameTime = now;
    if (!this.renderer || !this.instance || this.options.environment.isDocumentHidden() || this.paused) return;

    const delta = this.reducedMotion ? 0 : rawDelta;
    if (!this.reducedMotion) this.activeElapsed += delta;
    const elapsed = this.reducedMotion ? 0 : this.activeElapsed;
    const frame: EffectFrame = {
      elapsed,
      delta,
      pointer: this.pointer,
      audio: this.useSyntheticAudio ? syntheticStageAudio(elapsed) : this.audio,
    };
    this.instance.update(frame);
    this.renderer.render(this.instance.scene, this.instance.camera);
  };

  private readonly onResize: EventListener = () => {
    this.resize();
  };

  private readonly onPointerMove: EventListener = (event) => {
    const pointerEvent = event as PointerEvent;
    const bounds = this.options.host.getBoundingClientRect();
    const left = bounds.left ?? 0;
    const top = bounds.top ?? 0;
    if (
      pointerEvent.clientX < left
      || pointerEvent.clientX > left + bounds.width
      || pointerEvent.clientY < top
      || pointerEvent.clientY > top + bounds.height
    ) {
      this.pointer = null;
      return;
    }
    this.pointer = {
      x: ((pointerEvent.clientX - left) / Math.max(bounds.width, 1)) * 2 - 1,
      y: -(((pointerEvent.clientY - top) / Math.max(bounds.height, 1)) * 2 - 1),
    };
  };

  private readonly onPointerOut: EventListener = (event) => {
    if ((event as PointerEvent).relatedTarget === null) this.pointer = null;
  };

  private readonly onPointerClear: EventListener = () => {
    this.pointer = null;
  };

  private onDeviceLost(
    info: StageDeviceLostInfo,
    renderer: StageRenderer,
  ): void {
    if (this.disposed) return;
    this.deviceLost = true;
    if (this.animationFrame) this.options.environment.cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;
    this.setStatus({
      loading: false,
      failure: info.api === "WebGPU"
        ? "The WebGPU device was lost. Rebuilding the renderer."
        : "The WebGL2 context was lost. Reload the page to restart graphics.",
    });
    if (info.api === "WebGPU" && this.renderer === renderer) {
      if (this.rebuildingRenderer) {
        this.rendererRebuildRequested = true;
      } else {
        void this.rebuildRenderer();
      }
    }
  }

  private async initializeRenderer(): Promise<boolean> {
    const rendererGeneration = ++this.rendererGeneration;
    let renderer: StageRenderer | null = null;
    const initializationState: { loss: StageDeviceLostInfo | null } = { loss: null };
    try {
      renderer = await this.options.createRenderer(this.options.canvas, this.options.quality);
      const candidateRenderer = renderer;
      const defaultOnDeviceLost = candidateRenderer.onDeviceLost?.bind(candidateRenderer);
      candidateRenderer.onDeviceLost = (info) => {
        defaultOnDeviceLost?.(info);
        if (this.disposed || rendererGeneration !== this.rendererGeneration) return;
        if (this.renderer !== candidateRenderer) initializationState.loss = info;
        this.onDeviceLost(info, candidateRenderer);
      };
      await candidateRenderer.init();
      if (this.disposed || rendererGeneration !== this.rendererGeneration) {
        candidateRenderer.dispose();
        return false;
      }
      const initializationLoss = initializationState.loss;
      if (initializationLoss) {
        candidateRenderer.dispose();
        return initializationLoss.api === "WebGPU"
          ? this.initializeRenderer()
          : false;
      }
      this.deviceLost = false;
      this.renderer = candidateRenderer;
      candidateRenderer.setPixelRatio(this.dpr);
      return true;
    } catch (error) {
      renderer?.dispose();
      if (this.disposed || rendererGeneration !== this.rendererGeneration) return false;
      const initializationLoss = initializationState.loss;
      if (initializationLoss) {
        return initializationLoss.api === "WebGPU"
          ? this.initializeRenderer()
          : false;
      }
      console.error("GPU renderer failed to initialize", error);
      this.setStatus({
        loading: false,
        failure: "The WebGPU/WebGL2 renderer could not be initialized in this browser.",
      });
      return false;
    }
  }

  private async rebuildRenderer(): Promise<boolean> {
    if (this.disposed || this.rebuildingRenderer) return false;
    this.rebuildingRenderer = true;
    this.generation += 1;
    this.instance?.dispose();
    this.instance = null;
    const previousRenderer = this.renderer;
    this.renderer = null;
    previousRenderer?.dispose();

    const initialized = await this.initializeRenderer();
    if (!initialized || this.disposed) {
      this.rebuildingRenderer = false;
      return false;
    }

    if (this.rendererRebuildRequested) {
      this.rendererRebuildRequested = false;
      this.rebuildingRenderer = false;
      return this.rebuildRenderer();
    }
    if (this.deviceLost) {
      this.rebuildingRenderer = false;
      return false;
    }
    this.resize();
    this.previousFrameTime = this.options.environment.now();
    const loaded = await this.switchEffect(this.effectId, this.preset);
    if (this.rendererRebuildRequested) {
      this.rendererRebuildRequested = false;
      this.rebuildingRenderer = false;
      return this.rebuildRenderer();
    }
    if (this.deviceLost) {
      this.rebuildingRenderer = false;
      return false;
    }
    this.rebuildingRenderer = false;
    if (loaded) this.startAnimationLoop();
    return loaded;
  }
}
