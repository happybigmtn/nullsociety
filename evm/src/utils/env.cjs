function envString(key, fallback = '') {
  const value = process.env[key];
  return value && value.length > 0 ? value : fallback;
}

function envNumber(key, fallback) {
  const value = process.env[key];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envBigInt(key, fallback) {
  const value = process.env[key];
  if (!value) return fallback;
  try {
    return BigInt(value);
  } catch {
    return fallback;
  }
}

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'y', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'n', 'off']);

function parseBoolean(raw, key = 'value') {
  const normalized = raw.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  throw new Error(`${key} must be a boolean (true/false)`);
}

function envBoolean(key, fallback = false) {
  const value = process.env[key];
  if (!value) return fallback;
  return parseBoolean(value, key);
}

function parseEnv(schema) {
  const result = {};
  const errors = [];

  for (const [key, spec] of Object.entries(schema)) {
    const raw = process.env[key];
    const hasRaw = raw !== undefined && raw !== null && String(raw).trim().length > 0;
    let value;

    if (hasRaw) {
      try {
        value = spec.parse ? spec.parse(raw) : parseByType(raw, key, spec);
      } catch (err) {
        errors.push(`${key}: ${err.message}`);
        continue;
      }
    } else if (Object.prototype.hasOwnProperty.call(spec, 'default')) {
      value = typeof spec.default === 'function' ? spec.default() : spec.default;
    } else if (spec.required) {
      errors.push(`${key} is required`);
      continue;
    } else {
      value = undefined;
    }

    if (spec.normalize) {
      value = spec.normalize(value);
    }

    if (spec.validate && value !== undefined) {
      const validation = spec.validate(value);
      if (validation === false) {
        errors.push(`${key} is invalid`);
      } else if (typeof validation === 'string' && validation.length > 0) {
        errors.push(`${key}: ${validation}`);
      }
    }

    result[key] = value;
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment variables:\n- ${errors.join('\n- ')}`);
  }

  return result;
}

function parseByType(raw, key, spec) {
  const type = spec.type ?? 'string';
  switch (type) {
    case 'number': {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) {
        throw new Error('must be a number');
      }
      if (spec.integer && !Number.isInteger(parsed)) {
        throw new Error('must be an integer');
      }
      if (spec.min !== undefined && parsed < spec.min) {
        throw new Error(`must be >= ${spec.min}`);
      }
      if (spec.max !== undefined && parsed > spec.max) {
        throw new Error(`must be <= ${spec.max}`);
      }
      return parsed;
    }
    case 'bigint': {
      let parsed;
      try {
        parsed = BigInt(raw);
      } catch {
        throw new Error('must be a bigint');
      }
      if (spec.min !== undefined && parsed < spec.min) {
        throw new Error(`must be >= ${spec.min.toString()}`);
      }
      if (spec.max !== undefined && parsed > spec.max) {
        throw new Error(`must be <= ${spec.max.toString()}`);
      }
      return parsed;
    }
    case 'boolean':
      return parseBoolean(raw, key);
    case 'string':
    default:
      return spec.trim === false ? String(raw) : String(raw).trim();
  }
}

module.exports = {
  envString,
  envNumber,
  envBigInt,
  envBoolean,
  parseEnv,
};
