type RateLimitDecision = {
  ok: boolean;
  retryAfterSeconds?: number;
};

type Bucket = {
  blockedUntilMs: number;
  hits: number[];
};

export class SlidingWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly windowMs: number,
    private readonly maxAttempts: number,
    private readonly blockMs: number,
  ) {}

  consume(key: string, nowMs = Date.now()): RateLimitDecision {
    const normalized = key.trim();
    if (!normalized) {
      return { ok: true };
    }
    let bucket = this.buckets.get(normalized);
    if (!bucket) {
      bucket = { blockedUntilMs: 0, hits: [] };
      this.buckets.set(normalized, bucket);
    }

    this.pruneBucket(bucket, nowMs);

    if (bucket.blockedUntilMs > nowMs) {
      return {
        ok: false,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.blockedUntilMs - nowMs) / 1000)),
      };
    }

    bucket.hits.push(nowMs);
    if (bucket.hits.length > this.maxAttempts) {
      bucket.blockedUntilMs = nowMs + this.blockMs;
      bucket.hits.length = 0;
      return {
        ok: false,
        retryAfterSeconds: Math.max(1, Math.ceil(this.blockMs / 1000)),
      };
    }

    return { ok: true };
  }

  reset(key: string): void {
    const normalized = key.trim();
    if (!normalized) {
      return;
    }
    this.buckets.delete(normalized);
  }

  private pruneBucket(bucket: Bucket, nowMs: number): void {
    const oldestAllowed = nowMs - this.windowMs;
    if (bucket.hits.length > 0) {
      bucket.hits = bucket.hits.filter((hit) => hit >= oldestAllowed);
    }
    if (bucket.blockedUntilMs <= nowMs && bucket.hits.length === 0) {
      bucket.blockedUntilMs = 0;
    }
  }
}

