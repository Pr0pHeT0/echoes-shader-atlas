uniform vec2 uResolution;
uniform float uSize;
uniform sampler2D uParticlesTexture;
uniform float uMaterializedSectionCount;

// Audio uniforms
uniform float uAudioLevel;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uShaderEnabled;
uniform float uBassRadialEnabled;
uniform float uBassRadialPhase;
uniform float uBassRadialStrength;
uniform float uTrebleSizeEnabled;
uniform float uTrebleSizeStrength;

attribute vec2 aParticlesUv;
attribute vec3 aColor;
attribute float aSize;
attribute float aSection;

varying vec3 vColor;
varying float vFogDepth;

void main() {
  if (aSection < uMaterializedSectionCount) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vColor = vec3(0.0);
    vFogDepth = 0.0;
    return;
  }

  vec4 particle = texture(uParticlesTexture, aParticlesUv);

  // Final position
  vec4 modelPosition = modelMatrix * vec4(particle.xyz, 1.0);
  
  // Add some radial distortion based on bass
  float dist = length(modelPosition.xyz);
  vec3 dir = normalize(modelPosition.xyz);
  float bassRadial = uShaderEnabled * uBassRadialEnabled;
  modelPosition.xyz += dir * sin(dist * 10.0 - uBass * uBassRadialPhase) * uBass * uBassRadialStrength * bassRadial;

  vec4 viewPosition = viewMatrix * modelPosition;
  vec4 projectedPosition = projectionMatrix * viewPosition;
  gl_Position = projectedPosition;

  // Point size stays stable; audio affects motion instead of global pulsing.
  float particleSize = mix(0.65, 1.0, aSize);
  float trebleSize = uShaderEnabled * uTrebleSizeEnabled;
  float currentSize = uSize * (1.0 + uTreble * uTrebleSizeStrength * trebleSize);

  gl_PointSize = particleSize * currentSize * uResolution.y;
  gl_PointSize *= (1.0 / - viewPosition.z);

  // Varyings
  vColor = aColor;
  vFogDepth = -viewPosition.z;
}
