uniform float uTime;
uniform float uLevel;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uEnabled;
uniform float uOpacity;
uniform float uWaveStrength;
uniform float uParticleStrength;
uniform float uBassStrength;
uniform float uMidStrength;
uniform float uTrebleStrength;
uniform vec2 uResolution;

varying vec2 vUv;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float waveY(float x, float offset, float frequency, float speed, float amplitude) {
  float bass = uBass * uBassStrength;
  float mid = uMid * uMidStrength;
  float treble = uTreble * uTrebleStrength;
  float voice = uLevel * 0.6 + mid * 0.5 + treble * 0.4;
  float y = offset + sin((x * frequency) + uTime * speed) * amplitude * (0.35 + voice * 1.5) * uWaveStrength;
  y += sin((x * frequency * 0.43) - uTime * speed * 1.7) * amplitude * 0.48 * (0.2 + bass * 1.5) * uWaveStrength;
  return y;
}

float waveParticleLayer(vec2 uv, float offset, float frequency, float speed, float amplitude, float density, float seedOffset) {
  vec2 cell = floor(vec2(uv.x * density, seedOffset));
  float seed = hash(cell);
  float x = (floor(uv.x * density) + 0.5 + (seed - 0.5) * 0.76) / density;
  float y = waveY(x, offset, frequency, speed, amplitude);
  y += (seed - 0.5) * (0.05 + uLevel * 0.15);

  vec2 aspect = vec2(density * 0.16, 9.0);
  vec2 particleUv = vec2(uv.x - x, uv.y - y) * aspect;
  particleUv.x += sin(uTime * (0.8 + seed * 1.5) + seed * 6.2831) * 0.08;

  float treble = uTreble * uTrebleStrength;
  float radius = 0.026 + seed * 0.01 + treble * 0.016;
  float dotShape = 1.0 - smoothstep(radius, radius + 0.018, length(particleUv));
  float gate = smoothstep(0.22, 0.94, seed + uLevel * 0.5 + treble * 0.28);
  return dotShape * gate * uParticleStrength;
}

float waveParticleField(vec2 uv) {
  float lowParticles = waveParticleLayer(uv, 0.12, 13.0, 1.6, 0.09, 210.0, 1.0);
  float midParticles = waveParticleLayer(uv, 0.17, 19.0, -1.15, 0.065, 236.0, 2.0);
  float highParticles = waveParticleLayer(uv, 0.22, 31.0, 2.4, 0.04, 268.0, 3.0);
  return lowParticles + midParticles * 0.9 + highParticles * 0.72;
}

void main() {
  vec2 uv = vUv;
  float bottomFade = smoothstep(0.0, 0.18, uv.y);
  float topFade = 1.0 - smoothstep(0.78, 1.0, uv.y);
  float edgeFade = smoothstep(0.0, 0.06, uv.x) * (1.0 - smoothstep(0.94, 1.0, uv.x));
  float fade = bottomFade * topFade * edgeFade;

  float bass = uBass * uBassStrength;
  float mid = uMid * uMidStrength;
  float treble = uTreble * uTrebleStrength;
  float particles = waveParticleField(uv) * (0.35 + uLevel * 0.9 + treble * 0.7);

  vec3 deepInk = vec3(0.02, 0.09, 0.11);
  vec3 cyan = vec3(0.18, 0.95, 1.0);
  vec3 pearl = vec3(0.9, 0.98, 0.92);
  vec3 amber = vec3(1.0, 0.62, 0.18);

  vec3 color = deepInk * (0.1 + bass * 0.18);
  color += mix(cyan, pearl, uv.y) * particles * (0.62 + mid * 0.34);
  color += amber * particles * treble * 0.35;

  float alpha = clamp(particles * 0.82 * fade * uOpacity * uEnabled, 0.0, 0.95);

  gl_FragColor = vec4(color, alpha);
}
