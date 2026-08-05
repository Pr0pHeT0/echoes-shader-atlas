uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;

varying vec3 vColor;
varying float vFogDepth;
varying float vOpacity;
varying float vReveal;

void main() {
  vec2 coord = gl_PointCoord * 2.0 - 1.0;
  float radiusSquared = dot(coord, coord);

  if (radiusSquared > 1.0) discard;

  vec3 normal = vec3(coord, sqrt(1.0 - radiusSquared));
  vec3 viewDirection = vec3(0.0, 0.0, 1.0);

  vec3 orbLightDirection = normalize(vec3(-0.35, 0.7, 1.0));
  float orbDiffuse = 0.42 + max(dot(normal, orbLightDirection), 0.0) * 0.58;
  vec3 orbHalfDirection = normalize(orbLightDirection + viewDirection);
  float orbGlint = pow(max(dot(normal, orbHalfDirection), 0.0), 22.0);
  vec3 orbLitColor = vColor * orbDiffuse + vec3(0.65, 0.9, 1.0) * orbGlint * 0.5;

  vec3 sceneLightDirection = normalize(vec3(0.5, 0.8, 1.0));
  float sceneDiffuse = max(dot(normal, sceneLightDirection), 0.0);
  vec3 sceneHalfDirection = normalize(sceneLightDirection + viewDirection);
  float sceneSpecular = pow(max(dot(normal, sceneHalfDirection), 0.0), 32.0);
  vec3 sceneLitColor = vColor * (0.5 + 0.5 * sceneDiffuse) + vec3(0.05) * sceneSpecular;

  vec3 color = mix(orbLitColor, sceneLitColor, vReveal);
  float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
  color = mix(color, fogColor, fogFactor);

  float orbAlphaProfile = 0.32 + smoothstep(1.0, 0.05, radiusSquared) * 0.68;
  float alphaProfile = mix(orbAlphaProfile, 1.0, vReveal);
  gl_FragColor = vec4(color, vOpacity * alphaProfile);
}
