/**
 * Squeeze Shader - Baccarat card squeeze effect
 *
 * Vertex shader bends the card mesh based on user drag, simulating the
 * tactile squeeze reveal. Uses quadratic bend curve from pivot (bottom edge).
 */

import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// Squeeze Vertex Shader
// ─────────────────────────────────────────────────────────────────────────────

export const squeezeVertexShader = `
uniform float uBendStrength;     // 0.0 = flat, 1.0 = max bend
uniform float uRevealThreshold;  // 0.0-1.0 from bottom
uniform vec2 uPivotPoint;        // Pivot location (typically bottom center)
uniform float uMaxBendAngle;     // Max bend in radians (default ~PI/2)

varying vec2 vUv;
varying float vReveal;
varying vec3 vNormal;
varying vec3 vWorldPosition;

void main() {
  vUv = uv;

  // Bend amount increases quadratically from pivot (natural paper bend)
  float distFromPivot = uv.y - uPivotPoint.y;
  float normalizedDist = clamp(distFromPivot / (1.0 - uPivotPoint.y), 0.0, 1.0);
  float bendAmount = normalizedDist * normalizedDist;

  vec3 pos = position;

  if (uBendStrength > 0.001) {
    // Calculate bend angle at this point
    float bendAngle = uBendStrength * bendAmount * uMaxBendAngle;

    // Cylindrical bend: card wraps around an imaginary cylinder
    float radius = 1.0 / max(uBendStrength + 0.1, 0.1);
    float arcLength = distFromPivot;

    // New position on cylinder surface
    float x = sin(bendAngle * arcLength) * radius;
    float y = (1.0 - cos(bendAngle * arcLength)) * radius;

    // Apply bend offset
    pos.z -= x * uBendStrength * 0.5;  // Pull toward viewer
    pos.y += y * uBendStrength;         // Lift up
  }

  // Calculate reveal factor (how much of card face is visible)
  vReveal = smoothstep(
    uRevealThreshold - 0.1,
    uRevealThreshold + 0.1,
    bendAmount
  );

  // Transform normal for lighting (approximate)
  float normalBend = uBendStrength * bendAmount * 0.5;
  vNormal = normalize(vec3(0.0, sin(normalBend), cos(normalBend)));

  vec4 worldPos = modelMatrix * vec4(pos, 1.0);
  vWorldPosition = worldPos.xyz;

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// Squeeze Fragment Shader (face/back transition)
// ─────────────────────────────────────────────────────────────────────────────

export const squeezeFragmentShader = `
uniform sampler2D uFaceTexture;
uniform sampler2D uBackTexture;
uniform float uBendStrength;
uniform vec3 uAmbientLight;
uniform vec3 uKeyLightDir;
uniform vec3 uKeyLightColor;
uniform float uSuspenseGlow;

varying vec2 vUv;
varying float vReveal;
varying vec3 vNormal;
varying vec3 vWorldPosition;

