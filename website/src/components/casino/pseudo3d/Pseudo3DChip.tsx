import React from 'react';
import { useSpring, animated } from '@react-spring/web';

interface Pseudo3DChipProps {
  value: number;
  color?: string; // Optional override
  count?: number; // Stack height
  style?: React.CSSProperties;
  className?: string;
  onClick?: () => void;
}

const chipColors: Record<number, { main: string; border: string; accent: string }> = {
  1: { main: '#FFFFFF', border: '#E5E5E5', accent: '#3B82F6' },
  5: { main: '#EF4444', border: '#DC2626', accent: '#F87171' },
  25: { main: '#10B981', border: '#059669', accent: '#34D399' },
  100: { main: '#111827', border: '#000000', accent: '#374151' },
  500: { main: '#8B5CF6', border: '#7C3AED', accent: '#A78BFA' },
  1000: { main: '#F59E0B', border: '#D97706', accent: '#FBBF24' },
};

export const Pseudo3DChip: React.FC<Pseudo3DChipProps> = ({
  value,
  color,
  count = 1,
  style,
  className = '',
  onClick,
}) => {
  const config = chipColors[value] || chipColors[1];
  const size = 48; // Base size in px

  // Stacking logic
  const renderStack = () => {
    const chips = [];
    const maxVisible = Math.min(count, 5); // Don't render 100 divs for big stacks

    for (let i = 0; i < maxVisible; i++) {
        const isTop = i === maxVisible - 1;
        chips.push(
            <div
                key={i}
                className="absolute rounded-full flex items-center justify-center border-2 shadow-sm transition-transform hover:scale-105"
                style={{
                    width: size,
                    height: size,
                    backgroundColor: config.main,
                    borderColor: config.border,
                    bottom: i * 4, // 4px thickness per chip
                    zIndex: i,
                    boxShadow: isTop ? 'inset 0 2px 4px rgba(255,255,255,0.3), 0 2px 4px rgba(0,0,0,0.2)' : 'none'
                }}
            >
                {/* Dashed ring pattern (CSS radial gradient) */}
                <div 
                    className="absolute inset-0 rounded-full" 
                    style={{
                        background: `repeating-conic-gradient(${config.accent} 0deg 15deg, transparent 15deg 30deg)`,
                        opacity: 0.8,
                        maskImage: 'radial-gradient(transparent 55%, black 56%, black 70%, transparent 71%)'
                    }}
                />
                
                {/* Inner Value Circle */}
                {isTop && (
                    <div className="w-2/3 h-2/3 bg-white rounded-full flex items-center justify-center border border-gray-200 shadow-inner z-10">
                         <span className="text-[10px] font-bold text-gray-800 tabular-nums">
                            {value >= 1000 ? `${value/1000}k` : value}
                         </span>
                    </div>
                )}
            </div>
        );
    }
    return chips;
  };

  return (
    <div 
        className={`relative ${className}`} 
        style={{ width: size, height: size + (Math.min(count, 5) * 4), ...style }}
        onClick={onClick}
    >
        {renderStack()}
        
        {/* Count Badge for large stacks */}
        {count > 1 && (
            <div className="absolute -top-2 -right-2 bg-black text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full z-50 border border-white">
                {count}
            </div>
        )}
    </div>
  );
};
