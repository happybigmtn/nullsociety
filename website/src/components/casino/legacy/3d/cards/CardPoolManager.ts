import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Card } from '../../../../types';
import { getCardBackTexture, getCardNormalMap, getCardRoughnessMap, getCardTexture } from '../cardTextures';

export interface PooledCard {
  mesh: THREE.Mesh;
  updateCard: (card: Card | null, options?: { isSelected?: boolean }) => void;
  dispose: () => void;
}

interface PoolConfig {
  size?: [number, number, number];
}

const SELECTED_COLOR = new THREE.Color('#d6b56f');
const OPPONENT_COLOR = new THREE.Color('#7a2f2f');
const NEUTRAL_COLOR = new THREE.Color('#e6dccb');

export class CardPoolManager {
  private readonly poolSize: number;
  private readonly geometry: THREE.BufferGeometry;
  private readonly pool: PooledCard[] = [];
  private readonly active = new Set<PooledCard>();

  constructor(poolSize: number, config: PoolConfig = {}) {
    this.poolSize = poolSize;
    const [width, height, thickness] = config.size ?? [1.1, 1.6, 0.03];
    const depthForRadius = Math.max(thickness, Math.min(width, height) * 0.22);
    const cornerRadius = Math.min(width, height) * 0.08;
    this.geometry = new RoundedBoxGeometry(width, height, depthForRadius, 4, cornerRadius);
  }

  checkout(card: Card | null, options?: { isSelected?: boolean }): PooledCard {
    const pooled = this.pool.pop() ?? this.createCard();
    this.active.add(pooled);
    pooled.updateCard(card, options);
    pooled.mesh.visible = Boolean(card);
    return pooled;
  }

  release(pooled: PooledCard): void {
    if (!this.active.has(pooled)) return;
    this.active.delete(pooled);
    pooled.mesh.visible = false;
    pooled.mesh.position.set(0, 0, 0);
    pooled.mesh.rotation.set(0, 0, 0);
    this.pool.push(pooled);
  }

  dispose(): void {
    [...this.active, ...this.pool].forEach((card) => card.dispose());
    this.active.clear();
    this.pool.length = 0;
    this.geometry.dispose();
  }

  private createCard(): PooledCard {
    const normalMap = getCardNormalMap();
    const roughnessMap = getCardRoughnessMap();

    const frontMaterial = new THREE.MeshPhysicalMaterial({
      roughness: 0.35,
      metalness: 0.0,
      envMapIntensity: 0.6,
      clearcoat: 0.35,
      clearcoatRoughness: 0.2,
      normalMap,
      roughnessMap,
      normalScale: new THREE.Vector2(0.25, 0.25),
    });

    const backMaterial = new THREE.MeshPhysicalMaterial({
      map: getCardBackTexture(),
      roughness: 0.5,
      metalness: 0.0,
      envMapIntensity: 0.55,
      clearcoat: 0.3,
      clearcoatRoughness: 0.25,
      normalMap,
      roughnessMap,
      normalScale: new THREE.Vector2(0.2, 0.2),
    });

    const edgeMaterial = new THREE.MeshStandardMaterial({
      color: NEUTRAL_COLOR,
      emissive: NEUTRAL_COLOR,
      emissiveIntensity: 0.05,
      roughness: 0.55,
      metalness: 0.05,
      envMapIntensity: 0.4,
    });

    const materials = [edgeMaterial, edgeMaterial, edgeMaterial, edgeMaterial, frontMaterial, backMaterial];
    const mesh = new THREE.Mesh(this.geometry, materials);

    const updateCard = (card: Card | null, options?: { isSelected?: boolean }) => {
      if (!card) {
        mesh.visible = false;
        return;
      }
      mesh.visible = true;
      frontMaterial.map = card.isHidden ? getCardBackTexture() : getCardTexture(card);
      frontMaterial.roughnessMap = roughnessMap;
      frontMaterial.normalMap = normalMap;
      frontMaterial.needsUpdate = true;

      const isSelected = options?.isSelected;
      const edgeColor =
        isSelected === true ? SELECTED_COLOR : isSelected === false ? OPPONENT_COLOR : NEUTRAL_COLOR;
      edgeMaterial.color.copy(edgeColor);
      edgeMaterial.emissive.copy(edgeColor);
      edgeMaterial.emissiveIntensity = isSelected !== undefined ? 0.18 : 0.05;
      edgeMaterial.needsUpdate = true;
    };

    const dispose = () => {
      frontMaterial.dispose();
      backMaterial.dispose();
      edgeMaterial.dispose();
    };

    return { mesh, updateCard, dispose };
  }
}

export default CardPoolManager;
