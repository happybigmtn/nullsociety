import React from 'react';

const StatsCard = ({ title, value, subtext, trend }) => {
  const trendColor = trend === 'up' ? 'text-green-400' : trend === 'down' ? 'text-red-400' : 'text-gray-400';
  
  return (
    <div className="bg-gray-900 p-6 rounded-lg border border-gray-800 shadow-xl">
      <h4 className="text-gray-400 text-sm uppercase tracking-wide font-bold mb-2">{title}</h4>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-mono text-gray-100 font-bold">{value}</span>
        {subtext && <span className={`text-sm ${trendColor}`}>{subtext}</span>}
      </div>
    </div>
  );
};

export default StatsCard;
