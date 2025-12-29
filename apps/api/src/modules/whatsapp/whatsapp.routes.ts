import { FastifyInstance } from 'fastify';
import { WhatsAppService } from './whatsapp.service';
import Redis from 'ioredis';
import { requireTenantId } from '../../middleware/tenant-context';
import { z } from 'zod';

export async function whatsappRoutes(app: FastifyInstance) {
    // RESILIENCE: Redis connection with retry strategy for transient failures
    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
        retryStrategy(times) {
            // Exponential backoff: 100ms, 200ms, 400ms, max 3 retries
            if (times > 3) {
                // Stop retrying after 3 attempts
                return null;
            }
            const delay = Math.min(times * 100, 400);
            return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        reconnectOnError(err) {
            // Reconnect on READONLY errors (replica issues)
            const targetError = 'READONLY';
            if (err.message.includes(targetError)) {
                return true;
            }
            return false;
        },
    });

    const service = new WhatsAppService(redis);

    // SECURITY: JWT authentication MUST run before tenant context
    app.addHook('preHandler', app.authenticate);
    app.addHook('preHandler', requireTenantId);

    // SECURITY: Verify tenant is ACTIVE before allowing WhatsApp operations
    app.addHook('preHandler', async (req, reply) => {
        const { prisma } = await import('../../lib/prisma');
        const tenant = await prisma.tenant.findUnique({
            where: { id: req.tenantId },
            select: { status: true, isWhatsappEnabled: true }
        });

        if (!tenant) {
            return reply.status(404).send({ error: 'Tenant not found' });
        }

        if (tenant.status !== 'ACTIVE') {
            return reply.status(403).send({
                error: 'Account suspended',
                message: 'Your account has been suspended. Please contact support.'
            });
        }

        if (!tenant.isWhatsappEnabled) {
            return reply.status(403).send({
                error: 'WhatsApp disabled',
                message: 'WhatsApp functionality has been disabled for your account.'
            });
        }
    });

    app.post('/session/start', async (req, reply) => {
        const result = await service.startSession(req.tenantId);
        return reply.send(result);
    });

    app.post('/session/stop', async (req, reply) => {
        const result = await service.stopSession(req.tenantId);
        return reply.send(result);
    });

    const PairingCodeRequestSchema = z.object({
        phoneNumber: z.string().min(10, 'Phone number must be at least 10 digits').max(20, 'Phone number too long')
    });

    app.post('/session/pairing-code', {
        schema: {
            body: PairingCodeRequestSchema
        }
    }, async (req, reply) => {
        const { phoneNumber } = req.body as z.infer<typeof PairingCodeRequestSchema>;
        try {
            const result = await service.requestPairingCode(req.tenantId, phoneNumber);
            return reply.send(result);
        } catch (error: any) {
            return reply.status(400).send({
                error: error.message || 'Failed to request pairing code'
            });
        }
    });

    app.get('/session/status', async (req, reply) => {
        const result = await service.getStatus(req.tenantId);
        return reply.send(result);
    });
}
