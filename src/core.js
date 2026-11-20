const DEFAULT_CLOCK = () => Date.now();

export class SlidingWindowRateLimiter {
  /**
   * @param {object} options
   * @param {number} options.windowMs - length of the sliding window in milliseconds
   * @param {number} options.maxEvents - maximum number of events allowed within the window
   * @param {() => number} [options.clock] - function returning current time in milliseconds.
   *   Injectable for deterministic tests; defaults to Date.now.
   */
  constructor({ windowMs, maxEvents, clock = DEFAULT_CLOCK }) {
    if (typeof windowMs !== 'number' || !Number.isFinite(windowMs) || windowMs <= 0) {
      throw new RangeError('windowMs must be a finite positive number');
    }
    if (typeof maxEvents !== 'number' || !Number.isInteger(maxEvents) || maxEvents < 0) {
      throw new RangeError('maxEvents must be a non-negative integer');
    }
    if (typeof clock !== 'function') {
      throw new TypeError('clock must be a function');
    }
    this.windowMs = windowMs;
    this.maxEvents = maxEvents;
    this.clock = clock;
    /** @type {number[]} timestamps of accepted events, ascending */
    this.timestamps = [];
  }

  /**
   * Remove timestamps that are strictly older than the window.
   * The window is defined as [now - windowMs, now]. An event exactly windowMs old is
   * still inside the window, so we keep it. This is a deliberate half-open interval
   * choice to avoid a one-millisecond gap at the boundary.
   */
  prune(now) {
    const cutoff = now - this.windowMs;
    let i = 0;
    while (i < this.timestamps.length && this.timestamps[i] < cutoff) {
      i++;
    }
    if (i > 0) {
      this.timestamps = this.timestamps.slice(i);
    }
  }

  /**
   * Test whether a new event at the current time would be allowed.
   * Does not mutate state.
   * @returns {boolean}
   */
  check() {
    const now = this.clock();
    this.prune(now);
    return this.timestamps.length < this.maxEvents;
  }

  /**
   * Attempt to record a new event at the current time.
   * @returns {boolean} true if the event was accepted and recorded; false if rejected.
   */
  tryAcquire() {
    const now = this.clock();
    this.prune(now);
    if (this.timestamps.length < this.maxEvents) {
      this.timestamps.push(now);
      return true;
    }
    return false;
  }

  /**
   * Number of events currently inside the sliding window, after pruning.
   * @returns {number}
   */
  count() {
    const now = this.clock();
    this.prune(now);
    return this.timestamps.length;
  }

  /**
   * Remove all recorded events.
   */
  reset() {
    this.timestamps = [];
  }
}
