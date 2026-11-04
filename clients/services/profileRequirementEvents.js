const listeners = new Set();
export const subscribeProfileRequirement = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export const notifyProfileRequirement = missing => {
  const fields = Array.isArray(missing) ? missing.filter(value => typeof value === "string") : [];
  for (const listener of listeners) listener(fields);
};
