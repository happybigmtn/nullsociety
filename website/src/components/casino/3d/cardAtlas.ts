import * as THREE from 'three';
import { Card, Rank, Suit } from '../../../types';

const CARD_WIDTH = 256;
const CARD_HEIGHT = 356;
const CORNER_PAD = 16;
const CORNER_FONT = 36;
const SUIT_FONT = 48;
const CENTER_FONT = 100;

const BG_COLOR = '#020207';
const BORDER_OUTER = '#101018';
const FACE_COLOR = '#e2e8f0';

const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];

let atlasTexture: THREE.CanvasTexture | null = null;

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

const drawCardFront = (ctx: CanvasRenderingContext2D, card: Card, x: number, y: number) => {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  ctx.strokeStyle = BORDER_OUTER;
  ctx.lineWidth = 3;
  drawRoundedRect(ctx, 4, 4, CARD_WIDTH - 8, CARD_HEIGHT - 8, 14);
  ctx.stroke();

  ctx.strokeStyle = FACE_COLOR;
  ctx.lineWidth = 3;
  drawRoundedRect(ctx, 10, 10, CARD_WIDTH - 20, CARD_HEIGHT - 20, 10);
  ctx.stroke();

  ctx.fillStyle = FACE_COLOR;
  ctx.font = `700 ${CENTER_FONT}px "Courier New", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(card.suit, CARD_WIDTH / 2, CARD_HEIGHT / 2 + 4);

  ctx.font = `700 ${CORNER_FONT}px "Courier New", monospace`;
  ctx.textAlign = 'left';
  ctx.fillText(card.rank, CORNER_PAD, CORNER_PAD + CORNER_FONT);
  ctx.font = `700 ${SUIT_FONT}px "Courier New", monospace`;
  ctx.fillText(card.suit, CORNER_PAD, CORNER_PAD + CORNER_FONT + SUIT_FONT - 8);

  ctx.save();
  ctx.translate(CARD_WIDTH - CORNER_PAD, CARD_HEIGHT - CORNER_PAD);
  ctx.rotate(Math.PI);
  ctx.font = `700 ${CORNER_FONT}px "Courier New", monospace`;
  ctx.textAlign = 'left';
  ctx.fillText(card.rank, 0, CORNER_FONT);
  ctx.font = `700 ${SUIT_FONT}px "Courier New", monospace`;
  ctx.fillText(card.suit, 0, CORNER_FONT + SUIT_FONT - 8);
  ctx.restore();

  ctx.restore();
};

export const getCardAtlasTexture = () => {
  if (atlasTexture) return atlasTexture;
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH * RANKS.length;
  canvas.height = CARD_HEIGHT * SUITS.length;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    SUITS.forEach((suit, row) => {
      RANKS.forEach((rank, col) => {
        drawCardFront(
          ctx,
          { suit, rank, value: 0 },
          col * CARD_WIDTH,
          row * CARD_HEIGHT
        );
      });
    });
  }
  atlasTexture = configureTexture(new THREE.CanvasTexture(canvas));
  return atlasTexture;
};

export const getCardAtlasFrame = (card: Card) => {
  const col = Math.max(0, RANKS.indexOf(card.rank));
  const row = Math.max(0, SUITS.indexOf(card.suit));
  const repeat = new THREE.Vector2(1 / RANKS.length, 1 / SUITS.length);
  const offset = new THREE.Vector2(col / RANKS.length, 1 - (row + 1) / SUITS.length);
  return { offset, repeat };
};
