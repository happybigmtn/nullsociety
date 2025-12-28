import React, { useEffect, useState } from 'react';
import { useSpring, animated } from '@react-spring/web';

interface Pseudo3DCardProps {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades' | string;
  rank: string;
  faceUp?: boolean;
  index?: number;
  style?: React.CSSProperties;
  className?: string;
}

const suitColors: Record<string, string> = {
  hearts: '#FF3B30',
  diamonds: '#FF3B30',
  clubs: '#1C1C1E',
  spades: '#1C1C1E',
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
    transform: `perspective(1200px) rotateY(${isFlipped ? 180 : 0}deg) translateY(0px)`,
    from: { opacity: 0, transform: `perspective(1200px) rotateY(180deg) translateY(-100px)` },
    config: { mass: 1, tension: 210, friction: 20 },
    delay: index * 80,
  });

  const color = suitColors[suit.toLowerCase()] || '#1C1C1E';
  const icon = suitIcons[suit.toLowerCase()] || suit;

  return (
    <div className={`relative w-24 h-36 ${className}`} style={style}>
      <animated.div
        className="w-full h-full relative preserve-3d cursor-pointer shadow-soft hover:shadow-float active:scale-95 transition-all duration-300"
        style={{ transform, opacity }}
      >
        {/* Front Face */}
        <div
          className="absolute inset-0 w-full h-full bg-white rounded-xl backface-hidden flex flex-col justify-between p-3 border border-titanium-200"
          style={{ transform: 'rotateY(0deg)' }}
        >
          <div className="flex flex-col items-center leading-none">
            <span className="font-extrabold text-xl tracking-tighter" style={{ color, fontFamily: 'Space Grotesk' }}>{rank}</span>
            <span className="text-sm mt-0.5" style={{ color }}>{icon}</span>
          </div>

          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-5">
             <span className="text-8xl" style={{ color }}>{icon}</span>
          </div>

          <div className="flex flex-col items-center leading-none rotate-180">
            <span className="font-extrabold text-xl tracking-tighter" style={{ color, fontFamily: 'Space Grotesk' }}>{rank}</span>
            <span className="text-sm mt-0.5" style={{ color }}>{icon}</span>
          </div>
        </div>

        {/* Back Face - Sophisticated Geometric Pattern */}
        <div
          className="absolute inset-0 w-full h-full bg-titanium-900 rounded-xl backface-hidden border-2 border-white/10 overflow-hidden shadow-inner"
          style={{ transform: 'rotateY(180deg)' }}
        >
            <div 
                className="w-full h-full opacity-20"
                style={{
                    backgroundImage: `linear-gradient(45deg, #fff 25%, transparent 25%), linear-gradient(-45deg, #fff 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #fff 75%), linear-gradient(-45deg, transparent 75%, #fff 75%)`,
                    backgroundSize: '16px 16px',
                    backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px'
                }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-12 h-20 border border-white/20 rounded-lg flex items-center justify-center">
                    <div className="w-8 h-14 border border-white/10 rounded-md bg-white/5" />
                </div>
            </div>
        </div>
      </animated.div>
    </div>
  );
};