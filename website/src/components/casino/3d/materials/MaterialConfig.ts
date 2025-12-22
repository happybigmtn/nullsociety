/**
 * Material Configuration - PBR material presets for casino environment
 *
 * All materials use physically-based rendering with HDR environment maps.
 * Emissive values > 1.0 drive bloom effects in post-processing.
 */

import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// Material Preset Types
// ─────────────────────────────────────────────────────────────────────────────

export interface MaterialPreset {
  roughness: number;
  metalness: number;
  envMapIntensity: number;
  color?: string;
  emissive?: string;
  emissiveIntensity?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
}

// ─────────────────────────────────────────────────────────────────────────────
// Casino Material Presets
// ─────────────────────────────────────────────────────────────────────────────

export const MATERIAL_PRESETS: Record<string, MaterialPreset> = {
  // Table felt - soft, non-reflective fabric
  felt: {
    roughness: 0.95,
    metalness: 0.02,
    envMapIntensity: 0.15,
    color: '#0f3a2e', // Deep casino green
  },

  // Alternate felt colors
  feltRed: {
    roughness: 0.95,
    metalness: 0.02,
    envMapIntensity: 0.15,
    color: '#4a1515', // Deep red for baccarat
  },

  feltBlue: {
    roughness: 0.95,
    metalness: 0.02,
    envMapIntensity: 0.15,
    color: '#1a2a4a', // Navy blue for special tables
  },

  // Chrome elements (wheel, decorations)
  chrome: {
    roughness: 0.08,
    metalness: 1.0,
    envMapIntensity: 1.2,
    color: '#b0b8c0',
  },

  // Polished wood (table rails, shoe)
  polishedWood: {
    roughness: 0.35,
    metalness: 0.15,
    envMapIntensity: 0.6,
    color: '#4a2918',
    clearcoat: 0.5,
    clearcoatRoughness: 0.25,
  },

  // Darker wood variant (mahogany)
  darkWood: {
    roughness: 0.4,
    metalness: 0.1,
    envMapIntensity: 0.5,
    color: '#2a1a0a',
    clearcoat: 0.4,
    clearcoatRoughness: 0.3,
  },

  // Card face (slightly glossy paper)
  cardFace: {
    roughness: 0.45,
    metalness: 0.1,
    envMapIntensity: 0.4,
    color: '#ffffff',
  },

  // Card back (textured pattern)
  cardBack: {
    roughness: 0.6,
    metalness: 0.05,
    envMapIntensity: 0.3,
    color: '#c41e3a', // Classic red back
  },

  // Casino chips (layered plastic)
  chip: {
    roughness: 0.4,
    metalness: 0.2,
    envMapIntensity: 0.5,
    color: '#ffffff', // Base, colored by texture
  },

  chipGold: {
    roughness: 0.25,
    metalness: 0.8,
    envMapIntensity: 0.9,
    color: '#ffd700',
    emissive: '#ffaa00',
    emissiveIntensity: 0.05,
  },

  // Dice (high-quality acrylic)
  dice: {
    roughness: 0.28,
    metalness: 0.18,
    envMapIntensity: 0.6,
    color: '#f5f5f5', // Slightly off-white
  },

  diceRed: {
    roughness: 0.28,
    metalness: 0.18,
    envMapIntensity: 0.6,
    color: '#cc1111',
  },

  // Roulette ball (ivory/ceramic look)
  rouletteBall: {
    roughness: 0.15,
    metalness: 0.05,
    envMapIntensity: 0.8,
    color: '#f8f8f0', // Warm ivory
  },

  // Roulette wheel numbers (lacquered)
  wheelRed: {
    roughness: 0.2,
    metalness: 0.1,
    envMapIntensity: 0.7,
    color: '#cc0000',
    clearcoat: 0.8,
    clearcoatRoughness: 0.1,
  },

  wheelBlack: {
    roughness: 0.2,
    metalness: 0.1,
    envMapIntensity: 0.7,
    color: '#111111',
    clearcoat: 0.8,
    clearcoatRoughness: 0.1,
  },

  wheelGreen: {
    roughness: 0.2,
    metalness: 0.1,
    envMapIntensity: 0.7,
    color: '#006600',
    clearcoat: 0.8,
    clearcoatRoughness: 0.1,
  },

  // Gold accents
  gold: {
    roughness: 0.2,
    metalness: 0.9,
    envMapIntensity: 1.0,
    color: '#ffd700',
    emissive: '#ffaa00',
    emissiveIntensity: 0.15,
  },

  // Brass (aged gold)
  brass: {
    roughness: 0.35,
    metalness: 0.85,
    envMapIntensity: 0.8,
    color: '#b5a642',
  },

  // Glass (for covers, displays)
  glass: {
    roughness: 0.05,
    metalness: 0.0,
    envMapIntensity: 1.5,
    color: '#ffffff',
    transparent: true,
    opacity: 0.3,
  },

  // Rubber (pyramid wall, deflectors)
  rubber: {
    roughness: 0.85,
    metalness: 0.0,
    envMapIntensity: 0.1,
    color: '#1a1a1a',
  },

  // Leather (seating, rails)
  leather: {
    roughness: 0.7,
    metalness: 0.0,
    envMapIntensity: 0.3,
    color: '#3d2817',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Material Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a MeshStandardMaterial from a preset
 */
export function createMaterialFromPreset(
  presetName: string,
  overrides?: Partial<MaterialPreset>
): THREE.MeshStandardMaterial {
  const preset = { ...MATERIAL_PRESETS[presetName], ...overrides };

  if (!preset) {
    console.warn(`Material preset "${presetName}" not found, using defaults`);
    return new THREE.MeshStandardMaterial();
  }

  return new THREE.MeshStandardMaterial({
    color: preset.color ? new THREE.Color(preset.color) : undefined,
    roughness: preset.roughness,
    metalness: preset.metalness,
    envMapIntensity: preset.envMapIntensity,
    emissive: preset.emissive ? new THREE.Color(preset.emissive) : undefined,
    emissiveIntensity: preset.emissiveIntensity ?? 0,
    transparent: preset.transparent ?? false,
    opacity: preset.opacity ?? 1,
    side: preset.side ?? THREE.FrontSide,
  });
}

/**
 * Create a MeshPhysicalMaterial for clearcoat materials
 */
export function createPhysicalMaterialFromPreset(
  presetName: string,
  overrides?: Partial<MaterialPreset>
): THREE.MeshPhysicalMaterial {
  const preset = { ...MATERIAL_PRESETS[presetName], ...overrides };

  if (!preset) {
    console.warn(`Material preset "${presetName}" not found, using defaults`);
    return new THREE.MeshPhysicalMaterial();
  }

  return new THREE.MeshPhysicalMaterial({
    color: preset.color ? new THREE.Color(preset.color) : undefined,
    roughness: preset.roughness,
    metalness: preset.metalness,
    envMapIntensity: preset.envMapIntensity,
    emissive: preset.emissive ? new THREE.Color(preset.emissive) : undefined,
    emissiveIntensity: preset.emissiveIntensity ?? 0,
    clearcoat: preset.clearcoat ?? 0,
    clearcoatRoughness: preset.clearcoatRoughness ?? 0,
    transparent: preset.transparent ?? false,
    opacity: preset.opacity ?? 1,
    side: preset.side ?? THREE.FrontSide,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Emissive Materials (for bloom effects)
// ─────────────────────────────────────────────────────────────────────────────

export interface EmissiveConfig {
  baseColor: string;
  emissiveColor: string;
  /** Values > 1.0 drive bloom in post-processing */
  intensity: number;
  pulsate?: boolean;
  pulseSpeed?: number;
}

export const EMISSIVE_PRESETS: Record<string, EmissiveConfig> = {
  lightningYellow: {
    baseColor: '#ffff00',
    emissiveColor: '#ffff44',
    intensity: 8.0,
    pulsate: true,
    pulseSpeed: 6.0,
  },

  lightningBlue: {
    baseColor: '#4488ff',
    emissiveColor: '#6699ff',
    intensity: 6.0,
    pulsate: true,
    pulseSpeed: 5.0,
  },

  winGold: {
    baseColor: '#ffd700',
    emissiveColor: '#ffaa00',
    intensity: 4.0,
    pulsate: true,
    pulseSpeed: 3.0,
  },

  jackpot: {
    baseColor: '#ff00ff',
    emissiveColor: '#ff44ff',
    intensity: 10.0,
    pulsate: true,
    pulseSpeed: 8.0,
  },

  // Terminal aesthetic
  terminalGreen: {
    baseColor: '#22ff88',
    emissiveColor: '#44ffaa',
    intensity: 2.0,
    pulsate: false,
  },

  // Red envelope (Baccarat bonus)
  redEnvelope: {
    baseColor: '#ff2222',
    emissiveColor: '#ff4444',
    intensity: 3.0,
    pulsate: true,
    pulseSpeed: 2.0,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Lighting Presets
// ─────────────────────────────────────────────────────────────────────────────

export type LightingPreset = 'speakeasy' | 'casino' | 'vip' | 'lightning';

export interface LightingConfig {
  ambientColor: string;
  ambientIntensity: number;
  keyLightColor: string;
  keyLightIntensity: number;
  fillLightColor: string;
  fillLightIntensity: number;
  exposure: number;
  bloomIntensity: number;
}

export const LIGHTING_PRESETS: Record<LightingPreset, LightingConfig> = {
  // Speakeasy: warm amber jazz club vibes
  speakeasy: {
    ambientColor: '#2a1a0a',
    ambientIntensity: 0.4,
    keyLightColor: '#ffaa55',
    keyLightIntensity: 1.2,
    fillLightColor: '#553311',
    fillLightIntensity: 0.3,
    exposure: 0.9,
    bloomIntensity: 0.8,
  },

  // Casino: terminal aesthetic with neon green
  casino: {
    ambientColor: '#0a1a0a',
    ambientIntensity: 0.3,
    keyLightColor: '#22ff88',
    keyLightIntensity: 0.8,
    fillLightColor: '#001a00',
    fillLightIntensity: 0.2,
    exposure: 1.0,
    bloomIntensity: 1.5,
  },

  // VIP: luxurious gold accents
  vip: {
    ambientColor: '#1a1510',
    ambientIntensity: 0.35,
    keyLightColor: '#ffd700',
    keyLightIntensity: 1.0,
    fillLightColor: '#442200',
    fillLightIntensity: 0.4,
    exposure: 1.1,
    bloomIntensity: 1.2,
  },

  // Lightning: high-contrast cool blue for effects
  lightning: {
    ambientColor: '#0a0a1a',
    ambientIntensity: 0.25,
    keyLightColor: '#6688ff',
    keyLightIntensity: 0.6,
    fillLightColor: '#111133',
    fillLightIntensity: 0.15,
    exposure: 0.8,
    bloomIntensity: 2.5,
  },
};
