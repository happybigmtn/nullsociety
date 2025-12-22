import * as THREE from 'three';
import { Card } from '../../../types';

const CARD_WIDTH = 256;
const CARD_HEIGHT = 356;
const CORNER_PAD = 16;
const CORNER_FONT = 36;
const SUIT_FONT = 48;
const CENTER_FONT = 100;

// Dark modern palette
const BG_COLOR = '#030306';
const BORDER_OUTER = '#0f0f16';

// Hand colors - bright neon (ALL elements use these)
export const PLAYER_GLOW = '#4ade80'; // Brighter green
export const BANKER_GLOW = '#f87171'; // Brighter red
const NEUTRAL_GLOW = '#94a3b8';

const textureCache = new Map<string, THREE.Texture>();
let backTexture: THREE.Texture | null = null;
let blankTexture: THREE.Texture | null = null;

// Force regenerate textures (call after design changes)
export const clearTextureCache = () => {
  textureCache.clear();
  backTexture?.dispose();
  backTexture = null;
  blankTexture?.dispose();
  blankTexture = null;
};

const configureTexture = (texture: THREE.CanvasTexture) => {
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  return texture;
};

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

// Monochromatic neon card - sharp text, no blur
const drawCardFront = (
  ctx: CanvasRenderingContext2D,
  card: Card,
  handColor: string = NEUTRAL_GLOW
) => {
  // Dark background
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Outer border - subtle
  ctx.strokeStyle = BORDER_OUTER;
  ctx.lineWidth = 3;
  drawRoundedRect(ctx, 4, 4, CARD_WIDTH - 8, CARD_HEIGHT - 8, 14);
  ctx.stroke();

  // Inner border - bright neon line
  ctx.strokeStyle = handColor;
  ctx.lineWidth = 3;
  drawRoundedRect(ctx, 10, 10, CARD_WIDTH - 20, CARD_HEIGHT - 20, 10);
  ctx.stroke();

  // Center suit - large, sharp
  ctx.fillStyle = handColor;
  ctx.font = `700 ${CENTER_FONT}px "Courier New", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(card.suit, CARD_WIDTH / 2, CARD_HEIGHT / 2 + 4);

  // Top-left corner - sharp
  ctx.font = `700 ${CORNER_FONT}px "Courier New", monospace`;
  ctx.textAlign = 'left';
  ctx.fillText(card.rank, CORNER_PAD, CORNER_PAD + CORNER_FONT);
  ctx.font = `700 ${SUIT_FONT}px "Courier New", monospace`;
  ctx.fillText(card.suit, CORNER_PAD, CORNER_PAD + CORNER_FONT + SUIT_FONT - 8);

  // Bottom-right corner (rotated)
  ctx.save();
  ctx.translate(CARD_WIDTH - CORNER_PAD, CARD_HEIGHT - CORNER_PAD);
  ctx.rotate(Math.PI);
  ctx.font = `700 ${CORNER_FONT}px "Courier New", monospace`;
  ctx.textAlign = 'left';
  ctx.fillText(card.rank, 0, CORNER_FONT);
  ctx.font = `700 ${SUIT_FONT}px "Courier New", monospace`;
  ctx.fillText(card.suit, 0, CORNER_FONT + SUIT_FONT - 8);
  ctx.restore();
};

// Translucent card back with glowing "/" logo
const drawCardBack = (ctx: CanvasRenderingContext2D) => {
  // Semi-transparent dark background
  ctx.fillStyle = 'rgba(8, 8, 12, 0.85)';
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Subtle border glow
  ctx.strokeStyle = 'rgba(100, 200, 150, 0.3)';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, 6, 6, CARD_WIDTH - 12, CARD_HEIGHT - 12, 12);
  ctx.stroke();

  // Inner subtle border
  ctx.strokeStyle = 'rgba(100, 200, 150, 0.15)';
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, 14, 14, CARD_WIDTH - 28, CARD_HEIGHT - 28, 8);
  ctx.stroke();

  // Glowing "/" logo - large and centered
  const slashSize = 140;
  ctx.save();

  // Outer glow layers
  ctx.shadowColor = '#22ff88';
  ctx.shadowBlur = 40;
  ctx.fillStyle = 'rgba(34, 255, 136, 0.15)';
  ctx.font = `900 ${slashSize}px "Courier New", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('/', CARD_WIDTH / 2, CARD_HEIGHT / 2);

  // Mid glow
  ctx.shadowBlur = 25;
  ctx.fillStyle = 'rgba(34, 255, 136, 0.35)';
  ctx.fillText('/', CARD_WIDTH / 2, CARD_HEIGHT / 2);

  // Inner bright core
  ctx.shadowBlur = 12;
  ctx.fillStyle = 'rgba(150, 255, 200, 0.7)';
  ctx.fillText('/', CARD_WIDTH / 2, CARD_HEIGHT / 2);

  // Bright center stroke
  ctx.shadowBlur = 5;
  ctx.fillStyle = 'rgba(220, 255, 240, 0.9)';
  ctx.fillText('/', CARD_WIDTH / 2, CARD_HEIGHT / 2);

  ctx.restore();
};

// Blank/unknown card
const drawBlankFace = (ctx: CanvasRenderingContext2D) => {
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  ctx.strokeStyle = BORDER_OUTER;
  ctx.lineWidth = 5;
  drawRoundedRect(ctx, 8, 8, CARD_WIDTH - 16, CARD_HEIGHT - 16, 14);
  ctx.stroke();

  ctx.fillStyle = 'rgba(100, 116, 139, 0.4)';
  ctx.font = '700 64px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', CARD_WIDTH / 2, CARD_HEIGHT / 2);
};

const createTexture = (draw: (ctx: CanvasRenderingContext2D) => void) => {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);
  draw(ctx);
  return configureTexture(new THREE.CanvasTexture(canvas));
};

export const getCardBackTexture = () => {
  if (!backTexture) {
    backTexture = createTexture(drawCardBack);
  }
  return backTexture;
};

// Get card texture with optional hand color for border
export const getCardTexture = (
  card: Card | null,
  handColor: string = NEUTRAL_GLOW
) => {
  if (!card) {
    if (!blankTexture) {
      blankTexture = createTexture(drawBlankFace);
    }
    return blankTexture;
  }

  // Cache key includes hand color
  const key = `${card.rank}${card.suit}_${handColor}`;
  const cached = textureCache.get(key);
  if (cached) return cached;

  const texture = createTexture((ctx) => drawCardFront(ctx, card, handColor));
  textureCache.set(key, texture);
  return texture;
};

// Convenience methods for Baccarat
export const getPlayerCardTexture = (card: Card | null) =>
  getCardTexture(card, PLAYER_GLOW);

export const getBankerCardTexture = (card: Card | null) =>
  getCardTexture(card, BANKER_GLOW);
