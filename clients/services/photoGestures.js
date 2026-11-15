const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
const point = touch => ({ x: touch.pageX ?? touch.clientX ?? 0, y: touch.pageY ?? touch.clientY ?? 0 });
const pair = touches => {
  const a = point(touches[0]), b = point(touches[1]);
  return { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
};

// Shared gesture math for native responders and browser touch events. Rebase
// when a finger is added/removed so pinch -> one-finger drag never jumps.
export function createPhotoGestures({ width, height, onChange, onSwipe }) {
  let value = { scale: 1, x: 0, y: 0 }, gesture = null;
  const apply = next => {
    const scale = clamp(next.scale, 1, 4);
    value = { scale, x: clamp(next.x, -(scale - 1) * width / 2, (scale - 1) * width / 2), y: clamp(next.y, -(scale - 1) * height / 2, (scale - 1) * height / 2) };
    onChange({ ...value });
  };
  const start = touches => {
    if (touches.length >= 2) gesture = { mode: "pinch", ...pair(touches), base: { ...value } };
    else if (touches.length === 1) gesture = { mode: "pan", ...point(touches[0]), base: { ...value }, dx: 0, dy: 0 };
    else gesture = null;
  };
  return {
    snapshot: () => ({ ...value }), start,
    move(touches) {
      if (!touches.length) return;
      const mode = touches.length >= 2 ? "pinch" : "pan";
      if (!gesture || gesture.mode !== mode) { start(touches); return; }
      if (mode === "pinch") {
        const current = pair(touches);
        apply({ scale: gesture.base.scale * current.distance / gesture.distance,
          x: gesture.base.x + current.x - gesture.x, y: gesture.base.y + current.y - gesture.y });
      } else {
        const current = point(touches[0]);
        gesture.dx = current.x - gesture.x; gesture.dy = current.y - gesture.y;
        if (value.scale > 1) apply({ ...value, x: gesture.base.x + gesture.dx, y: gesture.base.y + gesture.dy });
      }
    },
    end(touches = []) {
      if (touches.length) { start(touches); return; }
      if (gesture?.mode === "pan" && value.scale <= 1.01 && Math.abs(gesture.dx) > 50 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.3) onSwipe?.(gesture.dx < 0 ? 1 : -1);
      gesture = null;
    },
    zoom(factor) { apply({ ...value, scale: value.scale * factor }); },
    reset() { gesture = null; apply({ scale: 1, x: 0, y: 0 }); },
  };
}
