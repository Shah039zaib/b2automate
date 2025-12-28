import { FastifyInstance } from 'fastify';
import { OrderStatus } from '@b2automate/database';
import { prisma } from '../../lib/prisma';
import { OrdersService } from './orders.service';
import { requireTenantId } from '../../middleware/tenant-context';
import z from 'zod';

// Type definitions for route handlers
interface OrderQueryParams {
    status?: string;
}

interface OrderIdParams {
    id: string;
}

interface CreateOrderBody {
    customerJid: string;
    items: Array<{ serviceId: string; quantity: number }>;
    submitForApproval?: boolean;
}

interface AuthenticatedUser {
    id: string;
    email: string;
    role: string;
    tenantId: string;
}

export async function ordersRoutes(app: FastifyInstance) {
    const service = new OrdersService(prisma);

    // SECURITY: JWT authentication MUST run before tenant context
    app.addHook('preHandler', app.authenticate);
    app.addHook('preHandler', requireTenantId);

    // List all orders
    app.get('/', async (req, reply) => {
        const { status } = req.query as OrderQueryParams;
        const items = await service.listOrders(req.tenantId, status as OrderStatus);
        return reply.send(items);
    });

    // Get single order by ID
    app.get('/:id', async (req, reply) => {
        const { id } = req.params as OrderIdParams;
        try {
            const order = await service.getOrderById(req.tenantId, id);
            return reply.send(order);
        } catch (error: unknown) {
            const err = error as { message?: string };
            return reply.code(404).send({ error: err.message || 'Order not found' });
        }
    });

    // Create manual order
    app.post('/', {
        schema: {
            body: z.object({
                customerJid: z.string().min(1),
                items: z.array(z.object({
                    serviceId: z.string().uuid(),
                    quantity: z.number().int().min(1).default(1)
                })).min(1),
                submitForApproval: z.boolean().optional().default(false)
            })
        }
    }, async (req, reply) => {
        const { customerJid, items, submitForApproval } = req.body as CreateOrderBody;
        const user = req.user as AuthenticatedUser | undefined;
        const userId = user?.id;

        try {
            // Create draft order
            let order = await service.createDraftOrder(req.tenantId, customerJid, items);

            // Optionally submit for approval immediately
            if (submitForApproval) {
                order = await service.submitForApproval(req.tenantId, order.id);
            }

            return reply.code(201).send(order);
        } catch (error: unknown) {
            const err = error as { message?: string };
            return reply.code(400).send({ error: err.message || 'Failed to create order' });
        }
    });

    // Approve order
    app.post('/:id/approve', async (req, reply) => {
        const { id } = req.params as OrderIdParams;
        const user = req.user as AuthenticatedUser;
        try {
            const updated = await service.approveOrder(req.tenantId, id, user.id);
            return reply.send(updated);
        } catch (error: unknown) {
            const err = error as { message?: string };
            return reply.code(400).send({ error: err.message || 'Failed to approve order' });
        }
    });

    // Reject order
    app.post('/:id/reject', async (req, reply) => {
        const { id } = req.params as OrderIdParams;
        const user = req.user as AuthenticatedUser;
        try {
            const updated = await service.rejectOrder(req.tenantId, id, user.id);
            return reply.send(updated);
        } catch (error: unknown) {
            const err = error as { message?: string };
            return reply.code(400).send({ error: err.message || 'Failed to reject order' });
        }
    });

    // Submit draft for approval
    app.post('/:id/submit', async (req, reply) => {
        const { id } = req.params as OrderIdParams;
        try {
            const updated = await service.submitForApproval(req.tenantId, id);
            return reply.send(updated);
        } catch (error: unknown) {
            const err = error as { message?: string };
            return reply.code(400).send({ error: err.message || 'Failed to submit order' });
        }
    });
}
