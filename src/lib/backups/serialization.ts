export function normalizeForBackup(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value ?? null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeForBackup(item));
  }

  if (typeof value === 'object') {
    const possibleDecimal = value as {
      constructor?: { name?: string };
      toString?: () => string;
      toJSON?: () => unknown;
    };

    if (
      possibleDecimal.constructor?.name === 'Decimal' &&
      typeof possibleDecimal.toString === 'function'
    ) {
      return possibleDecimal.toString();
    }

    const result: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(
      value as Record<string, unknown>
    )) {
      result[key] = normalizeForBackup(item);
    }

    return result;
  }

  return value;
}

export function stableStringify(value: unknown) {
  return JSON.stringify(sortObject(normalizeForBackup(value)), null, 2);
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortObject(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const result: Record<string, unknown> = {};

  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    result[key] = sortObject((value as Record<string, unknown>)[key]);
  }

  return result;
}

export function parseJsonObject<T>(text: string, label: string): T {
  let value: unknown;

  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must contain a JSON object.`);
  }

  return value as T;
}
