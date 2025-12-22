import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Card } from '../../../types';
import BaccaratCard, { CardHand } from './BaccaratCard';

export interface CardSlot {
  id: string;
  hand: CardHand;
  index: number;
  targetPosition: THREE.Vector3;
  targetRotation: THREE.Euler;
}

interface DealEntry {
  slot: CardSlot;
  card: Card;
  startPosition: THREE.Vector3;
  startRotation: THREE.Euler;
  endRotation: THREE.Euler;
  startMs: number;
}

interface BaccaratDealerProps {
  playerCards: Card[];
  bankerCards: Card[];
  targetKey: string;
  dealId: number;
  isAnimating: boolean;
  skipRequested?: boolean;
  shoeExit: THREE.Vector3;
  shoeRotation: THREE.Euler;
  cardSize: [number, number, number];
  slots: CardSlot[];
  collisionGroups?: number;
  positionsRef?: React.MutableRefObject<Map<string, THREE.Vector3>>;
  onSequenceComplete?: () => void;
}

const DEAL_STAGGER_MS = 300;
const FLIGHT_MS = 600;

const DEAL_ORDER = [
  { hand: 'player' as CardHand, index: 0 },
  { hand: 'banker' as CardHand, index: 0 },
  { hand: 'player' as CardHand, index: 1 },
  { hand: 'banker' as CardHand, index: 1 },
  { hand: 'player' as CardHand, index: 2 },
  { hand: 'banker' as CardHand, index: 2 },
];

const getCardForSlot = (hand: CardHand, index: number, player: Card[], banker: Card[]) => {
  const cards = hand === 'player' ? player : banker;
  return index < cards.length ? cards[index] : null;
};

export const BaccaratDealer: React.FC<BaccaratDealerProps> = ({
  playerCards,
  bankerCards,
  targetKey,
  dealId,
  isAnimating,
  skipRequested,
  shoeExit,
  shoeRotation,
  cardSize,
  slots,
  collisionGroups,
  positionsRef,
  onSequenceComplete,
}) => {
  const [deals, setDeals] = useState<DealEntry[]>([]);
  const landedRef = useRef(new Set<string>());
  const [landedTick, setLandedTick] = useState(0);
  const completionRef = useRef(false);

  const slotMap = useMemo(() => new Map(slots.map((slot) => [slot.id, slot])), [slots]);

  useEffect(() => {
    if (!isAnimating || !targetKey) {
      setDeals([]);
      landedRef.current.clear();
      completionRef.current = false;
      return;
    }

    const startMs = performance.now();
    landedRef.current.clear();
    completionRef.current = false;

    const nextDeals: DealEntry[] = [];
    let order = 0;
    DEAL_ORDER.forEach((entry) => {
      const slotId = `${entry.hand}-${entry.index}`;
      const slot = slotMap.get(slotId);
      if (!slot) return;
      const card = getCardForSlot(entry.hand, entry.index, playerCards, bankerCards);
      if (!card) return;
      const jitter = (Math.random() - 0.5) * 0.08;
      const endRotation = new THREE.Euler(
        slot.targetRotation.x,
        slot.targetRotation.y,
        slot.targetRotation.z + jitter
      );
      const startPosition = shoeExit.clone().add(new THREE.Vector3(0, 0.02 * order, 0));
      nextDeals.push({
        slot,
        card,
        startPosition,
        startRotation: shoeRotation,
        endRotation,
        startMs: startMs + order * DEAL_STAGGER_MS,
      });
      order += 1;
    });

    if (positionsRef) {
      nextDeals.forEach((deal) => {
        if (!positionsRef.current.has(deal.slot.id)) {
          positionsRef.current.set(deal.slot.id, deal.startPosition.clone());
        }
      });
    }

    setDeals(nextDeals);
  }, [dealId, isAnimating, targetKey, playerCards, bankerCards, shoeExit, shoeRotation, slotMap, positionsRef]);

  const handleLanded = (id: string) => {
    if (landedRef.current.has(id)) return;
    landedRef.current.add(id);
    setLandedTick((prev) => prev + 1);
  };

  useEffect(() => {
    if (completionRef.current) return;
    const total = deals.length;
    if (total === 0) return;
    if (landedRef.current.size >= total) {
      completionRef.current = true;
      onSequenceComplete?.();
    }
  }, [landedTick, deals.length, onSequenceComplete]);

  return (
    <>
      {deals.map((deal) => {
        const position = positionsRef?.current.get(deal.slot.id);
        return (
          <BaccaratCard
            key={`${deal.slot.id}-${deal.startMs}`}
            id={deal.slot.id}
            card={deal.card}
            hand={deal.slot.hand}
            size={cardSize}
            start={deal.startPosition}
            end={deal.slot.targetPosition}
            startRotation={deal.startRotation}
            endRotation={deal.endRotation}
            startMs={deal.startMs}
            flightMs={FLIGHT_MS}
            isAnimating={isAnimating}
            skipRequested={skipRequested}
            collisionGroups={collisionGroups}
            positionRef={position}
            onLanded={handleLanded}
          />
        );
      })}
    </>
  );
};

export default BaccaratDealer;
