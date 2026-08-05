uniform vec2 uResolution;
uniform float uSize;
uniform sampler2D uParticlesTexture;
uniform float uReveal;
uniform float uTime;
uniform float uPixelRatio;
uniform float uPointSizeScale;
uniform float uInitialPopulation;

attribute vec2 aParticlesUv;
attribute vec3 aColor;
attribute float aSize;
attribute float aRevealSeed;
attribute vec3 aOrbPosition;

varying vec3 vColor;
varying float vFogDepth;
varying float vOpacity;
varying float vReveal;

void main() {
  vec4 particle = texture(uParticlesTexture, aParticlesUv);

  float revealEase = uReveal * uReveal * (3.0 - 2.0 * uReveal);
  vec3 revealedPosition = mix(aOrbPosition, particle.xyz, revealEase);
  vec4 modelPosition = modelMatrix * vec4(revealedPosition, 1.0);
  vec4 viewPosition = viewMatrix * modelPosition;
  gl_Position = projectionMatrix * viewPosition;

  float sizeIn = smoothstep(0.0, 0.6, particle.a);
  float sizeOut = 1.0 - smoothstep(0.6, 1.0, particle.a);
  float size = min(sizeIn, sizeOut);

  float scenePointSize = size * aSize * uSize * uResolution.y / -viewPosition.z;
  float orbLifetime = particle.a;
  float orbLifeIn = smoothstep(0.0, 0.22, orbLifetime);
  float orbLifeOut = 1.0 - smoothstep(0.68, 1.0, orbLifetime);
  float orbLifeEnvelope = min(orbLifeIn, orbLifeOut);
  float orbLifeSize = mix(0.48, 1.0, orbLifeEnvelope);
  float orbDepthScale = 9.0 / max(1.0, -viewPosition.z);
  float orbPointSize = mix(1.5, 3.1, aSize) * uPixelRatio * orbDepthScale * orbLifeSize;
  gl_PointSize = mix(orbPointSize, scenePointSize, revealEase) * uPointSizeScale;

  vec3 pearl = vec3(0.92, 0.98, 1.0);
  vec3 orbSilver = mix(vec3(0.25, 0.30, 0.32), pearl, 0.15 + aSize * 0.10);
  vec3 orbAccent = mix(
    vec3(0.12, 0.86, 1.0),
    vec3(0.50, 0.36, 1.0),
    smoothstep(-0.82, 0.82, aOrbPosition.x)
  );
  vec3 orbColor = mix(orbAccent, orbSilver, 0.88);
  float orbShimmer = 0.78 + 0.22 * sin(uTime * 2.1 + aSize * 31.0 + particle.a * 6.2831853);
  vColor = mix(orbColor * orbShimmer, aColor, revealEase);
  vFogDepth = -viewPosition.z;
  float activePopulation = mix(uInitialPopulation, 1.0, revealEase);
  float populationOpacity = 1.0 - smoothstep(activePopulation, activePopulation + 0.018, aRevealSeed);
  float orbLayerOpacity = mix(0.42, 1.0, step(0.5, fract(aSize * 17.73)));
  float orbLifeAlpha = mix(0.46, 1.0, orbLifeEnvelope);
  float orbOpacity = orbLayerOpacity * 0.82 * orbLifeAlpha;
  vOpacity = populationOpacity * mix(orbOpacity, 1.0, revealEase);
  vReveal = revealEase;
}
