/**
 * Craps 3D Dice Wrapper - Full Window Animation
 *
 * Animation covers the entire main sub-window for immersive experience.
 * Scene stays mounted to avoid expensive re-initialization.
 */
import React, { Suspense, lazy, useState, useCallback, useEffect, useRef } from 'react';
import { DiceRender } from '../GameComponents';
import { playSfx } from '../../../services/sfx';

// Lazy load the 3D scene
const CrapsScene3D = lazy(() =>
  import('./CrapsScene3D').then((mod) => ({ default: mod.CrapsScene3D }))
);

interface CrapsDice3DWrapperProps {
  diceValues: number[];
  isRolling?: boolean;
  onRoll: () => void;
  isMobile?: boolean;
  onAnimationBlockingChange?: (blocking: boolean) => void;
}

// Loading skeleton - full height
const Scene3DLoader: React.FC = () => (
  <div className="w-full h-full min-h-[320px] flex items-center justify-center bg-terminal-dim/30 rounded border border-terminal-green/20">
    <div className="flex flex-col items-center gap-3">
      <div className="w-10 h-10 border-3 border-terminal-green border-t-transparent rounded-full animate-spin" />
      <span className="text-xs font-mono text-gray-500 tracking-wider">LOADING 3D ENGINE...</span>
    </div>
  </div>
);

// 2D Dice fallback
const Dice2D: React.FC<{ values: number[] }> = ({ values }) => (
  <div className="min-h-[96px] flex gap-8 items-center justify-center">
    {values.length > 0 && (
      <div className="flex flex-col gap-2 items-center">
        <span className="text-xs uppercase tracking-widest text-gray-500">ROLL</span>
        <div className="flex gap-4">
          {values.map((d, i) => (
            <DiceRender key={i} value={d} delayMs={i * 60} />
          ))}
        </div>
      </div>
    )}
  </div>
);

