import * as THREE from 'three';
import { Card } from '../../../types';

const CARD_WIDTH = 256;
const CARD_HEIGHT = 356;
const CORNER_PAD = 18;
const CORNER_FONT = 40;
const SUIT_FONT = 54;
const CENTER_FONT = 120;

const RED_SUITS = new Set(['♥', '♦']);
const BACKGROUND_COLOR = '#0b0f13';
const BORDER_COLOR = '#1f2937';
const GOLD_ACCENT = '#facc15';

const textureCache = new Map<string, THREE.Texture>();
let backTexture: THREE.Texture | null = null;
let blankTexture: THREE.Texture | null = null;

const configureTexture = (texture: THREE.CanvasTexture) => {
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  return texture;
};

const drawRoundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

const drawCardFront = (ctx: CanvasRenderingContext2D, card: Card) => {
  const isRed = RED_SUITS.has(card.suit);
  const ink = isRed ? '#ef4444' : '#e2e8f0';
  const shadow = isRed ? 'rgba(239, 68, 68, 0.18)' : 'rgba(148, 163, 184, 0.18)';

  ctx.fillStyle = BACKGROUND_COLOR;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  ctx.strokeStyle = BORDER_COLOR;
  ctx.lineWidth = 8;
  drawRoundedRect(ctx, 8, 8, CARD_WIDTH - 16, CARD_HEIGHT - 16, 18);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(34, 197, 94, 0.35)';
  ctx.lineWidth = 3;
  drawRoundedRect(ctx, 18, 18, CARD_WIDTH - 36, CARD_HEIGHT - 36, 14);
  ctx.stroke();

  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.ellipse(CARD_WIDTH / 2, CARD_HEIGHT / 2, 80, 110, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = ink;
  ctx.font = `700 ${CENTER_FONT}px "Courier New", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(card.suit, CARD_WIDTH / 2, CARD_HEIGHT / 2 + 6);

  ctx.font = `700 ${CORNER_FONT}px "Courier New", monospace`;
  ctx.textAlign = 'left';
  ctx.fillText(card.rank, CORNER_PAD, CORNER_PAD + CORNER_FONT);
  ctx.font = `700 ${SUIT_FONT}px "Courier New", monospace`;
  ctx.fillText(card.suit, CORNER_PAD, CORNER_PAD + CORNER_FONT + SUIT_FONT - 6);

  ctx.save();
  ctx.translate(CARD_WIDTH - CORNER_PAD, CARD_HEIGHT - CORNER_PAD);
  ctx.rotate(Math.PI);
  ctx.font = `700 ${CORNER_FONT}px "Courier New", monospace`;
  ctx.textAlign = 'left';
  ctx.fillText(card.rank, 0, CORNER_FONT);
  ctx.font = `700 ${SUIT_FONT}px "Courier New", monospace`;
  ctx.fillText(card.suit, 0, CORNER_FONT + SUIT_FONT - 6);
  ctx.restore();
};

const drawCardBack = (ctx: CanvasRenderingContext2D) => {
  ctx.fillStyle = '#050608';
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  gradient.addColorStop(0, '#0f172a');
  gradient.addColorStop(0.5, '#020617');
  gradient.addColorStop(1, '#111827');
  ctx.fillStyle = gradient;
  ctx.fillRect(12, 12, CARD_WIDTH - 24, CARD_HEIGHT - 24);

  ctx.strokeStyle = BORDER_COLOR;
  ctx.lineWidth = 6;
  drawRoundedRect(ctx, 10, 10, CARD_WIDTH - 20, CARD_HEIGHT - 20, 16);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(34, 197, 94, 0.35)';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, 22, 22, CARD_WIDTH - 44, CARD_HEIGHT - 44, 12);
  ctx.stroke();

  ctx.fillStyle = 'rgba(16, 185, 129, 0.18)';
  for (let i = 0; i < 6; i += 1) {
    ctx.beginPath();
    ctx.arc(CARD_WIDTH / 2, CARD_HEIGHT / 2, 20 + i * 18, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = GOLD_ACCENT;
  ctx.font = '700 26px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('NULLSOCIETY', CARD_WIDTH / 2, CARD_HEIGHT / 2 - 10);
  ctx.font = '700 18px "Courier New", monospace';
  ctx.fillText('BACCARAT', CARD_WIDTH / 2, CARD_HEIGHT / 2 + 20);
};

const drawBlankFace = (ctx: CanvasRenderingContext2D) => {
  ctx.fillStyle = BACKGROUND_COLOR;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  ctx.strokeStyle = BORDER_COLOR;
  ctx.lineWidth = 6;
  drawRoundedRect(ctx, 10, 10, CARD_WIDTH - 20, CARD_HEIGHT - 20, 16);
  ctx.stroke();

  ctx.fillStyle = 'rgba(100, 116, 139, 0.5)';
  ctx.font = '700 72px "Courier New", monospace';
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

export const getCardTexture = (card: Card | null) => {
  if (!card) {
    if (!blankTexture) {
      blankTexture = createTexture(drawBlankFace);
    }
    return blankTexture;
  }
  const key = `${card.rank}${card.suit}`;
  const cached = textureCache.get(key);
  if (cached) return cached;
  const texture = createTexture((ctx) => drawCardFront(ctx, card));
  textureCache.set(key, texture);
  return texture;
};
