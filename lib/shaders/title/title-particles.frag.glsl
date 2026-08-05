varying vec3 vColor;
varying float vAlpha;
varying float vLight;
varying float vOrb;

void main() {
  vec2 point = gl_PointCoord * 2.0 - 1.0;
  float radiusSquared = dot(point, point);
  if (radiusSquared > 1.0) discard;

  float radius = sqrt(radiusSquared);
  float orbCoreRadius = mix(1.0, 0.72, vOrb);
  vec2 surfacePoint = point / orbCoreRadius;
  float surfaceRadiusSquared = min(dot(surfacePoint, surfacePoint), 1.0);
  float sphere = sqrt(1.0 - surfaceRadiusSquared);
  float titleCore = smoothstep(1.0, 0.05, radiusSquared);
  float orbCore = 1.0 - smoothstep(orbCoreRadius * 0.82, orbCoreRadius, radius);
  float core = mix(titleCore, orbCore, vOrb);
  vec3 normal = normalize(vec3(surfacePoint, sphere));
  vec3 lightDirection = normalize(vec3(-0.35, 0.7, 1.0));
  float diffuse = 0.42 + max(dot(normal, lightDirection), 0.0) * 0.58;
  float glint = pow(max(dot(normal, normalize(lightDirection + vec3(0.0, 0.0, 1.0))), 0.0), 22.0);

  vec3 color = vColor * diffuse * vLight;
  color += vec3(0.65, 0.9, 1.0) * glint * 0.5;
  float halo = (1.0 - smoothstep(orbCoreRadius * 0.7, 1.0, radius)) * vOrb;
  color += vec3(0.12, 0.62, 1.0) * halo * 0.18;
  float surfaceAlpha = (0.32 + core * 0.68) * vAlpha * mix(1.0, orbCore, vOrb);
  float alpha = surfaceAlpha + halo * vAlpha * 0.11;
  gl_FragColor = vec4(color, alpha);
}
