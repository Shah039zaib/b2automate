import { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';

export async function rateLimitConfig(app: FastifyInstance) {
    await app.register(rateLimit, {
        max: 100, // 100 requests
        timeWindow: '1 minute',
        keyGenerator: (req) => {
            // Rate limit by Tenant ID if present, else IP
            return (req as any).tenantId || req.ip;
        }
    });
}
