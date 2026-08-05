uniform float uTime;
uniform vec2 uResolution;
uniform float uVerticalOffset;
uniform float uAudioStrength;
uniform float uGameplayMix;

varying vec2 vUv;

float hash21(vec2 point) {
  point = fract(point * vec2(123.34, 456.21));
  point += dot(point, point + 45.32);
  return fract(point.x * point.y);
}

float valueNoise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  local = local * local * (3.0 - 2.0 * local);

  float a = hash21(cell);
  float b = hash21(cell + vec2(1.0, 0.0));
  float c = hash21(cell + vec2(0.0, 1.0));
  float d = hash21(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
}

float fbm(vec2 point) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int octave = 0; octave < 5; octave++) {
    value += valueNoise(point) * amplitude;
    point = point * 2.03 + vec2(17.1, 9.2);
    amplitude *= 0.5;
  }
  return value;
}

float auroraBand(vec2 point, float time, float offset, float frequency, float width) {
  float distortion = fbm(vec2(point.x * 0.7 + offset, time * 0.055 + offset)) - 0.5;
  float wave = sin(point.x * frequency + time * 0.22 + offset * 4.0) * 0.11;
  wave += sin(point.x * frequency * 0.43 - time * 0.14) * 0.07;
  float center = offset + wave + distortion * 0.26;
  float band = exp(-abs(point.y - center) / width);
  float filaments = 0.5 + 0.5 * sin(point.x * 23.0 + distortion * 11.0 - time * 0.7);
  return band * mix(0.58, 1.0, filaments);
}

void main() {
  vec2 uv = vUv;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 point = uv - 0.5;
  point.x *= aspect;

  float time = uTime;
  vec2 auroraPoint = vec2(point.x, point.y - uVerticalOffset);
  float upperMask = smoothstep(-0.52, -0.02, auroraPoint.y) * (1.0 - smoothstep(0.36, 0.58, auroraPoint.y));
  float cyanBand = auroraBand(auroraPoint, time, 0.11, 2.25, 0.095) * upperMask;
  float violetBand = auroraBand(auroraPoint, time * 0.88, 0.22, 1.72, 0.12) * upperMask;
  float deepBand = auroraBand(auroraPoint, time * 0.72, -0.02, 2.9, 0.075) * upperMask;

  vec3 color = vec3(0.003, 0.006, 0.014);
  float gameplayStrength = mix(1.0, 0.18 + uAudioStrength * 2.35, uGameplayMix);
  color += vec3(0.04, 0.65, 0.82) * cyanBand * 0.25 * gameplayStrength;
  color += vec3(0.33, 0.16, 0.72) * violetBand * 0.28 * gameplayStrength;
  color += vec3(0.04, 0.24, 0.42) * deepBand * 0.19 * gameplayStrength;

  float titleGlow = exp(-dot(point * vec2(0.62, 1.7), point * vec2(0.62, 1.7)) * 3.2);
  color += vec3(0.025, 0.09, 0.16) * titleGlow;

  float vignette = smoothstep(0.92, 0.18, length(point * vec2(0.72, 1.0)));
  color *= 0.36 + vignette * 0.64;
  color *= mix(1.0, 0.62 + uAudioStrength * 1.25, uGameplayMix);
  float gameplayTopFade = smoothstep(0.76, 0.84, uv.y);
  color *= mix(1.0, gameplayTopFade, uGameplayMix);
  gl_FragColor = vec4(color, 1.0);
}
