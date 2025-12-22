/**
 * Generic 3D card table scene for casino games.
 *
 * Renders fixed card slots and animates deal/reveal for slot sets.
 */
import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Card } from '../../../types';
import { playSfx } from '../../../services/sfx';
import Card3D, { CardHand } from './Card3D';
import { CardSlotConfig, CARD_SCENE_CONFIG } from './cardLayouts';
import CasinoEnvironment from './CasinoEnvironment';

// Default timing constants
const DEAL_INTERVAL_MS = 130;
const DEAL_DURATION_MS = 560;
const DEAL_ARC_HEIGHT = 0.5;
const REVEAL_DELAY_MS = 160;
const REVEAL_STAGGER_MS = 130;
const FLIP_DURATION_MS = 420;

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

type CardSlotInfo = {
  id: string;
  position: THREE.Vector3;
  rotation: THREE.Euler;
};

type CardRig = {
  slot: CardSlotInfo;
  sequenceIndex: number;
  ref: React.RefObject<THREE.Group>;
  mode: 'deal' | 'reveal' | 'static';
  dealStartMs: number | null;
  flipStartMs: number | null;
  dealt: boolean;
  flipProgress: number;
  sfxPlayed: boolean;
  startPos: THREE.Vector3;
  startRot: THREE.Euler;
  workPos: THREE.Vector3;
  workRot: THREE.Euler;
};

interface CardTableScene3DProps {
  slots: CardSlotConfig[];
  dealOrder: string[];
  cardsById: Record<string, Card | null>;
  dealId: number;
  dealSlots: string[];
  revealSlots: string[];
  isAnimating: boolean;
  onAnimationComplete?: () => void;
  isMobile?: boolean;
  fullscreen?: boolean;
  skipRequested?: boolean;
  tableSize?: { width: number; depth: number; y: number };
  cardSize?: [number, number, number];
  selectedHand?: CardHand; // Which hand the player bet on - that side gets green, opponent gets red
  revealStaggerMs?: number; // Override for delay between each card flip (default 130ms)
}

const SHOE_POSITION = new THREE.Vector3(2.4, 0.45, 0.15);
const SHOE_ROTATION = new THREE.Euler(-Math.PI / 2 + 0.4, Math.PI / 2, 0);

const buildSlotInfo = (slots: CardSlotConfig[]) =>
  slots.map((slot) => ({
    id: slot.id,
    position: new THREE.Vector3(...slot.position),
    rotation: new THREE.Euler(...(slot.rotation ?? [CARD_SCENE_CONFIG.baseRotationX, 0, 0])),
  }));

