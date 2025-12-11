import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

const PnLChart = ({ data }) => {
  // Find epoch changes
  const epochChanges = [];
  let currentEpoch = data[0]?.epoch;
  
  data.forEach((d, i) => {
    if (d.epoch !== currentEpoch) {
      epochChanges.push({ index: i, epoch: d.epoch, timestamp: d.timestamp });
      currentEpoch = d.epoch;
    }
  });

  return (
    <div className="bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-xl h-96">
      <h3 className="text-xl font-bold text-gray-100 mb-4 font-mono">House PnL (Epoch Cycles)</h3>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis 
            dataKey="timestamp" 
            stroke="#9ca3af" 
            tickFormatter={(ts) => new Date(ts).toLocaleTimeString()}
          />
          <YAxis stroke="#9ca3af" />
          <Tooltip 
            contentStyle={{ backgroundColor: '#111827', borderColor: '#374151' }}
          />
          <Line 
            type="stepAfter" 
            dataKey="house_pnl" 
            stroke="#8b5cf6" 
            strokeWidth={2} 
            dot={false} 
            name="Net PnL"
          />
          {epochChanges.map((e, i) => (
            <ReferenceLine 
              key={i} 
              x={e.timestamp} 
              stroke="#fbbf24" 
              label={{ value: `Epoch ${e.epoch}`, fill: '#fbbf24', position: 'insideTopLeft' }} 
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default PnLChart;
