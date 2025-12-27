import { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma';
import { ServicesService } from './services.service';
import { requireTenantId } from '../../middleware/tenant-context';

export async function servicesRoutes(app: FastifyInstance) {
    const service = new ServicesService(prisma);

    // SECURITY: JWT authentication MUST run before tenant context
    app.addHook('preHandler', app.authenticate);
    app.addHook('preHandler', requireTenantId);

    app.get('/', async (req, reply) => {
        const items = await service.listServices(req.tenantId);
        return reply.send(items);
    });

    app.post('/', async (req, reply) => {
        const body = req.body as any;
        const userId = (req.user as any)?.id || null;
        const item = await service.createService(req.tenantId, userId, body);
        return reply.send(item);
    });

    app.patch('/:id', async (req, reply) => {
        const { id } = req.params as any;
        const body = req.body as any;
        const userId = (req.user as any)?.id || null;
        const item = await service.updateService(req.tenantId, userId, id, body);
        return reply.send(item);
    });

    app.delete('/:id', async (req, reply) => {
        const { id } = req.params as any;
        const userId = (req.user as any)?.id || null;
        const result = await service.deleteService(req.tenantId, userId, id);
        return reply.send(result);
    });

    /**
     * POST /services/import
     * Bulk import services from CSV data
     * Body: { services: Array<{ name, description, price, currency? }> }
     */
    app.post('/import', async (req, reply) => {
        const body = req.body as { services: Array<{ name: string; description: string; price: number; currency?: string }> };
        const userId = (req.user as any)?.id || null;

        if (!body.services || !Array.isArray(body.services) || body.services.length === 0) {
            return reply.code(400).send({ error: 'No services provided. Expected { services: [...] }' });
        }

        if (body.services.length > 100) {
            return reply.code(400).send({ error: 'Maximum 100 services per import' });
        }

        const result = await service.bulkCreateServices(req.tenantId, userId, body.services);
        return reply.send(result);
    });
}
