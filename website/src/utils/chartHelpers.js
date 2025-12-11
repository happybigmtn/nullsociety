export const transformSupplyData = (data) => {
  return data.map(d => ({
    ...d,
    circulating: 1_000_000_000 + (d.total_issuance || 0) - d.total_burned,
    issuance: d.total_issuance || 0,
    burned: d.total_burned,
    net: (d.total_issuance || 0) - d.total_burned
  }));
};

export const transformIssuanceData = (data) => {
  return data.map((d, i) => {
    if (i === 0) return { ...d, rate_mint: 0, rate_burn: 0, net_rate: 0 };
    const prev = data[i - 1];
    const dt = (d.timestamp - prev.timestamp) || 1; 
    
    const mintDelta = (d.total_issuance || 0) - (prev.total_issuance || 0);
    const burnDelta = d.total_burned - prev.total_burned;
    
    return {
      ...d,
      rate_mint: mintDelta / dt,
      rate_burn: -(burnDelta / dt),
      net_rate: (mintDelta - burnDelta) / dt
    };
  }).slice(1);
};
