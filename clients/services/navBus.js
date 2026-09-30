const navVisibilityListeners = new Set();

export const subscribeNavVisibility = (callback) => {
  navVisibilityListeners.add(callback);
  return () => navVisibilityListeners.delete(callback);
};

export const publishNavVisibility = (visible) => {
  navVisibilityListeners.forEach((callback) => {
    try {
      callback(visible);
    } catch {
      // ignore individual listener errors
    }
  });
};
