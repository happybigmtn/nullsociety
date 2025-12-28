import React, { useEffect } from 'react';
import { useSpring, animated } from '@react-spring/web';

interface Pseudo3DDiceProps {
  value: number;
  rolling?: boolean;
  size?: number;
  className?: string;
  color?: string; // Dice color (default: white/red)
}

// Map face value to rotation [x, y]
const getRotation = (val: number): [number, number] => {
  switch (val) {
    case 1: return [0, 0];
    case 2: return [-90, 0];
    case 3: return [0, -90];
    case 4: return [0, 90];
    case 5: return [90, 0];
    case 6: return [180, 0];
    default: return [0, 0];
  }
};

export const Pseudo3DDice: React.FC<Pseudo3DDiceProps> = ({
  value,
  rolling = false,
  size = 64,
  className = '',
  color = 'white',
}) => {
  const [rotX, rotY] = getRotation(value);

  const { transform, opacity } = useSpring({
    transform: rolling
      ? `rotateX(${720 + Math.random() * 360}deg) rotateY(${720 + Math.random() * 360}deg) scale(0.8)`
      : `rotateX(${rotX}deg) rotateY(${rotY}deg) scale(1)`,
    opacity: 1,
    config: rolling ? { duration: 200 } : { mass: 2, tension: 200, friction: 20 },
  });

  const faceSize = size;
  const translateZ = size / 2;

  // Face Styles
  const faceStyle: React.CSSProperties = {
    position: 'absolute',
    width: size,
    height: size,
    backgroundColor: color === 'red' ? '#DC2626' : '#FAFAFA',
    border: `1px solid ${color === 'red' ? '#B91C1C' : '#E5E5E5'}`,
    borderRadius: size * 0.15, // Rounded corners for realistic look
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: 'inset 0 0 10px rgba(0,0,0,0.1)',
    backfaceVisibility: 'hidden',
  };

  const dotStyle: React.CSSProperties = {
    width: size * 0.18,
    height: size * 0.18,
    borderRadius: '50%',
    backgroundColor: color === 'red' ? 'white' : 'black',
    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)', // Indent effect
  };

  // Helper to render dots grid
  const renderDots = (count: number) => {
    // Positioning logic for 1-6
    const positions: Record<number, React.CSSProperties[]> = {
      1: [{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }],
      2: [
        { top: '25%', left: '25%', transform: 'translate(-50%, -50%)' },
        { top: '75%', left: '75%', transform: 'translate(-50%, -50%)' },
      ],
      3: [
        { top: '25%', left: '25%', transform: 'translate(-50%, -50%)' },
        { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
        { top: '75%', left: '75%', transform: 'translate(-50%, -50%)' },
      ],
      4: [
        { top: '25%', left: '25%', transform: 'translate(-50%, -50%)' },
        { top: '25%', left: '75%', transform: 'translate(-50%, -50%)' },
        { top: '75%', left: '25%', transform: 'translate(-50%, -50%)' },
        { top: '75%', left: '75%', transform: 'translate(-50%, -50%)' },
      ],
      5: [
        { top: '25%', left: '25%', transform: 'translate(-50%, -50%)' },
        { top: '25%', left: '75%', transform: 'translate(-50%, -50%)' },
        { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
        { top: '75%', left: '25%', transform: 'translate(-50%, -50%)' },
        { top: '75%', left: '75%', transform: 'translate(-50%, -50%)' },
      ],
      6: [
        { top: '25%', left: '25%', transform: 'translate(-50%, -50%)' },
        { top: '25%', left: '75%', transform: 'translate(-50%, -50%)' },
        { top: '50%', left: '25%', transform: 'translate(-50%, -50%)' },
        { top: '50%', left: '75%', transform: 'translate(-50%, -50%)' },
        { top: '75%', left: '25%', transform: 'translate(-50%, -50%)' },
        { top: '75%', left: '75%', transform: 'translate(-50%, -50%)' },
      ],
    };

    return positions[count].map((pos, i) => (
      <div key={i} style={{ ...dotStyle, position: 'absolute', ...pos }} />
    ));
  };

  return (
    <div className={`relative ${className}`} style={{ width: size, height: size, perspective: '600px' }}>
      <animated.div
        className="w-full h-full relative preserve-3d"
        style={{ transform, transformOrigin: 'center center' }}
      >
        {/* Front (1) */}
        <div style={{ ...faceStyle, transform: `translateZ(${translateZ}px)` }}>
          {renderDots(1)}
        </div>
        
        {/* Back (6) */}
        <div style={{ ...faceStyle, transform: `rotateY(180deg) translateZ(${translateZ}px)` }}>
          {renderDots(6)}
        </div>

        {/* Right (4) */}
        <div style={{ ...faceStyle, transform: `rotateY(90deg) translateZ(${translateZ}px)` }}>
          {renderDots(4)}
        </div>

        {/* Left (3) */}
        <div style={{ ...faceStyle, transform: `rotateY(-90deg) translateZ(${translateZ}px)` }}>
          {renderDots(3)}
        </div>

        {/* Top (5) */}
        <div style={{ ...faceStyle, transform: `rotateX(90deg) translateZ(${translateZ}px)` }}>
          {renderDots(5)}
        </div>

        {/* Bottom (2) */}
        <div style={{ ...faceStyle, transform: `rotateX(-90deg) translateZ(${translateZ}px)` }}>
          {renderDots(2)}
        </div>
      </animated.div>
      
      {/* Shadow */}
      <animated.div 
        style={{
            position: 'absolute',
            bottom: -size/3,
            left: '10%',
            width: '80%',
            height: size/4,
            background: 'black',
            borderRadius: '50%',
            filter: 'blur(8px)',
            opacity: rolling ? 0.2 : 0.4,
            transform: 'scale(1)',
            zIndex: -1
        }}
      />
    </div>
  );
};
