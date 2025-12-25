/**
 * Stripe Webhook Handler
 * 
 * Processes Stripe webhook events with:
 * - Signature verification
 * - Idempotency (no duplicate processing)
 * - AI tier auto-enforcement
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../lib/prisma';
import { StripeService } from '../../services/stripe.service';
import { SubscriptionService } from '../../services/subscription.service';
import { SubscriptionPlanService } from '../../services/subscription-plan.service';
import { logger } from '@b2automate/logger';
import Stripe from 'stripe';

const stripeService = new StripeService(prisma);
const subscriptionService = new SubscriptionService(prisma);
const subscriptionPlanService = new SubscriptionPlanService(prisma);

/**
 * Check if event was already processed (idempotency)
 */
async function isEventProcessed(eventId: string): Promise<boolean> {
    const existing = await prisma.stripeWebhookEvent.findUnique({
        where: { id: eventId }
    });
    return existing !== null;
}

/**
 * Mark event as processed
 */
async function markEventProcessed(eventId: string, eventType: string): Promise<void> {
    await prisma.stripeWebhookEvent.create({
        data: {
            id: eventId,
            type: eventType
        }
    });
}

/**
 * Handle checkout.session.completed
 * - Creates subscription in database
 * - Applies AI governance to tenant
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const tenantId = session.metadata?.tenantId;
    const planId = session.metadata?.planId;
    const customerId = session.customer as string;
    const subscriptionId = session.subscription as string;

    if (!tenantId || !planId || !subscriptionId) {
        logger.error({ session: session.id }, 'Missing metadata in checkout session');
        return;
    }

    // Get subscription details from Stripe
    const stripeSubscription = await stripeService.getSubscription(subscriptionId);

    // Create subscription in our database
    await subscriptionService.createSubscription({
        tenantId,
        planId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        status: mapStripeStatus(stripeSubscription.status),
        currentPeriodStart: new Date((stripeSubscription as any).current_period_start * 1000),
        currentPeriodEnd: new Date((stripeSubscription as any).current_period_end * 1000)
    });

    // Audit log
    await prisma.auditLog.create({
        data: {
            tenantId,
            eventType: 'SUBSCRIPTION_ACTIVATED',
            metadata: {
                planId,
                stripeSubscriptionId: subscriptionId,
                checkoutSessionId: session.id
            }
        }
    });

    logger.info({ tenantId, planId, subscriptionId }, 'Checkout completed, subscription created');
}

/**
 * Handle customer.subscription.updated
 * - Updates subscription status
 * - Handles plan changes
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    const tenantId = subscription.metadata?.tenantId;
    const planId = subscription.metadata?.planId;

    // Check if subscription exists
    const existingSubscription = await subscriptionService.getByStripeSubscriptionId(subscription.id);

    if (!existingSubscription) {
        logger.warn({ subscriptionId: subscription.id }, 'Subscription not found for update');
        return;
    }

    // Get plan from price ID if plan changed
    let newPlanId = existingSubscription.planId;
    const priceId = subscription.items.data[0]?.price?.id;
    if (priceId) {
        const plan = await subscriptionPlanService.getPlanByStripePriceId(priceId);
        if (plan) {
            newPlanId = plan.id;
        }
    }

    // Update subscription
    await subscriptionService.updateSubscription(subscription.id, {
        status: mapStripeStatus(subscription.status),
        planId: newPlanId,
        currentPeriodStart: new Date((subscription as any).current_period_start * 1000),
        currentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null
    });

    logger.info({
        subscriptionId: subscription.id,
        status: subscription.status,
        planId: newPlanId
    }, 'Subscription updated');
}

/**
 * Handle customer.subscription.deleted
 * - Downgrades tenant to FREE
 * - Deletes subscription record
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    await subscriptionService.deleteSubscription(subscription.id);
    logger.info({ subscriptionId: subscription.id }, 'Subscription deleted');
}

/**
 * Handle invoice.payment_failed
 * - Updates subscription to PAST_DUE
 * - Logs warning
 */