void main() {
  // Sample both textures
  vec4 faceColor = texture2D(uFaceTexture, vUv);
  vec4 backColor = texture2D(uBackTexture, vUv);

  // Determine which side is visible based on bend and facing
  // When bent enough, face becomes visible
  float faceFacing = step(0.3, vReveal) * step(0.1, uBendStrength);

  // Mix face and back based on reveal
  vec4 baseColor = mix(backColor, faceColor, faceFacing);

  // Simple lighting
  float diffuse = max(dot(vNormal, normalize(uKeyLightDir)), 0.0);
  vec3 lighting = uAmbientLight + uKeyLightColor * diffuse;

  // Suspense glow on unrevealed portions (subtle red tint)
  vec3 glowColor = vec3(1.0, 0.3, 0.1) * uSuspenseGlow * (1.0 - vReveal) * 0.15;

  vec3 finalColor = baseColor.rgb * lighting + glowColor;

  // Edge highlight when bending
  float edgeHighlight = pow(vReveal, 3.0) * uBendStrength * 0.2;
  finalColor += vec3(1.0) * edgeHighlight;

  gl_FragColor = vec4(finalColor, baseColor.a);
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// Squeeze Uniforms
// ─────────────────────────────────────────────────────────────────────────────

export interface SqueezeUniforms {
  uBendStrength: { value: number };
  uRevealThreshold: { value: number };
  uPivotPoint: { value: THREE.Vector2 };
  uMaxBendAngle: { value: number };
  uFaceTexture: { value: THREE.Texture | null };
  uBackTexture: { value: THREE.Texture | null };
  uAmbientLight: { value: THREE.Color };
  uKeyLightDir: { value: THREE.Vector3 };
  uKeyLightColor: { value: THREE.Color };
  uSuspenseGlow: { value: number };
}

export function createSqueezeUniforms(): SqueezeUniforms {
  return {
    uBendStrength: { value: 0 },
    uRevealThreshold: { value: 0.5 },
    uPivotPoint: { value: new THREE.Vector2(0.5, 0) },
    uMaxBendAngle: { value: Math.PI * 0.5 }, // 90 degrees max
    uFaceTexture: { value: null },
    uBackTexture: { value: null },
    uAmbientLight: { value: new THREE.Color(0x333333) },
    uKeyLightDir: { value: new THREE.Vector3(0.5, 1, 0.5).normalize() },
    uKeyLightColor: { value: new THREE.Color(0xffffff) },
    uSuspenseGlow: { value: 1.0 },
  };
}

export function createSqueezeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: squeezeVertexShader,
    fragmentShader: squeezeFragmentShader,
    uniforms: createSqueezeUniforms() as unknown as Record<string, THREE.IUniform>,
    side: THREE.DoubleSide,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Corner Peek Shader (simpler bend for peek animation)
// ─────────────────────────────────────────────────────────────────────────────

export const cornerPeekVertexShader = `
uniform float uPeekAmount;     // 0.0 = flat, 1.0 = full peek (15°)
uniform vec2 uPeekCorner;      // Which corner (0,0 = bottom-left, 1,1 = top-right)
uniform float uMaxPeekAngle;   // Max angle in radians

varying vec2 vUv;
varying vec3 vNormal;

void main() {
  vUv = uv;

  vec3 pos = position;

  // Distance from peek corner
  float cornerDist = length(uv - uPeekCorner);
  float influence = smoothstep(0.7, 0.0, cornerDist);

  if (uPeekAmount > 0.001) {
    float peekAngle = uPeekAmount * uMaxPeekAngle * influence;

    // Simple rotation around corner axis
    float lift = sin(peekAngle) * influence * 0.1;
    float pull = (1.0 - cos(peekAngle)) * influence * 0.05;

    pos.z += lift;
    pos.y += pull;
  }

  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

export const cornerPeekFragmentShader = `
uniform sampler2D uFaceTexture;
uniform sampler2D uBackTexture;
uniform float uPeekAmount;
uniform vec2 uPeekCorner;

varying vec2 vUv;
varying vec3 vNormal;

void main() {
  // Show face near peek corner, back elsewhere
  float cornerDist = length(vUv - uPeekCorner);
  float showFace = smoothstep(0.4, 0.1, cornerDist) * uPeekAmount;

  vec4 faceColor = texture2D(uFaceTexture, vUv);
  vec4 backColor = texture2D(uBackTexture, vUv);

  vec4 color = mix(backColor, faceColor, showFace);

  // Simple lighting
  float light = 0.5 + 0.5 * dot(vNormal, vec3(0.0, 0.0, 1.0));
  color.rgb *= light;

  gl_FragColor = color;
}
`;

export interface CornerPeekUniforms {
  uPeekAmount: { value: number };
  uPeekCorner: { value: THREE.Vector2 };
  uMaxPeekAngle: { value: number };
  uFaceTexture: { value: THREE.Texture | null };
  uBackTexture: { value: THREE.Texture | null };
}

export function createCornerPeekUniforms(): CornerPeekUniforms {
  return {
    uPeekAmount: { value: 0 },
    uPeekCorner: { value: new THREE.Vector2(1, 0) }, // Bottom-right by default
    uMaxPeekAngle: { value: Math.PI / 12 }, // 15 degrees
    uFaceTexture: { value: null },
    uBackTexture: { value: null },
  };
}

export function createCornerPeekMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: cornerPeekVertexShader,
    fragmentShader: cornerPeekFragmentShader,
    uniforms: createCornerPeekUniforms() as unknown as Record<string, THREE.IUniform>,
    side: THREE.DoubleSide,
  });
}
