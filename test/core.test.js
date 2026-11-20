import test from 'node:test';
import assert from 'node:assert/strict';
import { SlidingWindowRateLimiter } from '../src/index.js';

/**
 * A controllable clock for deterministic tests.
 * We never call Date.now or sleep in the suite.
 */
function fakeClock(start = 0) {
  let t = start;
  const fn = () => t;
  fn.advance = (ms) => { t += ms; };
  fn.set = (ms) => { t = ms; };
  return fn;
}

test('constructor validates windowMs', () => {
  assert.throws(() => new SlidingWindowRateLimiter({ windowMs: 0, maxEvents: 1 }), RangeError);
  assert.throws(() => new SlidingWindowRateLimiter({ windowMs: -5, maxEvents: 1 }), RangeError);
  assert.throws(() => new SlidingWindowRateLimiter({ windowMs: NaN, maxEvents: 1 }), RangeError);
  assert.throws(() => new SlidingWindowRateLimiter({ windowMs: Infinity, maxEvents: 1 }), RangeError);
  assert.throws(() => new SlidingWindowRateLimiter({ windowMs: '100', maxEvents: 1 }), RangeError);
});

test('constructor validates maxEvents', () => {
  assert.throws(() => new SlidingWindowRateLimiter({ windowMs: 100, maxEvents: -1 }), RangeError);
  assert.throws(() => new SlidingWindowRateLimiter({ windowMs: 100, maxEvents: 1.5 }), RangeError);
  assert.throws(() => new SlidingWindowRateLimiter({ windowMs: 100, maxEvents: NaN }), RangeError);
  assert.throws(() => new SlidingWindowRateLimiter({ windowMs: 100, maxEvents: '2' }), RangeError);
});

test('constructor validates clock', () => {
  assert.throws(() => new SlidingWindowRateLimiter({ windowMs: 100, maxEvents: 1, clock: 42 }), TypeError);
});

test('zero maxEvents rejects every event', () => {
  const clock = fakeClock(1000);
  const limiter = new SlidingWindowRateLimiter({ windowMs: 100, maxEvents: 0, clock });
  assert.equal(limiter.tryAcquire(), false);
  assert.equal(limiter.count(), 0);
  assert.equal(limiter.check(), false);
});

test('accepts up to maxEvents within the window', () => {
  const clock = fakeClock(0);
  const limiter = new SlidingWindowRateLimiter({ windowMs: 1000, maxEvents: 3, clock });

  assert.equal(limiter.tryAcquire(), true);
  assert.equal(limiter.tryAcquire(), true);
  assert.equal(limiter.tryAcquire(), true);
  assert.equal(limiter.tryAcquire(), false);
  assert.equal(limiter.count(), 3);
});

test('events fall out of the window as time advances', () => {
  const clock = fakeClock(0);
  const limiter = new SlidingWindowRateLimiter({ windowMs: 100, maxEvents: 2, clock });

  assert.equal(limiter.tryAcquire(), true);   // t=0
  clock.advance(50);
  assert.equal(limiter.tryAcquire(), true);   // t=50
  assert.equal(limiter.tryAcquire(), false);  // still full

  // t=100: event at t=0 is exactly windowMs old, so it is still inside.
  clock.advance(50);
  assert.equal(limiter.count(), 2);
  assert.equal(limiter.tryAcquire(), false);

  // t=101: event at t=0 is now strictly older than the window and is pruned.
  clock.advance(1);
  assert.equal(limiter.count(), 1);
  assert.equal(limiter.tryAcquire(), true);
});

test('boundary: an event exactly windowMs old is still counted', () => {
  const clock = fakeClock(1000);
  const limiter = new SlidingWindowRateLimiter({ windowMs: 10, maxEvents: 1, clock });

  assert.equal(limiter.tryAcquire(), true); // t=1000
  clock.advance(10);                          // t=1010
  assert.equal(limiter.count(), 1);
  assert.equal(limiter.tryAcquire(), false);

  clock.advance(1);                           // t=1011
  assert.equal(limiter.count(), 0);
  assert.equal(limiter.tryAcquire(), true);
});

test('check does not consume capacity', () => {
  const clock = fakeClock(0);
  const limiter = new SlidingWindowRateLimiter({ windowMs: 100, maxEvents: 1, clock });

  assert.equal(limiter.check(), true);
  assert.equal(limiter.check(), true);
  assert.equal(limiter.count(), 0);
  assert.equal(limiter.tryAcquire(), true);
  assert.equal(limiter.check(), false);
});

test('reset clears all recorded events', () => {
  const clock = fakeClock(0);
  const limiter = new SlidingWindowRateLimiter({ windowMs: 100, maxEvents: 2, clock });

  limiter.tryAcquire();
  limiter.tryAcquire();
  assert.equal(limiter.count(), 2);

  limiter.reset();
  assert.equal(limiter.count(), 0);
  assert.equal(limiter.tryAcquire(), true);
});

test('count prunes stale events before reporting', () => {
  const clock = fakeClock(0);
  const limiter = new SlidingWindowRateLimiter({ windowMs: 50, maxEvents: 5, clock });

  limiter.tryAcquire(); // t=0
  clock.advance(60);
  assert.equal(limiter.count(), 0);
});

test('records the timestamp returned by the clock, not a wall-clock value', () => {
  const clock = fakeClock(12345);
  const limiter = new SlidingWindowRateLimiter({ windowMs: 100, maxEvents: 1, clock });

  limiter.tryAcquire();
  assert.deepEqual(limiter.timestamps, [12345]);
});

test('mixed acquire and check across a sliding boundary', () => {
  const clock = fakeClock(500);
  const limiter = new SlidingWindowRateLimiter({ windowMs: 200, maxEvents: 2, clock });

  assert.equal(limiter.tryAcquire(), true); // t=500
  clock.advance(100);
  assert.equal(limiter.tryAcquire(), true); // t=600
  assert.equal(limiter.check(), false);

  clock.advance(100); // t=700, event at 500 is exactly windowMs old
  assert.equal(limiter.check(), false);
  assert.equal(limiter.tryAcquire(), false);

  clock.advance(1); // t=701, event at 500 is now stale
  assert.equal(limiter.check(), true);
  assert.equal(limiter.tryAcquire(), true);
  assert.equal(limiter.count(), 2);
});