export const CrapsDice3DWrapper: React.FC<CrapsDice3DWrapperProps> = ({
  diceValues,
  isRolling = false,
  onRoll,
  isMobile = false,
  onAnimationBlockingChange,
}) => {
  const [is3DMode, setIs3DMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem('craps-3d-mode');
    return stored ? stored === 'true' : true;
  });

  const [isAnimating, setIsAnimating] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [targetValues, setTargetValues] = useState<[number, number] | undefined>();
  const [skipRequested, setSkipRequested] = useState(false);
  const prevDiceRef = useRef<string>('');
  const wasRollingRef = useRef(false);
  const rollSoundPlayedRef = useRef(false);
  const collapseTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync animation state with parent's isRolling prop
  // This handles rolls triggered from game controls (not the 3D button)
  useEffect(() => {
    console.log('[CrapsDice3DWrapper] isRolling changed:', isRolling, 'isAnimating:', isAnimating, 'is3DMode:', is3DMode);
    if (isRolling && !wasRollingRef.current) {
      if (!rollSoundPlayedRef.current) {
        void playSfx('dice');
        rollSoundPlayedRef.current = true;
      }
    }
    if (!isRolling && rollSoundPlayedRef.current) {
      rollSoundPlayedRef.current = false;
    }
    if (isRolling && !wasRollingRef.current && is3DMode) {
      // Parent started a roll - begin animation and expand viewport
      console.log('[CrapsDice3DWrapper] Starting animation from parent roll');
      setIsAnimating(true);
      setIsExpanded(true);
      onAnimationBlockingChange?.(true);
      // Clear any pending collapse
      if (collapseTimeoutRef.current) {
        clearTimeout(collapseTimeoutRef.current);
        collapseTimeoutRef.current = null;
      }
    }
    wasRollingRef.current = isRolling;
  }, [isRolling, is3DMode, onAnimationBlockingChange]);

  // Update targets when chain responds
  useEffect(() => {
    console.log('[CrapsDice3DWrapper] diceValues changed:', diceValues, 'isAnimating:', isAnimating);
    if (diceValues.length === 2) {
      const key = `${diceValues[0]}-${diceValues[1]}`;
      if (key !== prevDiceRef.current) {
        prevDiceRef.current = key;
        console.log('[CrapsDice3DWrapper] Setting targetValues:', [diceValues[0], diceValues[1]]);
        setTargetValues([diceValues[0], diceValues[1]]);
      }
    }
  }, [diceValues, isAnimating]);

  const toggle3DMode = useCallback(() => {
    setIs3DMode((prev) => {
      const newValue = !prev;
      localStorage.setItem('craps-3d-mode', String(newValue));
      return newValue;
    });
  }, []);

  const handleRoll = useCallback(() => {
    if (isAnimating) return;
    setIsAnimating(true);
    setIsExpanded(true);
    onAnimationBlockingChange?.(true);
    if (!rollSoundPlayedRef.current) {
      void playSfx('dice');
      rollSoundPlayedRef.current = true;
    }
    // Clear any pending collapse
    if (collapseTimeoutRef.current) {
      clearTimeout(collapseTimeoutRef.current);
      collapseTimeoutRef.current = null;
    }
    onRoll();
  }, [isAnimating, onRoll, onAnimationBlockingChange]);

  const handleAnimationComplete = useCallback(() => {
    setIsAnimating(false);
    rollSoundPlayedRef.current = false;
    // Collapse viewport 1 second after animation completes
    collapseTimeoutRef.current = setTimeout(() => {
      setIsExpanded(false);
      onAnimationBlockingChange?.(false);
      collapseTimeoutRef.current = null;
    }, 1000);
  }, [onAnimationBlockingChange]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (collapseTimeoutRef.current) {
        clearTimeout(collapseTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!is3DMode) {
      onAnimationBlockingChange?.(false);
    }
  }, [is3DMode, onAnimationBlockingChange]);

  useEffect(() => {
    if (!isAnimating) return;
    setSkipRequested(false);
  }, [isAnimating]);

  useEffect(() => {
    if (!isAnimating || !isExpanded || !is3DMode) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      e.preventDefault();
      e.stopPropagation();
      setSkipRequested(true);
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [isAnimating, isExpanded, is3DMode]);

  // When expanded, the 3D scene fills the center area
  const expandedClasses = isExpanded && is3DMode
    ? 'absolute inset-0 z-[60] bg-terminal-black/95 transition-all duration-300'
    : '';

  return (
    <div className={`relative ${is3DMode ? 'flex-1 w-full min-h-[320px]' : 'w-full'} ${expandedClasses}`}>
      {/* Mode Toggle - hide during expanded animation */}
      {!isExpanded && (
        <button
          type="button"
          onClick={toggle3DMode}
          className="absolute top-2 right-2 z-20 px-2 py-1 text-[10px] font-mono
                     bg-black/80 border border-terminal-green/50 rounded
                     text-terminal-green hover:text-white hover:bg-terminal-green/20 transition-colors"
        >
          {is3DMode ? '2D' : '3D'}
        </button>
      )}

      {is3DMode ? (
        <div className="h-full w-full">
          {/* Keep scene always mounted for performance */}
          <Suspense fallback={<Scene3DLoader />}>
            <CrapsScene3D
              targetValues={targetValues}
              isAnimating={isAnimating}
              onRoll={handleRoll}
              onAnimationComplete={handleAnimationComplete}
              isMobile={isMobile}
              fullscreen={isExpanded}
              skipRequested={skipRequested}
            />
          </Suspense>

          {/* Beta badge - hide during expanded animation */}
          {!isExpanded && (
            <div className="absolute top-2 left-2 z-20">
              <span className="px-1.5 py-0.5 text-[9px] font-mono bg-purple-600/80 text-white rounded">
                BETA
              </span>
            </div>
          )}
        </div>
      ) : (
        <Dice2D values={diceValues} />
      )}
    </div>
  );
};

export default CrapsDice3DWrapper;
