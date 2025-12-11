import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { transformSupplyData } from '../../utils/chartHelpers';

const SupplyChart = ({ data }) => {
  const chartData = useMemo(() => transformSupplyData(data), [data]);

  return (
    <div className="bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-xl h-96">
      <h3 className="text-xl font-bold text-gray-100 mb-4 font-mono">Supply Evolution</h3>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="colorBurn" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="colorMint" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis 
            dataKey="timestamp" 
            stroke="#9ca3af" 
            tickFormatter={(ts) => new Date(ts).toLocaleTimeString()} 
          />
          <YAxis stroke="#9ca3af" />
          <Tooltip 
            contentStyle={{ backgroundColor: '#111827', borderColor: '#374151' }}
            itemStyle={{ color: '#f3f4f6' }}
          />
          <Legend />
          <Area 
            type="monotone" 
            dataKey="issuance" 
            stackId="1" 
            stroke="#22c55e" 
            fill="url(#colorMint)" 
            name="Total Minted"
          />
          <Area 
            type="monotone" 
            dataKey="burned" 
            stackId="2" 
            stroke="#ef4444" 
            fill="url(#colorBurn)" 
            name="Total Burned"
          />
          <Area 
            type="monotone" 
            dataKey="circulating" 
            stroke="#3b82f6" 
            fill="none" 
            strokeWidth={2}
            name="Circulating Supply"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default SupplyChart;
