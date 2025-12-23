import { FastifyInstance } from 'fastify';
import { WhatsAppService } from './whatsapp.service';
import Redis from 'ioredis';
import { requireTenantId } from '../../middleware/tenant-context';

export async function whatsappRoutes(app: FastifyInstance) {
    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    const service = new WhatsAppService(redis);

    app.addHook('preHandler', requireTenantId);

    app.post('/session/start', async (req, reply) => {
        const result = await service.startSession(req.tenantId);
        return reply.send(result);
    });

    app.post('/session/stop', async (req, reply) => {
        const result = await service.stopSession(req.tenantId);
        return reply.send(result);
    });

    app.get('/session/status', async (req, reply) => {
        const result = await service.getStatus(req.tenantId);
        return reply.send(result);
    });
}
