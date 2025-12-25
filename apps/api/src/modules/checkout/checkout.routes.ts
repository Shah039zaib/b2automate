/**
 * Checkout Routes
 * 
 * Public endpoints for Stripe checkout flow
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { StripeService } from '../../services/stripe.service';
import { SubscriptionPlanService } from '../../services/subscription-plan.service';
import { logger } from '@b2automate/logger';

const stripeService = new StripeService(prisma);
const planService = new SubscriptionPlanService(prisma);

const createCheckoutSchema = z.object({
    planId: z.string().uuid(),
    tenantId: z.string().uuid(),
    email: z.string().email(),
    couponId: z.string().optional() // Stripe coupon ID for auto-apply
});

export async function checkoutRoutes(app: FastifyInstance) {
    /**
     * GET /checkout/plans - List active plans for public pricing page
     */
    app.get('/plans', async (request: FastifyRequest, reply: FastifyReply) => {
        const plans = await planService.listActivePlans();
        return plans.map(plan => ({
            id: plan.id,
            name: plan.name,
            description: plan.description,
            priceAmount: plan.priceAmount,
            priceCurrency: plan.priceCurrency,
            priceInterval: plan.priceInterval,
            aiPlan: plan.aiPlan,
            aiTier: plan.aiTier,
            aiDailyLimit: plan.aiDailyLimit,
            aiMonthlyLimit: plan.aiMonthlyLimit
        }));
    });

    /**
     * POST /checkout/session - Create Stripe checkout session
     */
    app.post('/session', {
        schema: {
            body: createCheckoutSchema
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            if (!stripeService.isConfigured()) {
                return reply.status(503).send({ error: 'Payment system is not available' });
            }

            const { planId, tenantId, email, couponId } = request.body as z.infer<typeof createCheckoutSchema>;

            // Verify tenant exists
            const tenant = await prisma.tenant.findUnique({
                where: { id: tenantId }
            });

            if (!tenant) {
                return reply.status(404).send({ error: 'Tenant not found' });
            }

            // Create checkout session
            const baseUrl = process.env.WEB_APP_URL || 'http://localhost:5173';
            const result = await stripeService.createCheckoutSession({
                planId,
                tenantId,
                tenantEmail: email,
                successUrl: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
                cancelUrl: `${baseUrl}/pricing`,
                couponId // Auto-apply coupon if provided
            });

            return { url: result.url };
        } catch (error: any) {
            logger.error({ error: error.message }, 'Checkout session creation failed');
            return reply.status(400).send({ error: error.message });
        }
    });

    /**
     * POST /checkout/portal - Create Stripe Customer Portal session
     * Requires authentication
     */
    app.post('/portal', {
        preHandler: [app.authenticate]
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            if (!stripeService.isConfigured()) {
                return reply.status(503).send({ error: 'Payment system is not available' });
            }

            const user = (request as any).user;
            const tenantId = user.tenantId;

            const baseUrl = process.env.WEB_APP_URL || 'http://localhost:5173';
            const result = await stripeService.createPortalSession(
                tenantId,
                `${baseUrl}/settings`
            );

            return { url: result.url };
        } catch (error: any) {
            logger.error({ error: error.message }, 'Portal session creation failed');
            return reply.status(400).send({ error: error.message });
        }
    });
}
