import { sessionData } from "./sessionData.js";

// Lives outside keyed page layouts, so clearing the session cannot dismiss the
// notice. An ordinary logout/expired token must not create a disabled notice.
export function createDisabledSessionNotice(sessions) {
  let visible = false;
  const listeners = new Set();
  const update = value => {
    if (visible === value) return;
    visible = value;
    listeners.forEach(listener => listener());
  };
  const unsubscribe = sessions.subscribe(event => {
    if (event.type !== "session") return;
    if (event.reason === "disabled") update(true);
    else if (event.reason === "begin") update(false);
  });
  return {
    snapshot: () => visible,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    acknowledge: () => update(false),
    dispose: unsubscribe,
  };
}

export const disabledSessionNotice = createDisabledSessionNotice(sessionData);
