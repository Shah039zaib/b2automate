/**
 * Subscription Plan Service
 * 
 * Super Admin managed subscription plans that map to:
 * - Stripe products/prices
 * - AI governance (plan, tier, limits)
 */

import { PrismaClient, AiPlan, AiTier } from '@b2automate/database';
import { logger } from '@b2automate/logger';

export interface CreatePlanInput {
    name: string;
    description?: string;
    stripeProductId: string;
    stripePriceId: string;
    aiPlan: AiPlan;
    aiTier: AiTier;
    aiDailyLimit: number;
    aiMonthlyLimit: number;
    priceAmount: number;
    priceCurrency?: string;
    priceInterval?: string;
    displayOrder?: number;
}

export interface UpdatePlanInput {
    name?: string;
    description?: string;
    aiPlan?: AiPlan;
    aiTier?: AiTier;
    aiDailyLimit?: number;
    aiMonthlyLimit?: number;
    priceAmount?: number;
    priceCurrency?: string;
    priceInterval?: string;
    displayOrder?: number;
    isActive?: boolean;
}

export class SubscriptionPlanService {
    constructor(private prisma: PrismaClient) { }

    /**
     * List all active plans (for pricing page)
     */
    async listActivePlans() {
        return this.prisma.subscriptionPlan.findMany({
            where: { isActive: true },
            orderBy: { displayOrder: 'asc' }
        });
    }

    /**
     * List all plans (for Super Admin)
     */
    async listAllPlans() {
        return this.prisma.subscriptionPlan.findMany({
            orderBy: { displayOrder: 'asc' }
        });
    }

    /**
     * Get plan by ID
     */
    async getPlanById(id: string) {
        return this.prisma.subscriptionPlan.findUnique({
            where: { id }
        });
    }

    /**
     * Get plan by Stripe price ID
     */
    async getPlanByStripePriceId(stripePriceId: string) {
        return this.prisma.subscriptionPlan.findUnique({
            where: { stripePriceId }
        });
    }

    /**
     * Create a new subscription plan (Super Admin only)
     */
    async createPlan(input: CreatePlanInput, actorUserId: string) {
        const plan = await this.prisma.subscriptionPlan.create({
            data: {
                name: input.name,
                description: input.description,
                stripeProductId: input.stripeProductId,
                stripePriceId: input.stripePriceId,
                aiPlan: input.aiPlan,
                aiTier: input.aiTier,
                aiDailyLimit: input.aiDailyLimit,
                aiMonthlyLimit: input.aiMonthlyLimit,
                priceAmount: input.priceAmount,
                priceCurrency: input.priceCurrency || 'usd',
                priceInterval: input.priceInterval || 'month',
                displayOrder: input.displayOrder || 0
            }
        });

        // Audit log
        await this.prisma.auditLog.create({
            data: {
                tenantId: 'system',
                actorUserId,
                eventType: 'SUBSCRIPTION_PLAN_CREATED',
                metadata: {
                    planId: plan.id,
                    planName: plan.name,
                    stripePriceId: plan.stripePriceId
                }
            }
        });

        logger.info({ planId: plan.id, planName: plan.name }, 'Subscription plan created');
        return plan;
    }

    /**
     * Update a subscription plan (Super Admin only)
     */
    async updatePlan(id: string, input: UpdatePlanInput, actorUserId: string) {
        const oldPlan = await this.prisma.subscriptionPlan.findUnique({
            where: { id }
        });

        if (!oldPlan) {
            throw new Error('Plan not found');
        }

        const plan = await this.prisma.subscriptionPlan.update({
            where: { id },
            data: input
        });

        // Audit log
        await this.prisma.auditLog.create({
            data: {
                tenantId: 'system',
                actorUserId,
                eventType: 'SUBSCRIPTION_PLAN_UPDATED',
                metadata: {
                    planId: plan.id,
                    planName: plan.name,
                    changes: JSON.parse(JSON.stringify(input))
                }
            }
        });

        logger.info({ planId: plan.id }, 'Subscription plan updated');
        return plan;
    }

    /**
     * Soft delete a plan (Super Admin only)
     */
    async deletePlan(id: string, actorUserId: string) {
        // Check if plan has active subscriptions
        const activeSubscriptions = await this.prisma.subscription.count({
            where: {
                planId: id,
                status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] }
            }
        });

        if (activeSubscriptions > 0) {
            throw new Error(`Cannot delete plan with ${activeSubscriptions} active subscriptions`);
        }

        const plan = await this.prisma.subscriptionPlan.update({
            where: { id },
            data: { isActive: false }
        });

        // Audit log
        await this.prisma.auditLog.create({
            data: {
                tenantId: 'system',
                actorUserId,
                eventType: 'SUBSCRIPTION_PLAN_DELETED',
                metadata: {
                    planId: plan.id,
                    planName: plan.name
                }
            }
        });

        logger.info({ planId: plan.id }, 'Subscription plan soft deleted');
        return plan;
    }
}
