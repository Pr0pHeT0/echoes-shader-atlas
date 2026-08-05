uniform float uTime;
uniform float uReveal;
uniform float uPixelRatio;
uniform float uFontPhase;
uniform vec2 uPointer;
uniform float uPointerEnergy;
uniform float uExplosion;
uniform float uOrb;
uniform float uOrbOpacity;
uniform float uIcosahedron;

attribute float aSeed;
attribute float aLayer;
attribute float aWorldsMask;
attribute vec3 aFontPositionTektur;
attribute vec3 aFontPositionBruno;
attribute vec3 aFontPositionChakra;
attribute vec3 aFontPositionOrbitron;
attribute vec3 aOrbPosition;
attribute vec3 aIcosahedronPosition;

varying vec3 vColor;
varying float vAlpha;
varying float vLight;
varying float vOrb;

#include ./includes/simplexNoise4d.glsl

void main() {
  float fontSegment = floor(uFontPhase);
  float globalFontBlend = fract(uFontPhase);
  float worldsProgress = clamp((position.x + 0.85) / 4.65, 0.0, 1.0);
  float fontDelay = (worldsProgress * 0.22 + aSeed * 0.10) * aWorldsMask;
  float fontBlend = smoothstep(
    0.0,
    1.0,
    clamp((globalFontBlend - fontDelay) / 0.68, 0.0, 1.0)
  );
  vec3 fontFrom = fontSegment < 0.5
    ? position
    : (fontSegment < 1.5
      ? aFontPositionTektur
      : (fontSegment < 2.5
        ? aFontPositionBruno
        : (fontSegment < 3.5 ? aFontPositionChakra : aFontPositionOrbitron)));
  vec3 fontTo = fontSegment < 0.5
    ? aFontPositionTektur
    : (fontSegment < 1.5
      ? aFontPositionBruno
      : (fontSegment < 2.5
        ? aFontPositionChakra
        : (fontSegment < 3.5 ? aFontPositionOrbitron : position)));
  vec3 titlePosition = mix(fontFrom, fontTo, fontBlend);
  float fontTransformPulse = sin(fontBlend * 3.14159265) * aWorldsMask;
  float peelAngle = aSeed * 18.8495559 + fontBlend * 3.14159265;
  titlePosition.x += cos(peelAngle) * fontTransformPulse * 0.075;
  titlePosition.y += sin(peelAngle) * fontTransformPulse * 0.105;
  titlePosition.z += (0.2 + aSeed * 0.62) * fontTransformPulse;

  vec3 transformed = titlePosition;
  float noise = simplexNoise4d(vec4(titlePosition.xy * 0.72, titlePosition.z * 2.4 + aSeed, uTime * 0.16));
  float ribbon = sin(titlePosition.x * 1.85 - uTime * 0.72 + aSeed * 4.0);

  transformed.x += noise * 0.045;
  transformed.y += sin(uTime * 0.85 + aSeed * 13.0 + titlePosition.x * 1.3) * 0.028;
  transformed.z += noise * 0.055 + ribbon * 0.025;

  vec2 pointerDelta = titlePosition.xy - uPointer;
  float pointerDistance = length(pointerDelta);
  vec2 pointerDirection = pointerDelta / max(pointerDistance, 0.001);
  float pointerField = 1.0 - smoothstep(0.18, 1.55, pointerDistance);
  float jiggle = sin(uTime * 19.0 + aSeed * 37.0 + titlePosition.x * 4.5);
  float jiggleStrength = pointerField * uPointerEnergy;
  transformed.xy += pointerDirection * jiggle * jiggleStrength * 0.105;
  transformed.y += cos(uTime * 23.0 + aSeed * 29.0) * jiggleStrength * 0.052;
  transformed.z += jiggle * jiggleStrength * 0.12;

  float explosionEase = 1.0 - pow(1.0 - uExplosion, 3.0);
  float explosionAngle = aSeed * 6.2831853 + titlePosition.x * 0.34 + aLayer * 1.7;
  vec2 explosionDirection = normalize(vec2(
    cos(explosionAngle) + titlePosition.x * 0.12,
    sin(explosionAngle) + titlePosition.y * 0.42
  ));
  float explosionDistance = mix(1.6, 7.2, fract(aSeed * 17.73 + aLayer * 0.31));
  transformed.xy += explosionDirection * explosionDistance * explosionEase;
  transformed.z += (aSeed - 0.5) * 5.0 * explosionEase;

  float scatter = 1.0 - uReveal;
  transformed.x += cos(aSeed * 31.0) * scatter * (0.4 + aLayer * 1.8);
  transformed.y += sin(aSeed * 47.0) * scatter * (0.25 + aLayer * 1.2);
  transformed.z += (aSeed - 0.5) * scatter * 4.0;

  float orbEase = uOrb * uOrb * (3.0 - 2.0 * uOrb);
  float orbLifetime = fract(aSeed + uTime * 0.12);
  float orbLifeIn = smoothstep(0.0, 0.22, orbLifetime);
  float orbLifeOut = 1.0 - smoothstep(0.68, 1.0, orbLifetime);
  float orbLifeEnvelope = min(orbLifeIn, orbLifeOut);
  vec3 activeOrbShape = mix(aOrbPosition, aIcosahedronPosition, uIcosahedron);
  vec3 orbNormal = normalize(activeOrbShape + vec3(0.0001));
  float orbBreath = sin(uTime * 1.1 + aSeed * 10.0) * 0.018;
  float orbRipple = simplexNoise4d(vec4(activeOrbShape * 1.8, uTime * 0.18)) * 0.024;
  vec3 breathingOrb = activeOrbShape * (1.0 + orbBreath + orbRipple);
  float orbFlowTime = uTime * 0.1;
  vec3 orbFlowSample = activeOrbShape * 0.72;
  vec3 orbFlow = vec3(
    simplexNoise4d(vec4(orbFlowSample + 0.0, orbFlowTime)),
    simplexNoise4d(vec4(orbFlowSample + 1.0, orbFlowTime)),
    simplexNoise4d(vec4(orbFlowSample + 2.0, orbFlowTime))
  );
  float orbFlowMask = smoothstep(
    -0.2,
    0.8,
    simplexNoise4d(vec4(activeOrbShape * 0.9, orbFlowTime + 1.0))
  );
  vec3 orbFlowDirection = normalize(orbFlow + vec3(0.0001));
  breathingOrb += orbFlowDirection * orbFlowMask * orbLifeEnvelope * 0.13;
  breathingOrb += orbNormal * sin(orbLifetime * 6.2831853) * orbLifeEnvelope * 0.022;
  transformed = mix(transformed, breathingOrb, orbEase);

  vec4 modelPosition = modelMatrix * vec4(transformed, 1.0);
  vec4 viewPosition = viewMatrix * modelPosition;
  gl_Position = projectionMatrix * viewPosition;

  float depthScale = 9.0 / max(1.0, -viewPosition.z);
  gl_PointSize = mix(1.25, 2.5, aSeed) * uPixelRatio * depthScale * (1.0 + uExplosion * 1.7);
  float orbLifeSize = mix(0.48, 1.0, orbLifeEnvelope);
  float orbPointSize = mix(1.5, 3.1, aSeed) * uPixelRatio * depthScale * orbLifeSize;
  gl_PointSize = mix(gl_PointSize, orbPointSize, orbEase);
  gl_PointSize *= mix(1.0, 1.22, orbEase);
  float fontPointScale = 1.0 - fontTransformPulse * 0.42;
  gl_PointSize *= mix(fontPointScale, 1.0, orbEase);

  vec3 cyan = vec3(0.12, 0.86, 1.0);
  vec3 pearl = vec3(0.92, 0.98, 1.0);
  vec3 violet = vec3(0.50, 0.36, 1.0);
  vec3 titleColor = mix(cyan, pearl, 0.38);
  titleColor *= 0.96 + noise * 0.04;
  vec3 orbAccent = mix(cyan, violet, smoothstep(-0.82, 0.82, aOrbPosition.x));
  vec3 orbSilver = mix(vec3(0.25, 0.30, 0.32), pearl, 0.15 + aSeed * 0.10);
  vec3 orbColor = mix(orbAccent, orbSilver, 0.88);
  vec3 icosahedronColor = mix(cyan, violet, 0.42 + aSeed * 0.24);
  orbColor = mix(orbColor, icosahedronColor, uIcosahedron * 0.55);
  vColor = mix(titleColor, orbColor, orbEase);
  float explosionFade = mix(1.0, 0.08, smoothstep(0.58, 1.0, uExplosion));
  float shapeOpacity = mix(explosionFade, 0.82, orbEase);
  float orbLifeAlpha = mix(0.46, 1.0, orbLifeEnvelope);
  vAlpha = mix(0.42, 1.0, 1.0 - aLayer) * uReveal * shapeOpacity * uOrbOpacity;
  vAlpha *= mix(1.0, orbLifeAlpha, orbEase);
  float baseLight = 0.88 + 0.12 * sin(uTime * 1.4 + aSeed * 19.0);
  float orbShimmer = 0.78 + 0.22 * sin(uTime * 2.1 + aSeed * 31.0 + orbLifetime * 6.2831853);
  vLight = mix(baseLight, orbShimmer, orbEase);
  vOrb = orbEase;
}
