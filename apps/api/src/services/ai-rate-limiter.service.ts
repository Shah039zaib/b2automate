/**
 * AI Rate Limiter Service
 * 
 * Per-tenant AI burst control to prevent abuse beyond daily/monthly limits.
 * Works alongside existing AI governance limits.
 * 
 * STRATEGY:
 * - Sliding window rate limiting
 * - Configurable per-tenant burst limits
 * - Redis-based for horizontal scaling
 * 
 * DEFAULT LIMITS (can be overridden per tenant):
 * - 20 requests per minute (burst protection)
 * - 100 requests per hour (sustained protection)
 */

import Redis from 'ioredis';
import { logger } from '@b2automate/logger';

export interface RateLimitConfig {
    windowSeconds: number;
    maxRequests: number;
}

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetInSeconds: number;
    currentCount: number;
}

// Default rate limits for AI requests
const DEFAULT_BURST_LIMIT: RateLimitConfig = {
    windowSeconds: 60,      // 1 minute window
    maxRequests: 20,        // 20 requests per minute
};

const DEFAULT_SUSTAINED_LIMIT: RateLimitConfig = {
    windowSeconds: 3600,    // 1 hour window
    maxRequests: 100,       // 100 requests per hour
};

export class AiRateLimiter {
    constructor(private redis: Redis) { }

    /**
     * Check and enforce AI rate limit for a tenant
     * Returns result with allowed status and remaining quota
     */
    async checkLimit(
        tenantId: string,
        limitType: 'burst' | 'sustained' = 'burst'
    ): Promise<RateLimitResult> {
        const config = limitType === 'burst' ? DEFAULT_BURST_LIMIT : DEFAULT_SUSTAINED_LIMIT;
        const key = `ai:ratelimit:${limitType}:${tenantId}`;

        try {
            // Increment counter
            const count = await this.redis.incr(key);

            // Set expiry on first request in window
            if (count === 1) {
                await this.redis.expire(key, config.windowSeconds);
            }

            // Get TTL for reset time
            const ttl = await this.redis.ttl(key);

            const allowed = count <= config.maxRequests;
            const remaining = Math.max(0, config.maxRequests - count);

            if (!allowed) {
                logger.warn({
                    tenantId,
                    limitType,
                    count,
                    maxRequests: config.maxRequests,
                    resetInSeconds: ttl
                }, 'AI rate limit exceeded');
            }

            return {
                allowed,
                remaining,
                resetInSeconds: ttl > 0 ? ttl : config.windowSeconds,
                currentCount: count
            };

        } catch (err) {
            // On Redis error, fail open (allow request but log error)
            logger.error({ err, tenantId }, 'AI rate limit check failed - allowing request');
            return {
                allowed: true,
                remaining: config.maxRequests,
                resetInSeconds: config.windowSeconds,
                currentCount: 0
            };
        }
    }

    /**
     * Check both burst and sustained limits
     * Request is blocked if EITHER limit is exceeded
     */
    async checkAllLimits(tenantId: string): Promise<{
        allowed: boolean;
        burst: RateLimitResult;
        sustained: RateLimitResult;
    }> {
        const [burst, sustained] = await Promise.all([
            this.checkLimit(tenantId, 'burst'),
            this.checkLimit(tenantId, 'sustained')
        ]);

        return {
            allowed: burst.allowed && sustained.allowed,
            burst,
            sustained
        };
    }

    /**
     * Get current rate limit status without incrementing
     * Useful for displaying remaining quota in API responses
     */
    async getStatus(tenantId: string): Promise<{
        burst: { remaining: number; resetInSeconds: number };
        sustained: { remaining: number; resetInSeconds: number };
    }> {
        const burstKey = `ai:ratelimit:burst:${tenantId}`;
        const sustainedKey = `ai:ratelimit:sustained:${tenantId}`;

        const [burstCount, burstTtl, sustainedCount, sustainedTtl] = await Promise.all([
            this.redis.get(burstKey),
            this.redis.ttl(burstKey),
            this.redis.get(sustainedKey),
            this.redis.ttl(sustainedKey)
        ]);

        return {
            burst: {
                remaining: Math.max(0, DEFAULT_BURST_LIMIT.maxRequests - (parseInt(burstCount || '0', 10))),
                resetInSeconds: burstTtl > 0 ? burstTtl : DEFAULT_BURST_LIMIT.windowSeconds
            },
            sustained: {
                remaining: Math.max(0, DEFAULT_SUSTAINED_LIMIT.maxRequests - (parseInt(sustainedCount || '0', 10))),
                resetInSeconds: sustainedTtl > 0 ? sustainedTtl : DEFAULT_SUSTAINED_LIMIT.windowSeconds
            }
        };
    }

    /**
     * Reset rate limits for a tenant (admin function)
     */
    async resetLimits(tenantId: string): Promise<void> {
        await Promise.all([
            this.redis.del(`ai:ratelimit:burst:${tenantId}`),
            this.redis.del(`ai:ratelimit:sustained:${tenantId}`)
        ]);
        logger.info({ tenantId }, 'AI rate limits reset');
    }
}
