/**
 * Subscription Service
 * 
 * Handles subscription lifecycle:
 * - Creation from webhooks
 * - Status updates
 * - AI tier enforcement
 */

import { PrismaClient, SubscriptionStatus, AiPlan, AiTier } from '@b2automate/database';
import { logger } from '@b2automate/logger';

export interface CreateSubscriptionInput {
    tenantId: string;
    planId: string;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    status: SubscriptionStatus;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
}

export interface UpdateSubscriptionInput {
    status?: SubscriptionStatus;
    planId?: string;
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
    cancelAtPeriodEnd?: boolean;
    canceledAt?: Date | null;
}

export class SubscriptionService {
    constructor(private prisma: PrismaClient) { }

    /**
     * Get subscription by tenant ID
     */
    async getByTenantId(tenantId: string) {
        return this.prisma.subscription.findUnique({
            where: { tenantId },
            include: { plan: true }
        });
    }

    /**
     * Get subscription by Stripe subscription ID
     */
    async getByStripeSubscriptionId(stripeSubscriptionId: string) {
        return this.prisma.subscription.findUnique({
            where: { stripeSubscriptionId },
            include: { plan: true, tenant: true }
        });
    }

    /**
     * Create subscription and apply AI tier
     */
    async createSubscription(input: CreateSubscriptionInput) {
        // Get the plan to apply AI governance
        const plan = await this.prisma.subscriptionPlan.findUnique({
            where: { id: input.planId }
        });

        if (!plan) {
            throw new Error('Subscription plan not found');
        }

        // Create subscription
        const subscription = await this.prisma.subscription.create({
            data: {
                tenantId: input.tenantId,
                planId: input.planId,
                stripeCustomerId: input.stripeCustomerId,
                stripeSubscriptionId: input.stripeSubscriptionId,
                status: input.status,
                currentPeriodStart: input.currentPeriodStart,
                currentPeriodEnd: input.currentPeriodEnd
            }
        });

        // Apply AI governance from plan
        await this.applyAiGovernance(input.tenantId, plan);

        logger.info({
            tenantId: input.tenantId,
            planId: plan.id,
            planName: plan.name
        }, 'Subscription created and AI governance applied');

        return subscription;
    }

    /**
     * Update subscription from webhook
     */
    async updateSubscription(stripeSubscriptionId: string, input: UpdateSubscriptionInput) {
        const subscription = await this.prisma.subscription.update({
            where: { stripeSubscriptionId },
            data: input,
            include: { plan: true }
        });

        // If plan changed, apply new AI governance
        if (input.planId) {
            const newPlan = await this.prisma.subscriptionPlan.findUnique({
                where: { id: input.planId }
            });
            if (newPlan) {
                await this.applyAiGovernance(subscription.tenantId, newPlan);
            }
        }

        // If status changed to CANCELED or UNPAID, downgrade to FREE
        if (input.status === 'CANCELED' || input.status === 'UNPAID') {
            await this.downgradeToFree(subscription.tenantId);
        }

        logger.info({
            subscriptionId: subscription.id,
            status: subscription.status
        }, 'Subscription updated');

        return subscription;
    }

    /**
     * Apply AI governance settings from plan to tenant
     */
    private async applyAiGovernance(
        tenantId: string,
        plan: { aiPlan: AiPlan; aiTier: AiTier; aiDailyLimit: number; aiMonthlyLimit: number }
    ) {
        await this.prisma.tenant.update({
            where: { id: tenantId },
            data: {
                aiPlan: plan.aiPlan,
                aiTier: plan.aiTier,
                aiDailyLimit: plan.aiDailyLimit,
                aiMonthlyLimit: plan.aiMonthlyLimit,
                // Reset usage counters on plan change
                aiDailyUsage: 0,
                aiMonthlyUsage: 0,
                aiUsageResetAt: new Date()
            }
        });

        logger.info({
            tenantId,
            aiPlan: plan.aiPlan,
            aiTier: plan.aiTier
        }, 'AI governance applied to tenant');
    }

    /**
     * Downgrade tenant to FREE plan (on cancellation/unpaid)
     */
    async downgradeToFree(tenantId: string) {
        await this.prisma.tenant.update({
            where: { id: tenantId },
            data: {
                aiPlan: 'FREE',
                aiTier: 'FREE',
                aiDailyLimit: 50,
                aiMonthlyLimit: 1000,
                // Reset usage counters
                aiDailyUsage: 0,
                aiMonthlyUsage: 0,
                aiUsageResetAt: new Date()
            }
        });

        // Audit log
        await this.prisma.auditLog.create({
            data: {
                tenantId,
                eventType: 'SUBSCRIPTION_DOWNGRADED_TO_FREE',
                metadata: { reason: 'Subscription canceled or unpaid' }
            }
        });

        logger.warn({ tenantId }, 'Tenant downgraded to FREE plan');
    }

    /**
     * Delete subscription (on subscription.deleted webhook)
     */
    async deleteSubscription(stripeSubscriptionId: string) {
        const subscription = await this.prisma.subscription.findUnique({
            where: { stripeSubscriptionId }
        });

        if (!subscription) {
            logger.warn({ stripeSubscriptionId }, 'Subscription not found for deletion');
            return null;
        }

        // Downgrade tenant first
        await this.downgradeToFree(subscription.tenantId);

        // Delete subscription record
        await this.prisma.subscription.delete({
            where: { stripeSubscriptionId }
        });

        logger.info({ stripeSubscriptionId }, 'Subscription deleted');
        return subscription;
    }
}
