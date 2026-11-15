import assert from "node:assert/strict";
import { test } from "node:test";
import { createPhotoGestures } from "../services/photoGestures.js";
const touch = (x, y) => ({ pageX: x, pageY: y });
function fixture() {
  const changes = [], swipes = [];
  const gestures = createPhotoGestures({ width: 400, height: 800, onChange: value => changes.push(value), onSwipe: direction => swipes.push(direction) });
  return { gestures, changes, swipes };
}

test("two-finger pinch increases scale and clamps between one and four", () => {
  const { gestures } = fixture();
  gestures.start([touch(100, 200), touch(200, 200)]);
  gestures.move([touch(50, 200), touch(250, 200)]);
  assert.equal(gestures.snapshot().scale, 2);
  gestures.move([touch(-1000, 200), touch(1000, 200)]);
  assert.equal(gestures.snapshot().scale, 4);
  gestures.move([touch(149, 200), touch(151, 200)]);
  assert.deepEqual(gestures.snapshot(), { scale: 1, x: 0, y: 0 });
});

test("one finger can become a pinch then drag without scale jumps or photo swipes", () => {
  const { gestures, swipes } = fixture();
  gestures.start([touch(100, 200)]);
  gestures.move([touch(100, 200), touch(200, 200)]);
  gestures.move([touch(50, 200), touch(250, 200)]);
  assert.equal(gestures.snapshot().scale, 2);
  gestures.end([touch(50, 200)]);
  gestures.move([touch(110, 270)]);
  assert.deepEqual(gestures.snapshot(), { scale: 2, x: 60, y: 70 });
  gestures.end();
  assert.deepEqual(swipes, []);
});

test("unzoomed swipes change photos once; vertical motion and taps do not", () => {
  const { gestures, swipes } = fixture();
  gestures.start([touch(200, 300)]); gestures.move([touch(100, 305)]); gestures.end(); gestures.end();
  gestures.start([touch(100, 300)]); gestures.move([touch(210, 302)]); gestures.end();
  gestures.start([touch(100, 300)]); gestures.move([touch(100, 500)]); gestures.end();
  assert.deepEqual(swipes, [1, -1]);
});

test("zoom controls reset translation and degenerate touches never produce NaN", () => {
  const { gestures } = fixture();
  gestures.start([touch(100, 100), touch(100, 100)]);
  gestures.move([touch(50, 100), touch(150, 100)]);
  assert.equal(gestures.snapshot().scale, 4);
  gestures.zoom(0.5); assert.equal(gestures.snapshot().scale, 2);
  gestures.reset(); assert.deepEqual(gestures.snapshot(), { scale: 1, x: 0, y: 0 });
});
