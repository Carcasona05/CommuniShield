const ROTATION_POOL = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-3-flash-preview",
];

const BASE_COOLDOWN_MS = 60_000;
const MAX_COOLDOWN_MS = 30 * 60_000;

const exhaustedUntil = new Map<string, number>();
const consecutiveFailures = new Map<string, number>();

export class GeminiClientError extends Error {}

export const markModelExhausted = (model: string): void => {
  const failures = (consecutiveFailures.get(model) ?? 0) + 1;
  consecutiveFailures.set(model, failures);
  const cooldown = Math.min(BASE_COOLDOWN_MS * 2 ** (failures - 1), MAX_COOLDOWN_MS);
  exhaustedUntil.set(model, Date.now() + cooldown);
};

export const clearModelExhaustion = (model?: string): void => {
  if (model) {
    exhaustedUntil.delete(model);
    consecutiveFailures.delete(model);
    return;
  }
  exhaustedUntil.clear();
  consecutiveFailures.clear();
};

export const candidateModels = (primary: string): string[] => {
  const now = Date.now();
  const ordered: string[] = [];
  const push = (name: string): void => {
    if (name && !ordered.includes(name)) ordered.push(name);
  };
  push(primary);
  ROTATION_POOL.forEach(push);

  const available = ordered.filter((name) => (exhaustedUntil.get(name) ?? 0) <= now);
  return available.length > 0 ? available : ordered;
};

export const __testing = {
  ROTATION_POOL,
  BASE_COOLDOWN_MS,
  MAX_COOLDOWN_MS,
  exhaustedUntil,
  consecutiveFailures,
};
