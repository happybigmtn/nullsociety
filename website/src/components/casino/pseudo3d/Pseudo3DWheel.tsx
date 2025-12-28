import React, { useEffect, useState } from 'react';
import { useSpring, animated, config } from '@react-spring/web';

interface Pseudo3DWheelProps {
    lastNumber: number | null;
    isSpinning: boolean;
    className?: string;
    style?: React.CSSProperties;
    onSpinComplete?: () => void;
}

const ROULETTE_NUMBERS = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];

const getNumberColor = (num: number) => {
    if (num === 0) return '#34C759'; // Action Success (Green)
    const redNums = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
    return redNums.includes(num) ? '#FF3B30' : '#1C1C1E'; // Action Destructive / Titanium 900
};

export const Pseudo3DWheel: React.FC<Pseudo3DWheelProps> = ({
    lastNumber,
    isSpinning,
    className = '',
    style,
    onSpinComplete
}) => {
    const [rotation, setRotation] = useState(0);

    const getTargetRotation = (target: number) => {
        const index = ROULETTE_NUMBERS.indexOf(target);
        if (index === -1) return 0;
        const segmentAngle = 360 / 37;
        const baseRotation = index * segmentAngle;
        const extraSpins = (6 + Math.floor(Math.random() * 4)) * 360; 
        return -(baseRotation + extraSpins);
    };

    const { rotate } = useSpring({
        rotate: isSpinning && lastNumber !== null 
            ? getTargetRotation(lastNumber) 
            : rotation,
        config: isSpinning ? { mass: 4, tension: 100, friction: 40 } : config.stiff,
        onRest: () => {
            if (isSpinning && onSpinComplete) {
                onSpinComplete();
            }
        }
    });
    
    // Improved Ball Animation (Spiral + Bounce)
    const { ballRotate, ballRadius, ballBounce } = useSpring({
        ballRotate: isSpinning ? 1440 + Math.random() * 720 : 0,
        ballRadius: isSpinning ? 130 : 115, // Spiral inward
        ballBounce: isSpinning ? 0 : 2, // Slight bounce on settle
        config: isSpinning 
            ? { duration: 3500, easing: t => t * t * (3 - 2 * t) } 
            : { mass: 3, tension: 120, friction: 14 } // Overshoot config for settling
    });

    return (
        <div className={`relative ${className}`} style={{ width: 320, height: 320, ...style }}>
            {/* Shadow beneath wheel */}
            <div className="absolute inset-4 rounded-full bg-black/20 blur-2xl" />

            {/* Outer Static Ring (Titanium) */}
            <div className="absolute inset-0 rounded-full border-[12px] border-titanium-200 shadow-float flex items-center justify-center bg-titanium-100 overflow-hidden">
                
                {/* Spinning Wheel */}
                <animated.div 
                    className="w-full h-full rounded-full relative shadow-inner"
                    style={{ transform: rotate.to(r => `rotate(${r}deg)`) }}
                >
                    <svg viewBox="0 0 320 320" className="w-full h-full transform -rotate-90">
                        {ROULETTE_NUMBERS.map((num, i) => {
                            const angle = 360 / 37;
                            const rotation = i * angle;
                            const color = getNumberColor(num);
                            
                            const r = 148;
                            const startA = (rotation - angle/2) * Math.PI / 180;
                            const endA = (rotation + angle/2) * Math.PI / 180;
                            const x1 = 160 + r * Math.cos(startA);
                            const y1 = 160 + r * Math.sin(startA);
                            const x2 = 160 + r * Math.cos(endA);
                            const y2 = 160 + r * Math.sin(endA);

                            const textR = 124;
                            const textA = rotation * Math.PI / 180;
                            const tx = 160 + textR * Math.cos(textA);
                            const ty = 160 + textR * Math.sin(textA);

                            return (
                                <g key={num}>
                                    <path 
                                        d={`M160,160 L${x1},${y1} A${r},${r} 0 0,1 ${x2},${y2} Z`} 
                                        fill={color}
                                        stroke="rgba(255,255,255,0.05)"
                                        strokeWidth="0.5"
                                    />
                                    <text 
                                        x={tx} 
                                        y={ty} 
                                        fill="white" 
                                        fontSize="10" 
                                        fontWeight="800"
                                        textAnchor="middle" 
                                        dominantBaseline="middle"
                                        style={{ fontFamily: 'Space Grotesk' }}
                                        transform={`rotate(${rotation + 90}, ${tx}, ${ty})`}
                                    >
                                        {num}
                                    </text>
                                </g>
                            );
                        })}
                        {/* Center Hub (Titanium Gradient) */}
                        <defs>
                            <radialGradient id="hubGradient" cx="50%" cy="50%" r="50%">
                                <stop offset="0%" stopColor="#f9f9f9" />
                                <stop offset="100%" stopColor="#d1d1d6" />
                            </radialGradient>
                        </defs>
                        <circle cx="160" cy="160" r="45" fill="url(#hubGradient)" />
                        <circle cx="160" cy="160" r="40" fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth="1" />
                    </svg>
                </animated.div>

                {/* Ball */}
                <animated.div 
                    className="absolute w-3.5 h-3.5 bg-white rounded-full shadow-lg z-10"
                    style={{
                        transform: ballRotate.to(r => 
                            `rotate(${-r}deg) translateY(-${115}px) scale(${isSpinning ? 1 : 1.1})`
                        ),
                        opacity: isSpinning || lastNumber !== null ? 1 : 0
                    }}
                />
                
                {/* Pointer / Flapper */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-6 bg-action-primary z-20 rounded-full" />
                
                {/* Gloss Overlay */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-white/20 via-transparent to-black/5 pointer-events-none" />
            </div>
        </div>
    );
};