function CardTableScene({
  slots,
  dealOrder,
  cardsById,
  dealId,
  dealSlots,
  revealSlots,
  isAnimating,
  onAnimationComplete,
  isMobile,
  fullscreen,
  skipRequested,
  tableSize,
  cardSize,
  selectedHand,
  revealStaggerMs,
}: CardTableScene3DProps) {
  const { camera, invalidate } = useThree();

  // Use override or default for reveal stagger timing
  const actualRevealStaggerMs = revealStaggerMs ?? REVEAL_STAGGER_MS;
  const slotInfos = useMemo(() => buildSlotInfo(slots), [slots]);
  const slotMap = useMemo(() => new Map(slotInfos.map((slot) => [slot.id, slot])), [slotInfos]);
  const orderKey = dealOrder.join('|');
  const orderMap = useMemo(() => new Map(dealOrder.map((id, idx) => [id, idx])), [orderKey]);
  const cardRefs = useMemo(() => slotInfos.map(() => React.createRef<THREE.Group>()), [slotInfos]);
  const rigsRef = useRef<CardRig[]>([]);
  const cardsByIdRef = useRef(cardsById);
  const animationCompleteRef = useRef(false);
  const skipHandledRef = useRef(false);

  useEffect(() => {
    cardsByIdRef.current = cardsById;
  }, [cardsById]);

  const tableConfig = {
    width: tableSize?.width ?? CARD_SCENE_CONFIG.table.width,
    depth: tableSize?.depth ?? CARD_SCENE_CONFIG.table.depth,
    y: tableSize?.y ?? CARD_SCENE_CONFIG.table.y,
  };
  const resolvedCardSize = cardSize ?? CARD_SCENE_CONFIG.cardSize;

  if (rigsRef.current.length === 0) {
    rigsRef.current = slotInfos.map((slot, index) => {
      const sequenceIndex = orderMap.get(slot.id) ?? index;
      return {
        slot,
        sequenceIndex,
        ref: cardRefs[index],
        mode: 'static',
        dealStartMs: null,
        flipStartMs: null,
        dealt: false,
        flipProgress: 0,
        sfxPlayed: false,
        startPos: new THREE.Vector3(
          SHOE_POSITION.x,
          SHOE_POSITION.y + sequenceIndex * 0.02,
          SHOE_POSITION.z
        ),
        startRot: new THREE.Euler(
          SHOE_ROTATION.x,
          SHOE_ROTATION.y,
          SHOE_ROTATION.z + sequenceIndex * 0.05
        ),
        workPos: new THREE.Vector3(),
        workRot: new THREE.Euler(),
      };
    });
  }

  useEffect(() => {
    // Higher angle, zoomed out view for floating cards
    camera.position.set(0, fullscreen ? 4.5 : 4.0, fullscreen ? 5.0 : 4.5);
    (camera as THREE.PerspectiveCamera).fov = fullscreen ? 42 : 46;
    (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
    camera.lookAt(0, tableConfig.y + 0.2, 0);
    invalidate();
  }, [camera, fullscreen, invalidate, tableConfig.y]);

  useEffect(() => {
    if (!isAnimating) {
      rigsRef.current.forEach((rig) => {
        const card = cardsByIdRef.current[rig.slot.id];
        if (!rig.ref.current) return;
        rig.ref.current.visible = Boolean(card);
        if (!card) return;
        rig.ref.current.position.copy(rig.slot.position);
        const flip = card.isHidden ? Math.PI : 0;
        rig.ref.current.rotation.set(
          rig.slot.rotation.x + flip,
          rig.slot.rotation.y,
          rig.slot.rotation.z
        );
        rig.flipProgress = card.isHidden ? 0 : 1;
      });
      invalidate();
    }
  }, [isAnimating, invalidate]);

  useEffect(() => {
    if (!isAnimating) return;
    const now = performance.now();
    animationCompleteRef.current = false;
    skipHandledRef.current = false;
    const dealSet = new Set(dealSlots);
    const revealSet = new Set(revealSlots);

    rigsRef.current.forEach((rig) => {
      const card = cardsById[rig.slot.id];  // Use current cardsById, not ref
      const isDeal = dealSet.has(rig.slot.id);
      const isReveal = revealSet.has(rig.slot.id);

      // Full state reset for this animation
      rig.mode = isDeal ? 'deal' : isReveal ? 'reveal' : 'static';
      rig.dealStartMs = isDeal ? now + rig.sequenceIndex * DEAL_INTERVAL_MS : null;
      rig.flipStartMs = null;  // Always reset - will be set during animation if needed
      rig.dealt = !isDeal;
      rig.flipProgress = 0;  // Always start at 0 for animating slots
      rig.sfxPlayed = false;

      if (!rig.ref.current) return;
      rig.ref.current.visible = Boolean(card) || isDeal || isReveal;

      if (isDeal) {
        // Reset position to shoe for deal animation
        rig.ref.current.position.copy(rig.startPos);
        rig.ref.current.rotation.copy(rig.startRot);
      } else if (rig.mode === 'static' && card) {
        const flip = card.isHidden ? Math.PI : 0;
        rig.ref.current.position.copy(rig.slot.position);
        rig.ref.current.rotation.set(
          rig.slot.rotation.x + flip,
          rig.slot.rotation.y,
          rig.slot.rotation.z
        );
        rig.flipProgress = card.isHidden ? 0 : 1;
      }
    });
  }, [dealId, dealSlots, revealSlots, isAnimating, cardsById]);

  useEffect(() => {
    if (!isAnimating || !skipRequested || skipHandledRef.current) return;
    skipHandledRef.current = true;
    rigsRef.current.forEach((rig) => {
      const card = cardsByIdRef.current[rig.slot.id];
      if (!rig.ref.current) return;
      if (!card) {
        rig.ref.current.visible = false;
        return;
      }
      rig.ref.current.visible = true;
      rig.ref.current.position.copy(rig.slot.position);
      const flip = card.isHidden ? Math.PI : 0;
      rig.ref.current.rotation.set(
        rig.slot.rotation.x + flip,
        rig.slot.rotation.y,
        rig.slot.rotation.z
      );
      rig.flipProgress = card.isHidden ? 0 : 1;
    });
    animationCompleteRef.current = true;
    onAnimationComplete?.();
    invalidate();
  }, [isAnimating, skipRequested, onAnimationComplete, invalidate]);

  useFrame(() => {
    if (!isAnimating || animationCompleteRef.current) return;
    const now = performance.now();
    let allDone = true;
    let anyActive = false;

    rigsRef.current.forEach((rig) => {
      const card = cardsByIdRef.current[rig.slot.id];
      if (!rig.ref.current) return;
      if (rig.mode === 'static') {
        rig.ref.current.visible = Boolean(card);
        return;
      }
      anyActive = true;
      // Mode is 'deal' or 'reveal' here (static returned early) - always show during animation
      rig.ref.current.visible = true;

      const startPos = rig.startPos;
      const startRot = rig.startRot;

      if (rig.mode === 'deal') {
        let dealProgress = 0;
        if (rig.dealStartMs !== null) {
          dealProgress = Math.min(1, Math.max(0, (now - rig.dealStartMs) / DEAL_DURATION_MS));
          if (dealProgress < 1) allDone = false;
        } else {
          allDone = false;
        }

        const eased = easeOutCubic(dealProgress);
        const arc = Math.sin(dealProgress * Math.PI) * DEAL_ARC_HEIGHT;
        const pos = rig.workPos.lerpVectors(startPos, rig.slot.position, eased);
        pos.y += arc;

        const rot = rig.workRot.set(
          THREE.MathUtils.lerp(startRot.x, rig.slot.rotation.x, eased),
          THREE.MathUtils.lerp(startRot.y, rig.slot.rotation.y, eased),
          THREE.MathUtils.lerp(startRot.z, rig.slot.rotation.z, eased)
        );

        if (!rig.sfxPlayed && dealProgress > 0.5) {
          rig.sfxPlayed = true;
          void playSfx('deal');
        }

        if (dealProgress >= 1 && !rig.dealt) {
          rig.dealt = true;
        }

        if (rig.dealt && card && !card.isHidden && rig.flipStartMs === null) {
          rig.flipStartMs = now + REVEAL_DELAY_MS + rig.sequenceIndex * actualRevealStaggerMs;
        }

        if (rig.flipStartMs !== null) {
          const flipProgress = Math.min(1, Math.max(0, (now - rig.flipStartMs) / FLIP_DURATION_MS));
          rig.flipProgress = easeInOutCubic(flipProgress);
          if (flipProgress < 1) allDone = false;
        } else if (card && !card.isHidden) {
          allDone = false;
        }

        const flipAngle = (1 - rig.flipProgress) * Math.PI;
        rig.ref.current.position.copy(pos);
        rig.ref.current.rotation.set(rot.x + flipAngle, rot.y, rot.z);
        return;
      }

      if (rig.mode === 'reveal') {
        const cardVisible = Boolean(card) && !card?.isHidden;
        if (!cardVisible) {
          rig.ref.current.position.copy(rig.slot.position);
          rig.ref.current.rotation.set(rig.slot.rotation.x + Math.PI, rig.slot.rotation.y, rig.slot.rotation.z);
          return;
        }

        if (rig.flipStartMs === null) {
          rig.flipStartMs = now + REVEAL_DELAY_MS + rig.sequenceIndex * actualRevealStaggerMs;
        }
        const flipProgress = Math.min(1, Math.max(0, (now - rig.flipStartMs) / FLIP_DURATION_MS));
        rig.flipProgress = easeInOutCubic(flipProgress);
        if (flipProgress < 1) allDone = false;
        const flipAngle = (1 - rig.flipProgress) * Math.PI;
        rig.ref.current.position.copy(rig.slot.position);
        rig.ref.current.rotation.set(
          rig.slot.rotation.x + flipAngle,
          rig.slot.rotation.y,
          rig.slot.rotation.z
        );
      }
    });

    if (anyActive && allDone && !animationCompleteRef.current) {
      animationCompleteRef.current = true;
      onAnimationComplete?.();
    }
  });

  return (
    <>
      {/* Pure black void */}
      <color attach="background" args={['#000000']} />
      <CasinoEnvironment />
      {/* Lighting for floating cards */}
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[2, 5, 3]}
        intensity={1.2}
        castShadow={false}
      />
      <pointLight position={[0, 3, 2]} intensity={0.4} color="#ffffff" />

      {/* No table - cards float in void */}

      {slotInfos.map((slot, idx) => {
        // Determine isSelected based on slot prefix and selectedHand
        let isSelected: boolean | undefined = undefined;
        if (selectedHand) {
          const slotHand = slot.id.startsWith('player') ? 'player' : slot.id.startsWith('banker') ? 'banker' : null;
          if (slotHand) {
            isSelected = slotHand === selectedHand;
          }
        }
        return (
          <Card3D
            key={slot.id}
            ref={cardRefs[idx]}
            card={cardsById[slot.id] ?? null}
            size={resolvedCardSize}
            isSelected={isSelected}
          />
        );
      })}
    </>
  );
}

