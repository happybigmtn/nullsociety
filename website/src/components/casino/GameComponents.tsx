
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Card } from '../../types';
import { Pseudo3DCard } from './pseudo3d/Pseudo3DCard';
import { Pseudo3DDice } from './pseudo3d/Pseudo3DDice';

export const CardRender: React.FC<{ card: Card; small?: boolean; forcedColor?: string; dealDelayMs?: number }> = ({
  card,
  small,
  forcedColor,
  dealDelayMs,
}) => {
  // Defensive check for missing card data
  if (!card) {
    return (
      <div
        className={`${
          small ? 'w-9 h-[3.25rem] sm:w-10 sm:h-14 md:w-11 md:h-[4rem]' : 'w-12 h-[4.5rem] sm:w-14 sm:h-20 md:w-16 md:h-24'
        } bg-titanium-200 border border-gray-600 rounded flex items-center justify-center`}
      >
        <span className="text-gray-500 opacity-50 text-xs">?</span>
      </div>
    );
  }

  // Convert legacy text colors to card suits if needed, or just let Pseudo3DCard handle it
  // Pseudo3DCard takes suit 'hearts', 'diamonds' etc.
  // We need to map symbols if the card object uses symbols.
  const getSuitName = (s: string) => {
      switch(s) {
          case '♥': return 'hearts';
          case '♦': return 'diamonds';
          case '♣': return 'clubs';
          case '♠': return 'spades';
          default: return s; // 'hearts', etc.
      }
  };

  const scale = small ? 0.6 : 0.8;
  
  return (
    <div 
        style={{ 
            width: small ? 36 : 56, 
            height: small ? 54 : 84,
            transitionDelay: `${dealDelayMs}ms` 
        }} 
        className="relative"
    >
        <Pseudo3DCard
            suit={getSuitName(card.suit)}
            rank={card.rank}
            faceUp={!card.isHidden}
            style={{ 
                transform: `scale(${scale})`, 
                transformOrigin: 'top left',
                width: '100%',
                height: '100%'
            }}
            className="absolute inset-0"
        />
    </div>
  );
};

export const Hand: React.FC<{ cards: Card[]; title?: string; forcedColor?: string }> = ({ cards, title, forcedColor }) => (
  <div className="flex flex-col gap-2 items-center">
    {title && <span className={`text-xs uppercase tracking-widest ${forcedColor ? forcedColor : 'text-gray-500'}`}>{title}</span>}
    <div className="flex flex-wrap justify-center gap-2">
      {cards.map((c, i) => (
        <CardRender
          key={`${i}-${c?.value ?? 'x'}-${c?.isHidden ? 1 : 0}`}
          card={c}
          forcedColor={forcedColor}
          dealDelayMs={i * 100} // Increased delay for wave effect
        />
      ))}
      {cards.length === 0 && (
        <div
          className={`w-14 h-20 border border-dashed rounded-lg opacity-30 ${
            forcedColor ? `border-${forcedColor.replace('text-', '')}` : 'border-gray-500'
          }`}
        />
      )}
    </div>
  </div>
);

export const Chip: React.FC<{ value: number }> = ({ value }) => (
  <div className="w-6 h-6 rounded-full border border-action-primary text-action-primary flex items-center justify-center text-[10px] font-bold">
    {value >= 1000 ? 'K' : value}
  </div>
);

export const DiceRender: React.FC<{
  value: number;
  delayMs?: number;
  className?: string;
  style?: React.CSSProperties;
  rolling?: boolean;
  rollRotation?: number; // Rotation based on horizontal movement
  flatOnSettle?: boolean;
}> = ({ value, delayMs, className, style, rolling, rollRotation, flatOnSettle }) => {
  return (
    <div
      style={{
        animationDelay: delayMs !== undefined ? `${delayMs}ms` : undefined,
        ...style,
      }}
      className={className}
    >
        <Pseudo3DDice
            value={value}
            size={56}
            rolling={rolling}
            rollRotation={rollRotation}
            flatOnSettle={flatOnSettle}
        />
    </div>
  );
};

type DicePose = { x: number; y: number; rot: number; rollRotation: number };
type DiceVelocity = { vx: number; vy: number; vr: number; settleTicks: number; cumulativeX: number };

