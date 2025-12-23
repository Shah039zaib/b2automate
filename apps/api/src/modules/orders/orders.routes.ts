import { FastifyInstance } from 'fastify';
import { PrismaClient, OrderStatus } from '@b2automate/database';
import { OrdersService } from './orders.service';
import { requireTenantId } from '../../middleware/tenant-context';

export async function ordersRoutes(app: FastifyInstance) {
    const prisma = new PrismaClient();
    const service = new OrdersService(prisma);

    app.addHook('preHandler', requireTenantId);

    app.get('/', async (req, reply) => {
        const { status } = req.query as any;
        const items = await service.listOrders(req.tenantId, status as OrderStatus);
        return reply.send(items);
    });

    app.post('/:id/approve', async (req, reply) => {
        const { id } = req.params as any;
        // Get User ID from JWT (not implemented in mock auth yet, assuming req.user.id exists or we mock it)
        // Phase 1 auth service returned payload with id.
        const userId = (req.user as any)?.id;
        const updated = await service.approveOrder(req.tenantId, id, userId);
        return reply.send(updated);
    });

    app.post('/:id/reject', async (req, reply) => {
        const { id } = req.params as any;
        const userId = (req.user as any)?.id;
        const updated = await service.rejectOrder(req.tenantId, id, userId);
        return reply.send(updated);
    });
}
