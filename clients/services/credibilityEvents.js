const listeners = new Set();
export const subscribeCredibilityNotice = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export const notifyCredibilityNotice = message => { for (const listener of listeners) listener(message); };
