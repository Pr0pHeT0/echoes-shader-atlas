import type * as THREE from "three/webgpu";
import {
  abs,
  dot,
  floor,
  fract,
  max,
  mod,
  step,
  vec2,
  vec3,
  vec4,
} from "three/tsl";

type FloatNode = THREE.Node<"float">;
type Vec4Node = THREE.Node<"vec4">;

function permuteFloat(value: FloatNode): FloatNode {
  return floor(mod(value.mul(34).add(1).mul(value), 289));
}

function permuteVector(value: Vec4Node): Vec4Node {
  return mod(value.mul(34).add(1).mul(value), 289);
}

function taylorInvSqrtFloat(value: FloatNode): FloatNode {
  return value.mul(-0.85373472095314).add(1.79284291400159);
}

function taylorInvSqrtVector(value: Vec4Node): Vec4Node {
  return value.mul(-0.85373472095314).add(1.79284291400159);
}

function grad4(index: FloatNode, ip: Vec4Node): Vec4Node {
  const xyz = floor(fract(vec3(index).mul(ip.xyz)).mul(7)).mul(ip.z).sub(1);
  const w = dot(abs(xyz), vec3(1)).oneMinus().add(0.5);
  const negativeW = w.lessThan(0).select(1, 0);
  const negativeXYZ = vec3(
    xyz.x.lessThan(0).select(1, 0),
    xyz.y.lessThan(0).select(1, 0),
    xyz.z.lessThan(0).select(1, 0),
  );
  return vec4(
    xyz.add(negativeXYZ.mul(2).sub(1).mul(negativeW)),
    w,
  );
}

/**
 * Direct TSL translation of the archived Ashima/McEwan 4D simplex function.
 * Keeping its constants and rank sorting intact gives the WebGPU and WebGL2
 * backends the same flow field as the original GLSL implementation.
 */
export function simplexNoise4d(value: Vec4Node): FloatNode {
  const constants = vec2(0.1381966011250105, 0.30901699437494745);
  const cell = floor(value.add(dot(value, vec4(constants.y))));
  const x0 = value.sub(cell).add(dot(cell, vec4(constants.x)));

  const isX = step(x0.yzw, x0.xxx);
  const isYZ = step(x0.zww, x0.yyz);
  const rank = vec4(
    isX.x.add(isX.y).add(isX.z),
    isX.x.oneMinus().add(isYZ.x).add(isYZ.y),
    isX.y.oneMinus().add(isYZ.x.oneMinus()).add(isYZ.z),
    isX.z.oneMinus().add(isYZ.y.oneMinus()).add(isYZ.z.oneMinus()),
  );

  const i3 = rank.clamp(0, 1);
  const i2 = rank.sub(1).clamp(0, 1);
  const i1 = rank.sub(2).clamp(0, 1);
  const x1 = x0.sub(i1).add(constants.x);
  const x2 = x0.sub(i2).add(constants.x.mul(2));
  const x3 = x0.sub(i3).add(constants.x.mul(3));
  const x4 = x0.sub(1).add(constants.x.mul(4));

  const wrappedCell = mod(cell, 289);
  const j0 = permuteFloat(
    permuteFloat(
      permuteFloat(
        permuteFloat(wrappedCell.w).add(wrappedCell.z),
      ).add(wrappedCell.y),
    ).add(wrappedCell.x),
  );
  const offsetW = vec4(i1.w, i2.w, i3.w, 1);
  const offsetZ = vec4(i1.z, i2.z, i3.z, 1);
  const offsetY = vec4(i1.y, i2.y, i3.y, 1);
  const offsetX = vec4(i1.x, i2.x, i3.x, 1);
  const j1 = permuteVector(
    permuteVector(
      permuteVector(
        permuteVector(wrappedCell.w.add(offsetW)).add(wrappedCell.z).add(offsetZ),
      ).add(wrappedCell.y).add(offsetY),
    ).add(wrappedCell.x).add(offsetX),
  );

  const ip = vec4(1 / 294, 1 / 49, 1 / 7, 0);
  const p0 = grad4(j0, ip);
  const p1 = grad4(j1.x, ip);
  const p2 = grad4(j1.y, ip);
  const p3 = grad4(j1.z, ip);
  const p4 = grad4(j1.w, ip);
  const norm = taylorInvSqrtVector(vec4(
    dot(p0, p0),
    dot(p1, p1),
    dot(p2, p2),
    dot(p3, p3),
  ));
  const normalizedP0 = p0.mul(norm.x);
  const normalizedP1 = p1.mul(norm.y);
  const normalizedP2 = p2.mul(norm.z);
  const normalizedP3 = p3.mul(norm.w);
  const normalizedP4 = p4.mul(taylorInvSqrtFloat(dot(p4, p4)));

  const m0 = max(vec3(0.6).sub(vec3(dot(x0, x0), dot(x1, x1), dot(x2, x2))), 0);
  const m1 = max(vec2(0.6).sub(vec2(dot(x3, x3), dot(x4, x4))), 0);
  const m0Squared = m0.mul(m0);
  const m1Squared = m1.mul(m1);
  return dot(
    m0Squared.mul(m0Squared),
    vec3(
      dot(normalizedP0, x0),
      dot(normalizedP1, x1),
      dot(normalizedP2, x2),
    ),
  ).add(dot(
    m1Squared.mul(m1Squared),
    vec2(dot(normalizedP3, x3), dot(normalizedP4, x4)),
  )).mul(49);
}
