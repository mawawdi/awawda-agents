import { Inject, Injectable } from '@nestjs/common';

import { SESSIONS_CONFIG } from './sessions.constants';
import type { SessionsConfig } from './sessions.config';

type ActivationRateLimitBucket = {
  count: number;
  windowStartMs: number;
};

export type ActivationRateLimitResult =
  | {
      allowed: true;
    }
  | {
      allowed: false;
      retryAfterSeconds: number;
    };

@Injectable()
export class ActivationRateLimiter {
  private readonly buckets = new Map<string, ActivationRateLimitBucket>();

  constructor(@Inject(SESSIONS_CONFIG) private readonly sessionsConfig: SessionsConfig) {}

  consume(clientIp: string, now: Date): ActivationRateLimitResult {
    const normalizedClientIp = normalizeClientIp(clientIp);
    const windowMs = this.sessionsConfig.activationRateLimitWindowSeconds * 1000;
    const burst = this.sessionsConfig.activationRateLimitBurst;
    const nowMs = now.getTime();

    const existingBucket = this.buckets.get(normalizedClientIp);
    const activeBucket = !existingBucket || nowMs - existingBucket.windowStartMs >= windowMs
      ? { count: 0, windowStartMs: nowMs }
      : existingBucket;

    if (activeBucket.count >= burst) {
      const retryAfterMs = Math.max(windowMs - (nowMs - activeBucket.windowStartMs), 0);
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      };
    }

    activeBucket.count += 1;
    this.buckets.set(normalizedClientIp, activeBucket);
    this.pruneExpiredBuckets(windowMs, nowMs);
    return { allowed: true };
  }

  private pruneExpiredBuckets(windowMs: number, nowMs: number): void {
    if (this.buckets.size < 5_000) {
      return;
    }

    for (const [ip, bucket] of this.buckets.entries()) {
      if (nowMs - bucket.windowStartMs >= windowMs) {
        this.buckets.delete(ip);
      }
    }
  }
}

function normalizeClientIp(clientIp: string): string {
  const trimmed = clientIp.trim();
  if (trimmed.length === 0) {
    return 'unknown';
  }

  return trimmed.length <= 128 ? trimmed : trimmed.slice(0, 128);
}