export const CardTableScene3D: React.FC<CardTableScene3DProps> = ({
  slots,
  dealOrder,
  cardsById,
  dealId,
  dealSlots,
  revealSlots,
  isAnimating,
  onAnimationComplete,
  isMobile = false,
  fullscreen = false,
  skipRequested,
  tableSize,
  cardSize,
  selectedHand,
  revealStaggerMs,
}) => {
  const [sceneReady, setSceneReady] = useState(false);

  return (
    <div className="relative w-full h-full min-h-[320px]">
      <Canvas
        dpr={isMobile ? 1 : [1, 1.75]}
        frameloop={isAnimating ? 'always' : 'demand'}
        gl={{ antialias: !isMobile, alpha: true, powerPreference: isMobile ? 'low-power' : 'high-performance' }}
        onCreated={({ camera }) => {
          camera.lookAt(0, 0, 0);
          setSceneReady(true);
        }}
        shadows={!isMobile}
        camera={{ position: [0, 2.8, 3.5], fov: fullscreen ? 48 : 52 }}
      >
        <Suspense fallback={null}>
          <CardTableScene
            slots={slots}
            dealOrder={dealOrder}
            cardsById={cardsById}
            dealId={dealId}
            dealSlots={dealSlots}
            revealSlots={revealSlots}
            isAnimating={isAnimating}
            onAnimationComplete={onAnimationComplete}
            isMobile={isMobile}
            fullscreen={fullscreen}
            skipRequested={skipRequested}
            tableSize={tableSize}
            cardSize={cardSize}
            selectedHand={selectedHand}
            revealStaggerMs={revealStaggerMs}
          />
        </Suspense>
      </Canvas>

      {!sceneReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-terminal-dim/50">
          <div className="w-8 h-8 border-2 border-terminal-green border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
};

export default CardTableScene3D;