async function handlePaymentFailed(invoice: Stripe.Invoice) {
    const subscriptionId = (invoice as any).subscription as string;
    if (!subscriptionId) return;

    const existingSubscription = await subscriptionService.getByStripeSubscriptionId(subscriptionId);
    if (!existingSubscription) return;

    await subscriptionService.updateSubscription(subscriptionId, {
        status: 'PAST_DUE'
    });

    // Audit log
    await prisma.auditLog.create({
        data: {
            tenantId: existingSubscription.tenantId,
            eventType: 'PAYMENT_FAILED',
            metadata: {
                invoiceId: invoice.id,
                subscriptionId
            }
        }
    });

    logger.warn({
        subscriptionId,
        tenantId: existingSubscription.tenantId,
        invoiceId: invoice.id
    }, 'Payment failed');
}

/**
 * Handle invoice.payment_succeeded
 * - Updates subscription to ACTIVE
 * - Logs success
 */
async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
    const subscriptionId = (invoice as any).subscription as string;
    if (!subscriptionId) return;

    const existingSubscription = await subscriptionService.getByStripeSubscriptionId(subscriptionId);
    if (!existingSubscription) return;

    // Only update if was PAST_DUE
    if (existingSubscription.status === 'PAST_DUE') {
        await subscriptionService.updateSubscription(subscriptionId, {
            status: 'ACTIVE'
        });

        logger.info({
            subscriptionId,
            tenantId: existingSubscription.tenantId
        }, 'Payment succeeded, subscription reactivated');
    }
}

/**
 * Map Stripe subscription status to our enum
 */
function mapStripeStatus(stripeStatus: Stripe.Subscription.Status): 'INCOMPLETE' | 'INCOMPLETE_EXPIRED' | 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'UNPAID' {
    const statusMap: Record<string, 'INCOMPLETE' | 'INCOMPLETE_EXPIRED' | 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'UNPAID'> = {
        incomplete: 'INCOMPLETE',
        incomplete_expired: 'INCOMPLETE_EXPIRED',
        trialing: 'TRIALING',
        active: 'ACTIVE',
        past_due: 'PAST_DUE',
        canceled: 'CANCELED',
        unpaid: 'UNPAID',
        paused: 'ACTIVE' // Treat paused as active for AI access
    };
    return statusMap[stripeStatus] || 'INCOMPLETE';
}

/**
 * Stripe Webhook Routes
 */
export async function stripeWebhookRoutes(app: FastifyInstance) {
    // IMPORTANT: Disable automatic body parsing for webhooks
    // Stripe requires raw body for signature verification
    app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
        done(null, body);
    });

    app.post('/stripe', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            // Check if Stripe is configured
            if (!stripeService.isConfigured()) {
                logger.error('Stripe webhook received but Stripe is not configured');
                return reply.status(500).send({ error: 'Stripe not configured' });
            }

            // Get signature header
            const signature = request.headers['stripe-signature'] as string;
            if (!signature) {
                logger.warn('Webhook missing signature');
                return reply.status(400).send({ error: 'Missing signature' });
            }

            // Verify signature and construct event
            let event: Stripe.Event;
            try {
                event = stripeService.verifyWebhookSignature(
                    request.body as Buffer,
                    signature
                );
            } catch (err: any) {
                logger.warn({ error: err.message }, 'Webhook signature verification failed');
                return reply.status(400).send({ error: 'Signature verification failed' });
            }

            // Idempotency check
            if (await isEventProcessed(event.id)) {
                logger.info({ eventId: event.id }, 'Webhook event already processed, skipping');
                return reply.status(200).send({ received: true, duplicate: true });
            }

            // Process event
            logger.info({ eventId: event.id, eventType: event.type }, 'Processing webhook event');

            switch (event.type) {
                case 'checkout.session.completed':
                    await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
                    break;

                case 'customer.subscription.created':
                case 'customer.subscription.updated':
                    await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
                    break;

                case 'customer.subscription.deleted':
                    await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
                    break;

                case 'invoice.payment_failed':
                    await handlePaymentFailed(event.data.object as Stripe.Invoice);
                    break;

                case 'invoice.payment_succeeded':
                    await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
                    break;

                default:
                    logger.debug({ eventType: event.type }, 'Unhandled webhook event type');
            }

            // Mark event as processed
            await markEventProcessed(event.id, event.type);

            return reply.status(200).send({ received: true });
        } catch (error: any) {
            logger.error({ error: error.message }, 'Webhook processing error');
            return reply.status(500).send({ error: 'Webhook processing failed' });
        }
    });
}
