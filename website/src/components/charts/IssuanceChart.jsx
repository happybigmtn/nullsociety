import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';
import { transformIssuanceData } from '../../utils/chartHelpers';

const IssuanceChart = ({ data }) => {
  const chartData = useMemo(() => transformIssuanceData(data), [data]);

  return (
    <div className="bg-gray-900 p-4 rounded-lg border border-gray-800 shadow-xl h-96">
      <h3 className="text-xl font-bold text-gray-100 mb-4 font-mono">Net Issuance Rate (RNG/s)</h3>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} stackOffset="sign">
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis 
            dataKey="timestamp" 
            stroke="#9ca3af" 
            tickFormatter={(ts) => new Date(ts).toLocaleTimeString()}
          />
          <YAxis stroke="#9ca3af" />
          <Tooltip 
            contentStyle={{ backgroundColor: '#111827', borderColor: '#374151' }}
            cursor={{ fill: '#374151', opacity: 0.2 }}
          />
          <ReferenceLine y={0} stroke="#4b5563" />
          <Legend />
          <Bar dataKey="rate_mint" fill="#22c55e" name="Mint Rate" stackId="stack" />
          <Bar dataKey="rate_burn" fill="#ef4444" name="Burn Rate" stackId="stack" />
          <Bar dataKey="net_rate" fill="#fbbf24" name="Net Change" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default IssuanceChart;