export const DiceThrow2D: React.FC<{
  values: number[];
  rollKey?: number | string;
  label?: string;
  className?: string;
  maxWidthClassName?: string;
  heightClassName?: string;
  launchDirection?: 'left' | 'right' | 'random';
  horizontalBoost?: number;
  verticalBoost?: number;
  preventOverlap?: boolean;
  settleToRow?: boolean;
  rightWallInset?: number;
  flatOnSettle?: boolean;
  onSettled?: () => void;
}> = ({
  values,
  rollKey,
  label = 'ROLL',
  className,
  maxWidthClassName,
  heightClassName,
  launchDirection = 'random',
  horizontalBoost = 8,
  verticalBoost = 10,
  preventOverlap = false,
  settleToRow = false,
  rightWallInset = 0,
  flatOnSettle = false,
  onSettled,
}) => {
  const valuesKey = useMemo(() => values.join(','), [values]);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const settleTargetsRef = React.useRef<DicePose[]>([]);
  const [poses, setPoses] = useState<DicePose[]>([]);
  const velocitiesRef = React.useRef<DiceVelocity[]>([]);
  const frameRef = React.useRef<number | null>(null);
  const lastTimeRef = React.useRef<number | null>(null);
  const startTimeRef = React.useRef<number | null>(null);

  // Track if we should be "rolling" (tumbling) vs "settled" (showing value)
  const [isSettled, setIsSettled] = useState(false);

  useEffect(() => {
    setIsSettled(false); // Reset on new roll
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    if (!containerRef.current || values.length === 0) return;

    const reducedMotion = typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
    const rect = containerRef.current.getBoundingClientRect();
    const diceSize = 56;
    const clampedRightInset = Math.max(0, Math.min(rightWallInset, rect.width - diceSize));
    const boundsX = Math.max(0, rect.width - diceSize - clampedRightInset);
    const boundsY = Math.max(0, rect.height - diceSize);

    // Start position based on launch direction
    const baseX = launchDirection === 'right'
      ? rect.width * 0.02 // Start from far left for rightward launch
      : launchDirection === 'left'
        ? rect.width * 0.85 // Start from far right for leftward launch
        : rect.width * 0.15;
    const baseY = rect.height * 0.3; // Start higher for more dramatic arc
    const spread = Math.max(diceSize + 8, diceSize * 0.8);

    const initialPoses: DicePose[] = values.map((_, idx) => ({
      x: Math.min(boundsX, Math.max(0, baseX + idx * spread)),
      y: Math.min(boundsY, Math.max(0, baseY + (idx % 2) * (diceSize * 0.12))),
      rot: (Math.random() * 60) - 30,
      rollRotation: 0, // Will be computed from cumulative X movement
    }));

    const initialVelocities: DiceVelocity[] = values.map((_, idx) => {
      const directionSign =
        launchDirection === 'left'
          ? -1
          : launchDirection === 'right'
            ? 1
            : (idx % 2 === 0 ? 1 : -1);
      const horizontalJitter = (idx - (values.length - 1) / 2) * 2.5;
      return {
        vx: ((Math.random() * 8 + horizontalBoost) + horizontalJitter) * directionSign,
        vy: -(Math.random() * 3 + verticalBoost * 0.6),
        vr: (Math.random() * 15 + 18) * (idx % 2 === 0 ? 1 : -1),
        settleTicks: 0,
        cumulativeX: 0, // Track total horizontal distance for rotation
      };
    });

    if (settleToRow) {
      const gap = diceSize * 0.25; // Consistent gap between dice
      const totalWidth = values.length * diceSize + (values.length - 1) * gap;
      const centerX = rect.width / 2;
      const startX = centerX - totalWidth / 2;
      // Center dice vertically, accounting for dice height
      const targetY = Math.max(0, Math.min(boundsY, (rect.height - diceSize) / 2));
      settleTargetsRef.current = values.map((_, idx) => ({
        x: Math.max(0, Math.min(boundsX, startX + idx * (diceSize + gap))),
        y: targetY,
        rot: 0,
        rollRotation: 0, // Will be ignored - dice snap flat on settle
      }));
    } else {
      settleTargetsRef.current = [];
    }

    setPoses(initialPoses);
    velocitiesRef.current = initialVelocities;
    lastTimeRef.current = null;
    startTimeRef.current = null; // Will be set on first frame

    if (reducedMotion) {
        setIsSettled(true);
        onSettled?.();
        return;
    }

    const gravity = 0.4; // Low gravity for longer air time
    const restitution = 0.85; // Very bouncy for dramatic wall hits
    const airDrag = 0.99; // Minimal drag for fast travel
    const floorFriction = 0.7;
    const PHYSICS_PHASE_MS = 1800; // More time for physics (roll right, bounce, roll back)
    const EASE_PHASE_MS = 350; // Quick translate to center

    const clampPose = (pose: DicePose) => ({
      x: Math.max(0, Math.min(boundsX, pose.x)),
      y: Math.max(0, Math.min(boundsY, pose.y)),
      rot: pose.rot,
      rollRotation: pose.rollRotation,
    });

    const TOTAL_DURATION_MS = PHYSICS_PHASE_MS + EASE_PHASE_MS;

    // Smooth easing function (ease-out back for overshoot)
    const easeOutBack = (x: number): number => {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    };

    const step = (time: number) => {
      // Track animation start time
      if (startTimeRef.current === null) {
        startTimeRef.current = time;
      }
      const elapsed = time - startTimeRef.current;

      const lastTime = lastTimeRef.current ?? time;
      const dt = Math.min(32, time - lastTime);
      const dtScale = dt / 16.67;
      lastTimeRef.current = time;

      // Phase 1: Pure physics (0 - PHYSICS_PHASE_MS)
      // Phase 2: Smooth ease to target (PHYSICS_PHASE_MS - TOTAL_DURATION_MS)
      // Phase 3: Settled (after TOTAL_DURATION_MS)

      if (elapsed >= TOTAL_DURATION_MS) {
        // Final snap and stop
        if (settleToRow && settleTargetsRef.current.length > 0) {
          setPoses(settleTargetsRef.current.map(clampPose));
        }
        setIsSettled(true);
        onSettled?.();
        return;
      }

      setPoses((prev) => {
        return prev.map((pose, i) => {
          const vel = velocitiesRef.current[i];
          if (!vel) return pose;

          let x = pose.x;
          let y = pose.y;
          let rot = pose.rot;

          // Dice circumference for realistic rotation
          const circumference = diceSize * Math.PI;
          let rollRotation = pose.rollRotation;

          if (elapsed < PHYSICS_PHASE_MS) {
            // Phase 1: Pure physics simulation
            vel.vy += gravity * dtScale;
            vel.vx *= Math.pow(airDrag, dtScale);
            vel.vy *= Math.pow(airDrag, dtScale);
            vel.vr *= Math.pow(airDrag, dtScale);

            const dx = vel.vx * dtScale;
            x = pose.x + dx;
            y = pose.y + vel.vy * dtScale;
            rot = pose.rot + vel.vr * dtScale;

            // Track cumulative horizontal movement and convert to rotation
            vel.cumulativeX += dx;
            // Rotation = (distance / circumference) * 360 degrees
            // Positive X movement = positive rotation (rolling right)
            rollRotation = (vel.cumulativeX / circumference) * 360;

            // Wall bounces
            if (x <= 0) {
              x = 0;
              vel.vx = Math.abs(vel.vx) * restitution;
              vel.vr *= 0.9;
            } else if (x >= boundsX) {
              x = boundsX;
              vel.vx = -Math.abs(vel.vx) * restitution;
              vel.vr *= 0.9;
            }

            // Floor/ceiling bounces
            if (y >= boundsY) {
              y = boundsY;
              vel.vy = -Math.abs(vel.vy) * restitution;
              vel.vx *= floorFriction;
              vel.vr *= 0.85;
            } else if (y <= 0) {
              y = 0;
              vel.vy = Math.abs(vel.vy) * restitution;
            }
          } else if (settleToRow && settleTargetsRef.current[i]) {
            // Phase 2: Smooth ease to target position
            const target = settleTargetsRef.current[i];
            const easeElapsed = elapsed - PHYSICS_PHASE_MS;
            const easeProgress = Math.min(1, easeElapsed / EASE_PHASE_MS);
            const easedProgress = easeOutBack(easeProgress);

            // Store start positions for easing (use current pose as start)
            if (easeProgress < 0.02) {
              // Just started easing - current position is our start
              vel.vx = pose.x; // Repurpose velocity refs to store start positions
              vel.vy = pose.y;
              vel.vr = pose.rot;
            }

            // Interpolate from stored start to target
            x = vel.vx + (target.x - vel.vx) * easedProgress;
            y = vel.vy + (target.y - vel.vy) * easedProgress;
            rot = vel.vr + (target.rot - vel.vr) * easedProgress;
          }

          return { ...clampPose({ x, y, rot, rollRotation }), rollRotation };
        });
      });

      frameRef.current = requestAnimationFrame(step);
    };

    frameRef.current = requestAnimationFrame(step);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [rollKey, valuesKey, launchDirection, horizontalBoost, verticalBoost, preventOverlap, settleToRow, rightWallInset]);

  if (values.length === 0) return null;

  const maxWidthClass = maxWidthClassName ?? (values.length > 2 ? 'max-w-[420px]' : 'max-w-[360px]');
  const heightClass = heightClassName ?? 'h-[110px] sm:h-[120px]';

  // Don't render dice until poses are initialized (prevents flash at top-left)
  const posesReady = poses.length === values.length;

  return (
    <div className={`flex flex-col items-center ${className ?? ''}`}>
      {label && <span className="text-xs uppercase tracking-widest text-gray-500 mb-2">{label}</span>}
      <div
        ref={containerRef}
        className={`relative w-full ${maxWidthClass} ${heightClass} overflow-hidden`}
      >
        {posesReady && values.map((value, i) => {
          const pose = poses[i];
          return (
            <DiceRender
              key={`${rollKey ?? 'roll'}-${i}`}
              value={value}
              className="absolute left-0 top-0 will-change-transform"
              style={{ transform: `translate3d(${pose.x}px, ${pose.y}px, 0)` }}
              rolling={!isSettled}
              rollRotation={pose.rollRotation}
              flatOnSettle={flatOnSettle}
            />
          );
        })}
      </div>
    </div>
  );
};
