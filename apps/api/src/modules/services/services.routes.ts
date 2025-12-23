import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@b2automate/database';
import { ServicesService } from './services.service';
import { requireTenantId } from '../../middleware/tenant-context';

export async function servicesRoutes(app: FastifyInstance) {
    const prisma = new PrismaClient();
    const service = new ServicesService(prisma);

    app.addHook('preHandler', requireTenantId);

    app.get('/', async (req, reply) => {
        const items = await service.listServices(req.tenantId);
        return reply.send(items);
    });

    app.post('/', async (req, reply) => {
        // TODO: Validate body with Zod
        const body = req.body as any;
        const item = await service.createService(req.tenantId, body);
        return reply.send(item);
    });

    app.patch('/:id', async (req, reply) => {
        const { id } = req.params as any;
        const body = req.body as any;
        const item = await service.updateService(req.tenantId, id, body);
        return reply.send(item);
    });
}
