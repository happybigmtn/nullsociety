import * as THREE from 'three';
import { PIP_POSITIONS } from './diceUtils';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const DICE_COLOR = '#0a0a0a';
const PIP_COLOR = '#00ff41';
const DEFAULT_TEXTURE_SIZE = 128;
const DICE_CORNER_RADIUS = 0.08;
const DICE_CORNER_SEGMENTS = 4;

// BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z.
export const FACE_VALUES = [3, 4, 1, 6, 2, 5];

const textureCache = new Map<string, THREE.Texture>();
const geometryCache = new Map<number, THREE.BoxGeometry>();

const createFaceTexture = (value: number, size: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  ctx.fillStyle = DICE_COLOR;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = PIP_COLOR;
  ctx.lineWidth = 2;
  ctx.strokeRect(2, 2, size - 4, size - 4);

  const pips = PIP_POSITIONS[value] || [];
  const pipRadius = size * 0.08;
  ctx.fillStyle = PIP_COLOR;

  for (const [px, py] of pips) {
    const x = size / 2 + px * size;
    const y = size / 2 - py * size;
    ctx.beginPath();
    ctx.arc(x, y, pipRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
};

export const getDiceFaceTexture = (value: number, size = DEFAULT_TEXTURE_SIZE) => {
  const key = `${value}-${size}`;
  const cached = textureCache.get(key);
  if (cached) return cached;

  if (typeof document === 'undefined') {
    const texture = new THREE.Texture();
    texture.needsUpdate = true;
    textureCache.set(key, texture);
    return texture;
  }

  const texture = createFaceTexture(value, size);
  textureCache.set(key, texture);
  return texture;
};

export const getDiceGeometry = (size: number) => {
  const cached = geometryCache.get(size);
  if (cached) return cached;
  const radius = Math.min(size * DICE_CORNER_RADIUS, size * 0.2);
  const geometry = new RoundedBoxGeometry(
    size,
    size,
    size,
    DICE_CORNER_SEGMENTS,
    radius
  );
  geometryCache.set(size, geometry);
  return geometry;
};
