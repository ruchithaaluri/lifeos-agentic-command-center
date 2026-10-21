// ============================================================
// Fixed-window rate limiter
// ============================================================

import { describe, it, expect } from 'vitest';
import { FixedWindowRateLimiter, clientIp } from '@/lib/rate-limit';

describe('FixedWindowRateLimiter', () => {
  it('allows requests up to the limit', () => {
    const rl = new FixedWindowRateLimiter(3, 1000);
    expect(rl.hit('ip', 0).allowed).toBe(true);
    expect(rl.hit('ip', 10).allowed).toBe(true);
    expect(rl.hit('ip', 20).allowed).toBe(true);
  });

  it('rejects the request after the limit', () => {
    const rl = new FixedWindowRateLimiter(2, 1000);
    rl.hit('ip', 0);
    rl.hit('ip', 1);
    const third = rl.hit('ip', 2);
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
  });

  it('returns 429-shaped retry guidance', () => {
    const rl = new FixedWindowRateLimiter(1, 60_000);
    rl.hit('ip', 0);
    const blocked = rl.hit('ip', 30_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(30);
  });

  it('resets after the window elapses', () => {
    const rl = new FixedWindowRateLimiter(1, 1000);
    expect(rl.hit('ip', 0).allowed).toBe(true);
    expect(rl.hit('ip', 500).allowed).toBe(false);
    expect(rl.hit('ip', 1500).allowed).toBe(true);
  });

  it('tracks keys independently', () => {
    const rl = new FixedWindowRateLimiter(1, 1000);
    expect(rl.hit('a', 0).allowed).toBe(true);
    expect(rl.hit('a', 1).allowed).toBe(false);
    expect(rl.hit('b', 1).allowed).toBe(true);
  });

  it('sweeps expired buckets', () => {
    const rl = new FixedWindowRateLimiter(1, 1000);
    rl.hit('a', 0);
    rl.hit('b', 0);
    rl.sweep(2000);
    // Both buckets expired, so both keys start fresh.
    expect(rl.hit('a', 2000).allowed).toBe(true);
    expect(rl.hit('b', 2000).allowed).toBe(true);
  });

  it('reset clears one key or everything', () => {
    const rl = new FixedWindowRateLimiter(1, 1000);
    rl.hit('a', 0);
    rl.hit('b', 0);
    rl.reset('a');
    expect(rl.hit('a', 1).allowed).toBe(true);
    expect(rl.hit('b', 1).allowed).toBe(false);
    rl.reset();
    expect(rl.hit('b', 2).allowed).toBe(true);
  });
});

describe('clientIp', () => {
  it('uses the first forwarded address', () => {
    const h = new Headers({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' });
    expect(clientIp(h)).toBe('1.1.1.1');
  });

  it('falls back to x-real-ip', () => {
    expect(clientIp(new Headers({ 'x-real-ip': '3.3.3.3' }))).toBe('3.3.3.3');
  });

  it('returns unknown when no headers are present', () => {
    expect(clientIp(new Headers())).toBe('unknown');
  });
});
