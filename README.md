# sliding-window-rate-limiter-kit

Tracks event timestamps in a rolling time window and reports whether a new event exceeds a configured rate limit.

## Usage

```js
import { SlidingWindowRateLimiter } from 'sliding-window-rate-limiter-kit';

const limiter = new SlidingWindowRateLimiter({
  windowMs: 60_000,
  maxEvents: 10,
});

if (limiter.tryAcquire()) {
  // the event was recorded and is within the rate limit
} else {
  // the event was rejected because the window already holds 10 events
}
```

For deterministic tests you can inject a clock:

```js
let now = 0;
const limiter = new SlidingWindowRateLimiter({
  windowMs: 1000,
  maxEvents: 2,
  clock: () => now,
});

limiter.tryAcquire(); // true
now += 1000;
limiter.tryAcquire(); // true, because the first event is exactly at the boundary
now += 1;
limiter.count();      // 1, the first event has fallen out
```

## Why this exists

A fixed-window counter resets at a wall-clock boundary, so a burst can slip through the seam between two windows. A sliding window avoids that seam by keeping the actual timestamps and pruning anything older than `now - windowMs`. The trade-off is memory: we store up to `maxEvents` timestamps per limiter instead of a single integer. For the common case of a few hundred events that is negligible, and it buys an exact answer at the boundary.

The boundary is half-open: an event exactly `windowMs` old is still inside the window. That is the choice this library makes and tests; if you need the opposite convention you would subtract one millisecond from your window.

## API

### `new SlidingWindowRateLimiter({ windowMs, maxEvents, clock? })`

- `windowMs` — finite positive number, the length of the window in milliseconds.
- `maxEvents` — non-negative integer, the maximum number of events allowed inside the window.
- `clock` — optional function returning the current time in milliseconds. Defaults to `Date.now`. Inject a fake clock in tests so the suite never depends on wall-clock time.

### `limiter.tryAcquire(): boolean`

Records an event at the clock's current time if the window has room, and returns `true`. Otherwise returns `false` without recording anything.

### `limiter.check(): boolean`

Returns whether a new event would be allowed right now. Does not record anything.

### `limiter.count(): number`

Returns the number of events currently inside the window, after pruning stale timestamps.

### `limiter.reset(): void`

Removes every recorded event.

## The awkward edge

Events that land exactly on the window boundary are kept. At `t = 1000` with `windowMs = 1000`, an event recorded at `t = 0` still counts, so a full limiter stays full for one more millisecond. That is intentional and is covered by the tests; if your application expects the boundary to free capacity immediately, use a strictly smaller window or advance your clock past the boundary before checking.
