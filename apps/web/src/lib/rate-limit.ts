// ============================================================
// In-memory fixed-window rate limiter
// ============================================================
// Deliberately dependency-free: no Redis, no paid service.
//
// LIMITATION — single process only. State lives in this Node process, so a
// multi-instance / serverless deployment gets one bucket per instance and the
// effective limit multiplies by the instance count. It is also reset by a
// restart. Behind a multi-instance deployment, put a shared limiter (Redis or
// an edge/WAF rule) in front of this route. For a single-instance product this
// is the correct size of tool.

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the current window resets. */
  retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export class FixedWindowRateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Record a hit for `key` and report whether it is allowed. */
  hit(key: string, now: number = Date.now()): RateLimitResult {
    const bucket = this.buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, remaining: this.limit - 1, retryAfterSeconds: 0 };
    }

    bucket.count += 1;
    const allowed = bucket.count <= this.limit;
    return {
      allowed,
      remaining: Math.max(0, this.limit - bucket.count),
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  /** Drop expired buckets so the map cannot grow without bound. */
  sweep(now: number = Date.now()): void {
    for (const [key, bucket] of this.buckets) {
      if (now >= bucket.resetAt) this.buckets.delete(key);
    }
  }

  reset(key?: string): void {
    if (key === undefined) this.buckets.clear();
    else this.buckets.delete(key);
  }
}

/**
 * Best-effort client IP.
 *
 * NOTE: `x-forwarded-for` is client-controlled. Behind a trusted proxy this
 * header is set by the proxy and is the correct signal; when the app is
 * exposed directly it can be spoofed to evade the limit. Only trust it when a
 * proxy is actually in front of the app.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown';
  return headers.get('x-real-ip') ?? 'unknown';
}