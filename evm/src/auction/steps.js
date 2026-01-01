function buildWeightedSteps(totalMps, steps) {
  if (!Number.isFinite(totalMps) || totalMps <= 0 || !Number.isInteger(totalMps)) {
    throw new Error('totalMps must be a positive integer');
  }
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error('steps required');
  }

  const normalized = steps.map((step, idx) => {
    const blockDelta = Number(step.blockDelta);
    const weight = Number(step.weight);
    if (!Number.isFinite(blockDelta) || !Number.isInteger(blockDelta) || blockDelta <= 0) {
      throw new Error(`step ${idx} blockDelta must be a positive integer`);
    }
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new Error(`step ${idx} weight must be > 0`);
    }
    return { blockDelta, weight };
  });

  const weightSum = normalized.reduce((sum, step) => sum + step.weight, 0);
  if (weightSum <= 0) {
    throw new Error('weights must be > 0');
  }

  let remainingMps = totalMps;
  const built = [];
  normalized.forEach((step, idx) => {
    const isLast = idx === normalized.length - 1;
    const stepTotalMps = isLast
      ? remainingMps
      : Math.floor((totalMps * step.weight) / weightSum);
    const mpsPerBlock = Math.max(1, Math.floor(stepTotalMps / step.blockDelta));
    built.push({ mpsPerBlock, blockDelta: step.blockDelta });
    remainingMps -= mpsPerBlock * step.blockDelta;
  });

  if (remainingMps > 0) {
    const last = built[built.length - 1];
    last.mpsPerBlock += Math.ceil(remainingMps / last.blockDelta);
  }

  return built;
}

function encodeAuctionSteps(steps) {
  const bytes = [];
  for (const step of steps) {
    const mps = step.mpsPerBlock;
    const blockDelta = step.blockDelta;
    if (mps <= 0 || mps > 0xffffff) {
      throw new Error(`invalid mpsPerBlock: ${mps}`);
    }
    if (blockDelta <= 0 || blockDelta > 0xffffffffff) {
      throw new Error(`invalid blockDelta: ${blockDelta}`);
    }
    bytes.push((mps >> 16) & 0xff, (mps >> 8) & 0xff, mps & 0xff);
    bytes.push(
      (blockDelta >> 32) & 0xff,
      (blockDelta >> 24) & 0xff,
      (blockDelta >> 16) & 0xff,
      (blockDelta >> 8) & 0xff,
      blockDelta & 0xff
    );
  }
  return '0x' + Buffer.from(bytes).toString('hex');
}

module.exports = { buildWeightedSteps, encodeAuctionSteps };
