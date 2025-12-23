import * as THREE from 'three';
import { Card } from '../../../types';

const CARD_WIDTH = 256;
const CARD_HEIGHT = 356;
const CORNER_PAD = 18;
const CORNER_FONT = 34;
const CORNER_SUIT = 24;
const CENTER_PIP = 110;

// Photorealistic palette
const PAPER_BASE = '#f7f3ea';
const PAPER_SHADOW = '#ebe2d4';
const BORDER_OUTER = '#cdbda8';
const BORDER_INNER = '#fdfaf4';
const INK_BLACK = '#1b1a18';
const INK_RED = '#b0222c';

const BACK_BASE = '#1c2b3d';
const BACK_DARK = '#121825';
const BACK_ACCENT = '#b08b4f';

const textureCache = new Map<string, THREE.Texture>();
let backTexture: THREE.Texture | null = null;
let blankTexture: THREE.Texture | null = null;
let paperNormalMap: THREE.Texture | null = null;
let paperRoughnessMap: THREE.Texture | null = null;

// Force regenerate textures (call after design changes)
export const clearTextureCache = () => {
  textureCache.clear();
  backTexture?.dispose();
  backTexture = null;
  blankTexture?.dispose();
  blankTexture = null;
  paperNormalMap?.dispose();
  paperNormalMap = null;
  paperRoughnessMap?.dispose();
  paperRoughnessMap = null;
};

const configureTexture = (texture: THREE.CanvasTexture) => {
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  return texture;
};

const createFallbackTexture = () => {
  const texture = new THREE.Texture();
  texture.needsUpdate = true;
  return texture;
};

