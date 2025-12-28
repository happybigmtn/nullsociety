import React, { useEffect, useState } from 'react';
import { useSpring, animated } from '@react-spring/web';

interface Pseudo3DCardProps {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades' | string;
  rank: string; // 'A', 'K', 'Q', 'J', '10', '9', etc.
  faceUp?: boolean;
  index?: number; // For stagger effect
  style?: React.CSSProperties;
  className?: string;
}

const suitColors: Record<string, string> = {
  hearts: '#FF3B30',   // Red
  diamonds: '#FF3B30', // Red
  clubs: '#1C1C1E',    // Black
  spades: '#1C1C1E',   // Black
};

const suitIcons: Record<string, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

export const Pseudo3DCard: React.FC<Pseudo3DCardProps> = ({
  suit,
  rank,
  faceUp = true,
  index = 0,
  style,
  className = '',
}) => {
  const [isFlipped, setFlipped] = useState(!faceUp);

  useEffect(() => {
    setFlipped(!faceUp);
  }, [faceUp]);

  const { transform, opacity } = useSpring({
    opacity: 1,
    transform: `perspective(600px) rotateY(${isFlipped ? 180 : 0}deg) translateY(0px)`,
    from: { opacity: 0, transform: `perspective(600px) rotateY(180deg) translateY(-50px)` },
    config: { mass: 1, tension: 180, friction: 20 }, // Standard spring physics
    delay: index * 100, // Stagger deal
  });

  const color = suitColors[suit.toLowerCase()] || '#1C1C1E';
  const icon = suitIcons[suit.toLowerCase()] || suit;

  return (
    <div className={`relative w-24 h-36 ${className}`} style={style}>
      <animated.div
        className="w-full h-full relative preserve-3d cursor-pointer shadow-soft hover:shadow-float transition-shadow duration-300"
        style={{ transform, opacity }}
      >
        {/* Front Face */}
        <div
          className="absolute inset-0 w-full h-full bg-white rounded-xl backface-hidden flex flex-col justify-between p-2 border border-gray-200"
          style={{ transform: 'rotateY(0deg)' }}
        >
          {/* Top Left */}
          <div className="flex flex-col items-center leading-none">
            <span className="font-bold text-lg font-mono tracking-tighter" style={{ color }}>{rank}</span>
            <span className="text-sm" style={{ color }}>{icon}</span>
          </div>

          {/* Center (Simplified for now) */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
             <span className="text-6xl" style={{ color }}>{icon}</span>
          </div>

          {/* Bottom Right */}
          <div className="flex flex-col items-center leading-none rotate-180">
            <span className="font-bold text-lg font-mono tracking-tighter" style={{ color }}>{rank}</span>
            <span className="text-sm" style={{ color }}>{icon}</span>
          </div>
        </div>

        {/* Back Face */}
        <div
          className="absolute inset-0 w-full h-full bg-zinc-900 rounded-xl backface-hidden border-2 border-white/10"
          style={{
            transform: 'rotateY(180deg)',
            background: `radial-gradient(circle, #333 1px, transparent 1px) 0 0 / 8px 8px, #111`
            // Simple geometric pattern for back
          }}
        >
            <div className="w-full h-full flex items-center justify-center">
                <div className="w-8 h-12 border border-white/10 rounded-sm opacity-30"></div>
            </div>
        </div>
      </animated.div>
    </div>
  );
};
