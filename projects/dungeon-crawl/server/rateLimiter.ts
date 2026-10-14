type WindowRecord = { start: number; count: number };

export class WindowRateLimiter {
  private readonly records = new Map<string, WindowRecord>();

  constructor(readonly windowMs: number) {
    if (!Number.isSafeInteger(windowMs) || windowMs < 1) throw new Error("Rate-limit window must be a positive integer");
  }

  consume(key: string, limit: number, now = Date.now()): boolean {
    this.cleanup(now);
    const current = this.records.get(key);
    const next = !current || now - current.start >= this.windowMs
      ? { start: now, count: 1 }
      : { start: current.start, count: current.count + 1 };
    this.records.set(key, next);
    return next.count <= limit;
  }

  delete(key: string) { this.records.delete(key); }

  cleanup(now = Date.now()) {
    for (const [key, record] of this.records) {
      if (now - record.start >= this.windowMs) this.records.delete(key);
    }
  }

  get size() { return this.records.size; }
}
