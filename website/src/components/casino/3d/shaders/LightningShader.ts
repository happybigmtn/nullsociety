/**
 * Lightning Shader - GLSL shaders for Lightning Roulette effects
 *
 * Creates animated lightning bolts using fractal noise with bloom-driving
 * emissive values (> 1.0). The shader renders to a quad overlay on the
 * betting grid.
 */

import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// Simplex Noise GLSL (embedded)
// ─────────────────────────────────────────────────────────────────────────────

const SIMPLEX_NOISE_GLSL = `
// Simplex 3D noise
vec4 permute(vec4 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

vec4 taylorInvSqrt(vec4 r) {
  return 1.79284291400159 - 0.85373472095314 * r;
}

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 1.0 / 7.0;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// Lightning Vertex Shader
// ─────────────────────────────────────────────────────────────────────────────

export const lightningVertexShader = `
varying vec2 vUv;
varying vec3 vPosition;

void main() {
  vUv = uv;
  vPosition = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// Lightning Fragment Shader
// ─────────────────────────────────────────────────────────────────────────────

export const lightningFragmentShader = `
${SIMPLEX_NOISE_GLSL}

uniform float uTime;
uniform bool uLightningActive;
uniform vec3 uLightningColor;
uniform float uIntensity;
uniform float uBoltCount;
uniform float uBranchiness;

varying vec2 vUv;
varying vec3 vPosition;

// Fractal noise for organic patterns
float fractalNoise(vec3 p, int octaves) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;

  for (int i = 0; i < 4; i++) {
    if (i >= octaves) break;
    value += amplitude * snoise(p * frequency);
    frequency *= 2.0;
    amplitude *= 0.5;
  }

  return value;
}

// Generate lightning bolt pattern
float lightningBolt(vec2 uv, float time, float seed) {
  // Main path with fractal deviation
  float mainPath = fractalNoise(vec3(
    uv.x * 3.0 + seed,
    uv.y * 8.0,
    time * 0.8
  ), 3);

  // Branches
  float branch1 = fractalNoise(vec3(
    uv.x * 5.0 + 10.0 + seed,
    uv.y * 12.0,
    time * 1.2
  ), 2) * uBranchiness;

  float branch2 = fractalNoise(vec3(
    uv.x * 4.0 - 5.0 + seed,
    uv.y * 10.0,
    time * 1.0
  ), 2) * uBranchiness * 0.7;

  float bolt = mainPath * 0.6 + branch1 * 0.25 + branch2 * 0.15;

  // Bolt thickness varies with pulse
  float thickness = 0.05 + sin(time * 3.0) * 0.02;

  return smoothstep(thickness + 0.05, thickness, abs(bolt));
}

void main() {
  if (!uLightningActive) {
    discard;
  }

  float lightning = 0.0;

  // Multiple bolts with different seeds
  for (float i = 0.0; i < 3.0; i++) {
    if (i >= uBoltCount) break;
    lightning += lightningBolt(vUv, uTime + i * 1.7, i * 13.0);
  }

  lightning = min(lightning, 1.0);

  // Pulsating intensity
  float pulse = 0.7 + 0.3 * sin(uTime * 6.0);
  float intensity = lightning * pulse * uIntensity;

  // Core color (hot white-yellow)
  vec3 coreColor = vec3(1.0, 1.0, 0.9) * intensity * 8.0;

  // Outer glow in user-specified color
  vec3 glowColor = uLightningColor * pow(intensity, 0.5) * 2.0;

  // Combine with falloff
  vec3 finalColor = coreColor + glowColor;
  float alpha = min(1.0, intensity * 1.5);

  // Edge fade
  float edgeFade = smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
  edgeFade *= smoothstep(0.0, 0.1, vUv.y) * smoothstep(1.0, 0.9, vUv.y);

  gl_FragColor = vec4(finalColor, alpha * edgeFade);
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// Lightning Material Factory
// ─────────────────────────────────────────────────────────────────────────────

export interface LightningUniforms {
  uTime: { value: number };
  uLightningActive: { value: boolean };
  uLightningColor: { value: THREE.Color };
  uIntensity: { value: number };
  uBoltCount: { value: number };
  uBranchiness: { value: number };
}

export function createLightningUniforms(): LightningUniforms {
  return {
    uTime: { value: 0 },
    uLightningActive: { value: false },
    uLightningColor: { value: new THREE.Color(0xffff44) }, // Yellow lightning
    uIntensity: { value: 1.0 },
    uBoltCount: { value: 2.0 },
    uBranchiness: { value: 1.0 },
  };
}

export function createLightningMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: lightningVertexShader,
    fragmentShader: lightningFragmentShader,
    uniforms: createLightningUniforms() as unknown as Record<string, THREE.IUniform>,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Number Highlight Shader (for lucky numbers)
// ─────────────────────────────────────────────────────────────────────────────

export const numberHighlightVertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const numberHighlightFragmentShader = `
uniform float uTime;
uniform bool uHighlighted;
uniform vec3 uHighlightColor;
uniform float uMultiplier;

varying vec2 vUv;

void main() {
  if (!uHighlighted) {
    discard;
  }

  // Pulsing glow
  float pulse = 0.5 + 0.5 * sin(uTime * 4.0);

  // Intensity scales with multiplier (higher multiplier = brighter)
  float baseIntensity = 2.0 + log(uMultiplier) * 0.5;
  float intensity = baseIntensity * (0.7 + 0.3 * pulse);

  // Radial falloff from center
  vec2 center = vUv - 0.5;
  float dist = length(center);
  float falloff = smoothstep(0.5, 0.2, dist);

  vec3 color = uHighlightColor * intensity * falloff;
  float alpha = falloff * (0.8 + 0.2 * pulse);

  gl_FragColor = vec4(color, alpha);
}
`;

export interface NumberHighlightUniforms {
  uTime: { value: number };
  uHighlighted: { value: boolean };
  uHighlightColor: { value: THREE.Color };
  uMultiplier: { value: number };
}

export function createNumberHighlightUniforms(): NumberHighlightUniforms {
  return {
    uTime: { value: 0 },
    uHighlighted: { value: false },
    uHighlightColor: { value: new THREE.Color(0xffff00) },
    uMultiplier: { value: 1 },
  };
}

export function createNumberHighlightMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: numberHighlightVertexShader,
    fragmentShader: numberHighlightFragmentShader,
    uniforms: createNumberHighlightUniforms() as unknown as Record<string, THREE.IUniform>,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Electric Arc Shader (for number selection animation)
// ─────────────────────────────────────────────────────────────────────────────

export const electricArcFragmentShader = `
${SIMPLEX_NOISE_GLSL}

uniform float uTime;
uniform vec2 uStartPoint;
uniform vec2 uEndPoint;
uniform vec3 uArcColor;
uniform float uProgress;

varying vec2 vUv;

float arc(vec2 uv, vec2 start, vec2 end, float time, float progress) {
  vec2 dir = end - start;
  float len = length(dir);
  vec2 normDir = dir / len;

  // Project point onto line
  vec2 toPoint = uv - start;
  float t = clamp(dot(toPoint, normDir) / len, 0.0, progress);
  vec2 projected = start + normDir * t * len;

  // Distance from line with noise offset
  float dist = length(uv - projected);
  float noise = snoise(vec3(t * 10.0, time * 2.0, 0.0)) * 0.02;
  dist = abs(dist + noise);

  // Arc thickness
  float thickness = 0.01 + sin(t * 3.14159 * 2.0) * 0.005;

  return smoothstep(thickness + 0.01, thickness, dist) * step(0.001, progress);
}

void main() {
  float arcValue = arc(vUv, uStartPoint, uEndPoint, uTime, uProgress);

  float intensity = arcValue * (2.0 + sin(uTime * 8.0) * 0.5);
  vec3 color = uArcColor * intensity;

  gl_FragColor = vec4(color, arcValue);
}
`;