const makeRng = (seed: number) => {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const createNoiseCanvas = (size: number, seed: number, amplitude: number) => {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const image = ctx.createImageData(size, size);
  const data = image.data;
  const rng = makeRng(seed);
  for (let i = 0; i < data.length; i += 4) {
    const n = Math.floor((rng() - 0.5) * amplitude);
    const v = 128 + n;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
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

const drawPaperBase = (ctx: CanvasRenderingContext2D, seed: number) => {
  const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  gradient.addColorStop(0, PAPER_BASE);
  gradient.addColorStop(1, PAPER_SHADOW);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  const noise = createNoiseCanvas(64, seed, 18);
  if (noise) {
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.drawImage(noise, 0, 0, CARD_WIDTH, CARD_HEIGHT);
    ctx.restore();
  }
};

const getSuitColor = (suit: Card['suit']) =>
  suit === '♥' || suit === '♦' ? INK_RED : INK_BLACK;

const drawDiamond = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => {
  ctx.beginPath();
  ctx.moveTo(x, y - size * 0.55);
  ctx.lineTo(x + size * 0.55, y);
  ctx.lineTo(x, y + size * 0.55);
  ctx.lineTo(x - size * 0.55, y);
  ctx.closePath();
  ctx.fill();
};

const drawHeart = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => {
  const top = size * 0.25;
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.5);
  ctx.bezierCurveTo(x - size * 0.6, y + top, x - size * 0.4, y - size * 0.35, x, y - size * 0.1);
  ctx.bezierCurveTo(x + size * 0.4, y - size * 0.35, x + size * 0.6, y + top, x, y + size * 0.5);
  ctx.closePath();
  ctx.fill();
};

const drawSpade = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => {
  ctx.beginPath();
  ctx.moveTo(x, y - size * 0.55);
  ctx.bezierCurveTo(x - size * 0.6, y - size * 0.1, x - size * 0.4, y + size * 0.35, x, y + size * 0.1);
  ctx.bezierCurveTo(x + size * 0.4, y + size * 0.35, x + size * 0.6, y - size * 0.1, x, y - size * 0.55);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(x - size * 0.15, y + size * 0.1);
  ctx.lineTo(x + size * 0.15, y + size * 0.1);
  ctx.lineTo(x + size * 0.05, y + size * 0.6);
  ctx.lineTo(x - size * 0.05, y + size * 0.6);
  ctx.closePath();
  ctx.fill();
};

const drawClub = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => {
  const r = size * 0.3;
  ctx.beginPath();
  ctx.arc(x - r, y, r, 0, Math.PI * 2);
  ctx.arc(x + r, y, r, 0, Math.PI * 2);
  ctx.arc(x, y - r, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(x - size * 0.15, y + r * 0.5);
  ctx.lineTo(x + size * 0.15, y + r * 0.5);
  ctx.lineTo(x + size * 0.05, y + size * 0.75);
  ctx.lineTo(x - size * 0.05, y + size * 0.75);
  ctx.closePath();
  ctx.fill();
};

const drawSuit = (
  ctx: CanvasRenderingContext2D,
  suit: Card['suit'],
  x: number,
  y: number,
  size: number
) => {
  switch (suit) {
    case '♥':
      drawHeart(ctx, x, y, size);
      break;
    case '♦':
      drawDiamond(ctx, x, y, size);
      break;
    case '♠':
      drawSpade(ctx, x, y, size);
      break;
    case '♣':
      drawClub(ctx, x, y, size);
      break;
    default:
      drawDiamond(ctx, x, y, size);
      break;
  }
};

const drawRank = (
  ctx: CanvasRenderingContext2D,
  rank: Card['rank'],
  x: number,
  y: number,
  align: CanvasTextAlign,
  color: string
) => {
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  const fontSize = rank === '10' ? CORNER_FONT - 6 : CORNER_FONT;
  ctx.font = `700 ${fontSize}px "Times New Roman", "Georgia", serif`;
  ctx.fillText(rank, x, y);
  return fontSize;
};

const drawCardFront = (ctx: CanvasRenderingContext2D, card: Card) => {
  drawPaperBase(ctx, 1914 + card.rank.charCodeAt(0) + card.suit.charCodeAt(0));

  ctx.strokeStyle = BORDER_OUTER;
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, 4, 4, CARD_WIDTH - 8, CARD_HEIGHT - 8, 14);
  ctx.stroke();

  ctx.strokeStyle = BORDER_INNER;
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, 10, 10, CARD_WIDTH - 20, CARD_HEIGHT - 20, 12);
  ctx.stroke();

  const suitColor = getSuitColor(card.suit);

  const cornerFontSize = drawRank(ctx, card.rank, CORNER_PAD, CORNER_PAD, 'left', suitColor);
  ctx.fillStyle = suitColor;
  drawSuit(ctx, card.suit, CORNER_PAD + 6, CORNER_PAD + cornerFontSize + CORNER_SUIT * 0.6, CORNER_SUIT * 0.65);

  ctx.save();
  ctx.translate(CARD_WIDTH - CORNER_PAD, CARD_HEIGHT - CORNER_PAD);
  ctx.rotate(Math.PI);
  const bottomFont = drawRank(ctx, card.rank, 0, 0, 'left', suitColor);
  ctx.fillStyle = suitColor;
  drawSuit(ctx, card.suit, 6, bottomFont + CORNER_SUIT * 0.6, CORNER_SUIT * 0.65);
  ctx.restore();

  ctx.fillStyle = suitColor;
  if (['J', 'Q', 'K'].includes(card.rank)) {
    ctx.font = `700 96px "Times New Roman", "Georgia", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(card.rank, CARD_WIDTH / 2, CARD_HEIGHT / 2 - 24);
    drawSuit(ctx, card.suit, CARD_WIDTH / 2, CARD_HEIGHT / 2 + 48, 36);
  } else {
    const pipSize = card.rank === 'A' ? CENTER_PIP : CENTER_PIP * 0.85;
    drawSuit(ctx, card.suit, CARD_WIDTH / 2, CARD_HEIGHT / 2 + 6, pipSize * 0.45);
  }
};

const drawCardBack = (ctx: CanvasRenderingContext2D) => {
  const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  gradient.addColorStop(0, BACK_BASE);
  gradient.addColorStop(1, BACK_DARK);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  const noise = createNoiseCanvas(64, 9021, 26);
  if (noise) {
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.drawImage(noise, 0, 0, CARD_WIDTH, CARD_HEIGHT);
    ctx.restore();
  }

  ctx.strokeStyle = 'rgba(176, 139, 79, 0.25)';
  ctx.lineWidth = 1;
  for (let x = -CARD_HEIGHT; x < CARD_WIDTH + CARD_HEIGHT; x += 18) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + CARD_HEIGHT, CARD_HEIGHT);
    ctx.stroke();
  }
  for (let x = -CARD_HEIGHT; x < CARD_WIDTH + CARD_HEIGHT; x += 18) {
    ctx.beginPath();
    ctx.moveTo(x, CARD_HEIGHT);
    ctx.lineTo(x + CARD_HEIGHT, 0);
    ctx.stroke();
  }

  ctx.strokeStyle = BACK_ACCENT;
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, 6, 6, CARD_WIDTH - 12, CARD_HEIGHT - 12, 12);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 235, 210, 0.35)';
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, 14, 14, CARD_WIDTH - 28, CARD_HEIGHT - 28, 10);
  ctx.stroke();

  ctx.save();
  ctx.fillStyle = 'rgba(255, 235, 210, 0.2)';
  ctx.beginPath();
  ctx.arc(CARD_WIDTH / 2, CARD_HEIGHT / 2, 48, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 235, 210, 0.45)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 235, 210, 0.6)';
  ctx.font = '700 72px "Times New Roman", "Georgia", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('/', CARD_WIDTH / 2, CARD_HEIGHT / 2);
  ctx.restore();
};

const drawBlankFace = (ctx: CanvasRenderingContext2D) => {
  drawPaperBase(ctx, 7777);
  ctx.strokeStyle = BORDER_OUTER;
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, 6, 6, CARD_WIDTH - 12, CARD_HEIGHT - 12, 14);
  ctx.stroke();

  ctx.fillStyle = 'rgba(110, 104, 94, 0.5)';
  ctx.font = '700 64px "Times New Roman", "Georgia", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', CARD_WIDTH / 2, CARD_HEIGHT / 2);
};

const createTexture = (draw: (ctx: CanvasRenderingContext2D) => void) => {
  if (typeof document === 'undefined') return createFallbackTexture();
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);
  draw(ctx);
  return configureTexture(new THREE.CanvasTexture(canvas));
};

const createNormalTexture = (seed: number) => {
  if (typeof document === 'undefined') return createFallbackTexture();
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return configureTexture(new THREE.CanvasTexture(canvas));
  const image = ctx.createImageData(size, size);
  const data = image.data;
  const rng = makeRng(seed);
  for (let i = 0; i < data.length; i += 4) {
    const n = (rng() - 0.5) * 0.18;
    const v = 128 + Math.round(n * 255);
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = 255;
    data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  const texture = configureTexture(new THREE.CanvasTexture(canvas));
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  return texture;
};

const createRoughnessTexture = (seed: number) => {
  if (typeof document === 'undefined') return createFallbackTexture();
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return configureTexture(new THREE.CanvasTexture(canvas));
  const image = ctx.createImageData(size, size);
  const data = image.data;
  const rng = makeRng(seed);
  for (let i = 0; i < data.length; i += 4) {
    const n = (rng() - 0.5) * 26;
    const base = 210 + n;
    data[i] = base;
    data[i + 1] = base;
    data[i + 2] = base;
    data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  const texture = configureTexture(new THREE.CanvasTexture(canvas));
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  return texture;
};

export const getCardBackTexture = () => {
  if (!backTexture) {
    backTexture = createTexture(drawCardBack);
  }
  return backTexture;
};

export const getCardNormalMap = () => {
  if (!paperNormalMap) {
    paperNormalMap = createNormalTexture(3344);
  }
  return paperNormalMap;
};

export const getCardRoughnessMap = () => {
  if (!paperRoughnessMap) {
    paperRoughnessMap = createRoughnessTexture(5128);
  }
  return paperRoughnessMap;
};

export const getCardTexture = (card: Card | null, _handColor?: string) => {
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

export const getPlayerCardTexture = (card: Card | null) =>
  getCardTexture(card);

export const getBankerCardTexture = (card: Card | null) =>
  getCardTexture(card);
