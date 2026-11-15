export const SYSTEM_CONTROL_DEFAULTS = {
  ai_scoring_enabled: "true",
  sentiment_local_model_enabled: "true",
  sentiment_gemini_enabled: "false",
  sentiment_cebuano_mode: "local",
};

// Optimistic per-control saves. Revision fencing prevents a slow GET from
// replacing a newer edit, even when that edit has already finished saving.
export function createSystemSettingsSave({ initialSettings, persist, onCommit = () => {}, onError = () => {}, active = () => true }) {
  let values = { ...SYSTEM_CONTROL_DEFAULTS }, status = {}, ready = false, revision = 0;
  let confirmed = { ...values };
  const pending = new Map(), listeners = new Set();
  const snapshot = () => ({ values: { ...values }, status: { ...status }, ready });
  const emit = () => { if (active()) listeners.forEach(listener => listener(snapshot())); };
  const hydrate = (settings, expectedRevision = revision) => {
    if (!active() || !settings || expectedRevision !== revision || pending.size) return false;
    for (const key of Object.keys(SYSTEM_CONTROL_DEFAULTS)) {
      if (ready && !Object.hasOwn(settings, key)) continue;
      const value = settings[key];
      const allowed = key === "sentiment_cebuano_mode" ? ["local", "gemini", "disabled"] : ["true", "false"];
      values[key] = allowed.includes(value) ? value : SYSTEM_CONTROL_DEFAULTS[key];
    }
    ready = true;
    confirmed = { ...values };
    emit();
    return true;
  };
  hydrate(initialSettings);
  return {
    snapshot, hydrate, revision: () => revision,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    save(key, rawValue) {
      if (!active() || !ready || !Object.hasOwn(SYSTEM_CONTROL_DEFAULTS, key)) return Promise.resolve(false);
      if (pending.has(key)) return pending.get(key);
      const value = String(rawValue), previous = values[key];
      if (value === previous) return Promise.resolve(true);
      const allowed = key === "sentiment_cebuano_mode" ? ["local", "gemini", "disabled"] : ["true", "false"];
      if (!allowed.includes(value)) return Promise.resolve(false);
      values[key] = value;
      status[key] = "saving";
      revision++;
      const task = Promise.resolve().then(() => persist(key, value)).then(() => {
        if (!active()) return false;
        status[key] = "saved";
        confirmed[key] = value;
        onCommit(key, value, { ...confirmed });
        return true;
      }, error => {
        if (!active()) return false;
        values[key] = previous;
        status[key] = "error";
        onError(error);
        return false;
      }).finally(() => { pending.delete(key); revision++; emit(); });
      pending.set(key, task);
      emit();
      return task;
    },
  };
}
