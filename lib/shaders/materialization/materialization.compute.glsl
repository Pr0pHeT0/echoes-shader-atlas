uniform float uTime;
uniform float uDeltaTime;
uniform sampler2D uBase;
uniform float uFlowFieldInfluence;
uniform float uFlowFieldStrength;
uniform float uFlowFieldFrequency;

// Audio uniforms
uniform float uAudioLevel;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uShaderEnabled;
uniform float uFlowEnabled;
uniform float uMidFlowTimeEnabled;
uniform float uMidFlowTimeStrength;
uniform float uBassFlowInfluenceEnabled;
uniform float uBassFlowInfluenceStrength;
uniform float uTrebleFlowFrequencyEnabled;
uniform float uTrebleFlowFrequencyStrength;
uniform float uAudioGateEnabled;
uniform float uAudioGateLow;
uniform float uAudioGateHigh;
uniform float uAudioGateBassMix;
uniform float uBassFlowStrengthEnabled;
uniform float uBassFlowStrength;
uniform float uAudioFlowEnabled;
uniform float uAudioFlowStrength;
uniform float uReturnEnabled;
uniform float uReturnStrength;

#include ../includes/simplexNoise4d.glsl

void main() {
  float time = uTime * 0.2 + uMid * uMidFlowTimeStrength * uMidFlowTimeEnabled * uShaderEnabled;
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 particle = texture(uParticles, uv);
  vec4 base = texture(uBase, uv);

  float strength = simplexNoise4d(vec4(base.xyz * 0.7, time + 1.0));
  float influence = (uFlowFieldInfluence - 0.5) * (- 2.0) - uBass * uBassFlowInfluenceStrength * uBassFlowInfluenceEnabled * uShaderEnabled;
  strength = smoothstep(influence, 1.0, strength);

  float freq = uFlowFieldFrequency + uTreble * uTrebleFlowFrequencyStrength * uTrebleFlowFrequencyEnabled * uShaderEnabled;
  vec3 flowField = vec3(
    simplexNoise4d(vec4(particle.xyz * freq + 0.0, time)),
    simplexNoise4d(vec4(particle.xyz * freq + 1.0, time)),
    simplexNoise4d(vec4(particle.xyz * freq + 2.0, time))
  );
  flowField = normalize(flowField);
  
  float audioInput = uAudioLevel + uBass * uAudioGateBassMix;
  float audioActivity = mix(1.0, smoothstep(uAudioGateLow, uAudioGateHigh, audioInput), uAudioGateEnabled);
  float bassStrength = uBass * uBassFlowStrength * uBassFlowStrengthEnabled * uShaderEnabled;
  float audioStrength = audioInput * uAudioFlowStrength * uAudioFlowEnabled * uShaderEnabled;
  float currentStrength = (uFlowFieldStrength + bassStrength + audioStrength) * audioActivity * uFlowEnabled * uShaderEnabled;
  particle.xyz += flowField * uDeltaTime * strength * currentStrength;
  particle.xyz += (base.xyz - particle.xyz) * uDeltaTime * uReturnStrength * uReturnEnabled * uShaderEnabled;

  gl_FragColor = particle;
}
