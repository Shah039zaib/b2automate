/**
 * Stripe Service
 * 
 * Handles Stripe API interactions:
 * - Checkout session creation
 * - Customer management
 * - Webhook signature verification
 */

import Stripe from 'stripe';
import { PrismaClient } from '@b2automate/database';
import { logger } from '@b2automate/logger';

// Initialize Stripe with API key
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
    logger.warn('STRIPE_SECRET_KEY not configured - Stripe features will be disabled');
}

const stripe = stripeSecretKey
    ? new Stripe(stripeSecretKey)
    : null;

export interface CreateCheckoutSessionInput {
    planId: string;
    tenantId: string;
    tenantEmail: string;
    successUrl: string;
    cancelUrl: string;
    couponId?: string; // Stripe coupon ID for auto-apply discount
}

export class StripeService {
    constructor(private prisma: PrismaClient) { }

    /**
     * Check if Stripe is configured
     */
    isConfigured(): boolean {
        return stripe !== null;
    }

    /**
     * Create Stripe Checkout Session for subscription
     */
    async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<{ url: string }> {
        if (!stripe) {
            throw new Error('Stripe is not configured');
        }

        // Get the plan
        const plan = await this.prisma.subscriptionPlan.findUnique({
            where: { id: input.planId }
        });

        if (!plan) {
            throw new Error('Plan not found');
        }

        if (!plan.isActive) {
            throw new Error('Plan is not active');
        }

        // Check if tenant already has an active subscription
        const existingSubscription = await this.prisma.subscription.findUnique({
            where: { tenantId: input.tenantId }
        });

        if (existingSubscription && ['ACTIVE', 'TRIALING'].includes(existingSubscription.status)) {
            throw new Error('Tenant already has an active subscription');
        }

        // Get or create Stripe customer
        let stripeCustomerId = await this.getOrCreateCustomer(input.tenantId, input.tenantEmail);

        // Create checkout session
        const sessionParams: Stripe.Checkout.SessionCreateParams = {
            mode: 'subscription',
            customer: stripeCustomerId,
            line_items: [
                {
                    price: plan.stripePriceId,
                    quantity: 1
                }
            ],
            success_url: input.successUrl,
            cancel_url: input.cancelUrl,
            metadata: {
                tenantId: input.tenantId,
                planId: input.planId
            },
            subscription_data: {
                metadata: {
                    tenantId: input.tenantId,
                    planId: input.planId
                }
            }
        };

        // Apply coupon if provided
        if (input.couponId) {
            sessionParams.discounts = [{ coupon: input.couponId }];
            logger.info({ couponId: input.couponId }, 'Applying coupon to checkout');
        }

        const session = await stripe.checkout.sessions.create(sessionParams);

        logger.info({
            tenantId: input.tenantId,
            planId: input.planId,
            sessionId: session.id
        }, 'Stripe checkout session created');

        if (!session.url) {
            throw new Error('Failed to create checkout session URL');
        }

        return { url: session.url };
    }

    /**
     * Get or create Stripe customer for tenant
     */
    private async getOrCreateCustomer(tenantId: string, email: string): Promise<string> {
        if (!stripe) {
            throw new Error('Stripe is not configured');
        }

        // Check if tenant already has a Stripe customer ID
        const tenant = await this.prisma.tenant.findUnique({
            where: { id: tenantId }
        });

        if (tenant?.stripeCustomerId) {
            return tenant.stripeCustomerId;
        }

        // Create new Stripe customer
        const customer = await stripe.customers.create({
            email: email,
            metadata: {
                tenantId: tenantId
            }
        });

        // Save customer ID to tenant
        await this.prisma.tenant.update({
            where: { id: tenantId },
            data: { stripeCustomerId: customer.id }
        });

        logger.info({ tenantId, customerId: customer.id }, 'Stripe customer created');
        return customer.id;
    }

    /**
     * Verify webhook signature and construct event
     */
    verifyWebhookSignature(payload: string | Buffer, signature: string): Stripe.Event {
        if (!stripe) {
            throw new Error('Stripe is not configured');
        }

        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!webhookSecret) {
            throw new Error('STRIPE_WEBHOOK_SECRET not configured');
        }

        return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    }

    /**
     * Retrieve Stripe subscription details
     */
    async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
        if (!stripe) {
            throw new Error('Stripe is not configured');
        }

        return stripe.subscriptions.retrieve(subscriptionId);
    }

    /**
     * Create Customer Portal session for billing management
     */
    async createPortalSession(tenantId: string, returnUrl: string): Promise<{ url: string }> {
        if (!stripe) {
            throw new Error('Stripe is not configured');
        }

        const tenant = await this.prisma.tenant.findUnique({
            where: { id: tenantId }
        });

        if (!tenant?.stripeCustomerId) {
            throw new Error('Tenant does not have a Stripe customer ID');
        }

        const session = await stripe.billingPortal.sessions.create({
            customer: tenant.stripeCustomerId,
            return_url: returnUrl
        });

        return { url: session.url };
    }
}
