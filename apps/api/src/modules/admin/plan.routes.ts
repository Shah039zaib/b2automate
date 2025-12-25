/**
 * Subscription Plan Routes (Super Admin Only)
 * 
 * CRUD for managing subscription plans
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { SubscriptionPlanService } from '../../services/subscription-plan.service';
import { requireSuperAdmin } from '../../middleware/rbac';
import { logger } from '@b2automate/logger';

const planService = new SubscriptionPlanService(prisma);

const createPlanSchema = z.object({
    name: z.string().min(1).max(100),
    description: z.string().optional(),
    stripeProductId: z.string().min(1),
    stripePriceId: z.string().min(1),
    aiPlan: z.enum(['FREE', 'PAID_BASIC', 'PAID_PRO', 'ENTERPRISE']),
    aiTier: z.enum(['FREE', 'LOW', 'MEDIUM', 'HIGH']),
    aiDailyLimit: z.number().int().min(1),
    aiMonthlyLimit: z.number().int().min(1),
    priceAmount: z.number().int().min(0),
    priceCurrency: z.string().default('usd'),
    priceInterval: z.enum(['month', 'year']).default('month'),
    displayOrder: z.number().int().default(0)
});

const updatePlanSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().optional(),
    aiPlan: z.enum(['FREE', 'PAID_BASIC', 'PAID_PRO', 'ENTERPRISE']).optional(),
    aiTier: z.enum(['FREE', 'LOW', 'MEDIUM', 'HIGH']).optional(),
    aiDailyLimit: z.number().int().min(1).optional(),
    aiMonthlyLimit: z.number().int().min(1).optional(),
    priceAmount: z.number().int().min(0).optional(),
    priceCurrency: z.string().optional(),
    priceInterval: z.enum(['month', 'year']).optional(),
    displayOrder: z.number().int().optional(),
    isActive: z.boolean().optional()
});

export async function planRoutes(app: FastifyInstance) {
    // All routes require Super Admin
    app.addHook('preHandler', app.authenticate);
    app.addHook('preHandler', requireSuperAdmin);

    /**
     * GET /admin/plans - List all plans
     */
    app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
        const plans = await planService.listAllPlans();
        return { plans };
    });

    /**
     * GET /admin/plans/:id - Get single plan
     */
    app.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
        const { id } = request.params as { id: string };
        const plan = await planService.getPlanById(id);

        if (!plan) {
            return reply.status(404).send({ error: 'Plan not found' });
        }

        return plan;
    });

    /**
     * POST /admin/plans - Create new plan
     */
    app.post('/', {
        schema: {
            body: createPlanSchema
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const user = (request as any).user;
            const input = request.body as z.infer<typeof createPlanSchema>;

            const plan = await planService.createPlan(input, user.id);
            return reply.status(201).send(plan);
        } catch (error: any) {
            logger.error({ error: error.message }, 'Plan creation failed');
            return reply.status(400).send({ error: error.message });
        }
    });

    /**
     * PATCH /admin/plans/:id - Update plan
     */
    app.patch('/:id', {
        schema: {
            body: updatePlanSchema
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const { id } = request.params as { id: string };
            const user = (request as any).user;
            const input = request.body as z.infer<typeof updatePlanSchema>;

            const plan = await planService.updatePlan(id, input, user.id);
            return plan;
        } catch (error: any) {
            logger.error({ error: error.message }, 'Plan update failed');
            return reply.status(400).send({ error: error.message });
        }
    });

    /**
     * DELETE /admin/plans/:id - Soft delete plan
     */
    app.delete('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const { id } = request.params as { id: string };
            const user = (request as any).user;

            const plan = await planService.deletePlan(id, user.id);
            return { message: 'Plan deleted', plan };
        } catch (error: any) {
            logger.error({ error: error.message }, 'Plan deletion failed');
            return reply.status(400).send({ error: error.message });
        }
    });
}
