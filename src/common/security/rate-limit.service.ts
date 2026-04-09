import { Injectable } from '@nestjs/common';

type Bucket = {
  count: number;
  resetAt: number;
};

@Injectable()
export class RateLimitService {
  private readonly buckets = new Map<string, Bucket>();

  consume(key: string, limit: number, ttlMs: number) {
    const now = Date.now();
    const current = this.buckets.get(key);

    if (!current || current.resetAt <= now) {
      const nextBucket: Bucket = { count: 1, resetAt: now + ttlMs };
      this.buckets.set(key, nextBucket);
      return this.buildResult(nextBucket, limit, now);
    }

    current.count += 1;
    this.buckets.set(key, current);
    return this.buildResult(current, limit, now);
  }

  private buildResult(bucket: Bucket, limit: number, now: number) {
    const remaining = Math.max(limit - bucket.count, 0);
    return {
      limit,
      remaining,
      retryAfterSec: Math.max(Math.ceil((bucket.resetAt - now) / 1000), 0),
      resetAt: bucket.resetAt,
      allowed: bucket.count <= limit,
    };
  }
}
