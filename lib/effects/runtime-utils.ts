import * as THREE from "three";

import type { AudioMetrics, EffectRuntimeContext } from "./types";

export const CONSTRAINED_PARTICLE_COUNT = 16_384;
export const FULL_PARTICLE_COUNT = 65_536;
export const MAX_DPR = 1.5;
export const MATERIALIZATION_POINT_SIZE_MIN = 0.028;
export const MATERIALIZATION_POINT_SIZE_MAX = 0.07;

export function clampDpr(dpr: number): number {
  return THREE.MathUtils.clamp(Number.isFinite(dpr) ? dpr : 1, 0.5, MAX_DPR);
}

export function resolveParticleCount(context: Pick<EffectRuntimeContext, "particleCount" | "reducedMotion">): number {
  const cap = context.reducedMotion ? CONSTRAINED_PARTICLE_COUNT : FULL_PARTICLE_COUNT;
  const requested = Number.isFinite(context.particleCount) ? Math.floor(context.particleCount) : cap;
  return THREE.MathUtils.clamp(requested, 1_024, cap);
}

/**
 * Keeps dense imported models legible without letting simple models become pinpricks.
 * The logarithmic curve reacts to both surface detail and multi-mesh scene complexity.
 */
export function resolveMaterializationPointSize(triangleCount: number, meshCount: number): number {
  const safeTriangles = THREE.MathUtils.clamp(
    Number.isFinite(triangleCount) ? Math.max(0, Math.floor(triangleCount)) : 0,
    0,
    1_000_000,
  );
  const safeMeshes = THREE.MathUtils.clamp(
    Number.isFinite(meshCount) ? Math.max(0, Math.floor(meshCount)) : 0,
    0,
    512,
  );
  const triangleComplexity = Math.log10(1 + safeTriangles) / Math.log10(1_000_001);
  const meshComplexity = Math.log10(1 + safeMeshes) / Math.log10(513);
  const complexity = THREE.MathUtils.clamp(
    triangleComplexity * 0.84 + meshComplexity * 0.16,
    0,
    1,
  );
  return THREE.MathUtils.lerp(
    MATERIALIZATION_POINT_SIZE_MAX,
    MATERIALIZATION_POINT_SIZE_MIN,
    complexity,
  );
}

export function clampAudio(audio: Partial<AudioMetrics> | null | undefined): AudioMetrics {
  const value = (channel: keyof AudioMetrics) => THREE.MathUtils.clamp(Number(audio?.[channel]) || 0, 0, 1);
  return {
    level: value("level"),
    bass: value("bass"),
    mid: value("mid"),
    treble: value("treble"),
  };
}

export function syntheticAudio(elapsed: number, audio?: Partial<AudioMetrics> | null): AudioMetrics {
  if (audio) return clampAudio(audio);
  const bass = 0.24 + Math.sin(elapsed * 1.31) * 0.13 + Math.sin(elapsed * 0.37) * 0.06;
  const mid = 0.28 + Math.sin(elapsed * 2.17 + 1.2) * 0.11;
  const treble = 0.22 + Math.sin(elapsed * 4.73 + 2.4) * 0.09;
  return clampAudio({
    bass,
    mid,
    treble,
    level: bass * 0.46 + mid * 0.34 + treble * 0.2,
  });
}

export function makeShowcaseScene(
  width: number,
  height: number,
  cameraPosition = new THREE.Vector3(0, 0, 9),
): { scene: THREE.Scene; camera: THREE.PerspectiveCamera } {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x03060d);
  const camera = new THREE.PerspectiveCamera(45, Math.max(1, width) / Math.max(1, height), 0.01, 100);
  camera.position.copy(cameraPosition);
  camera.lookAt(0, 0, 0);
  scene.add(camera);
  return { scene, camera };
}

export function disposeObjectTree(root: THREE.Object3D): void {
  root.traverse((object) => {
    const renderable = object as THREE.Mesh;
    renderable.geometry?.dispose?.();
    const materials = Array.isArray(renderable.material) ? renderable.material : [renderable.material];
    for (const material of materials) material?.dispose?.();
  });
  root.clear();
}
