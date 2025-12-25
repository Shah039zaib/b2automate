/**
 * Manual Payment Service
 * 
 * Handles EasyPaisa, JazzCash, and Bank Transfer payments
 * Super Admin approves/rejects manually
 */

import { PrismaClient, ManualPaymentMethod, ManualPaymentStatus } from '@b2automate/database';
import { logger } from '@b2automate/logger';

export interface SubmitManualPaymentInput {
    tenantId: string;
    planId: string;
    method: ManualPaymentMethod;
    senderName: string;
    senderNumber?: string;
    reference?: string;
    screenshotUrl: string;
    couponCode?: string;
}

export interface ReviewPaymentInput {
    paymentId: string;
    reviewerId: string;
    note?: string;
}

export class ManualPaymentService {
    constructor(private prisma: PrismaClient) { }

    /**
     * Submit a new manual payment request
     */
    async submitPayment(input: SubmitManualPaymentInput, actorUserId: string): Promise<any> {
        // Get the plan
        const plan = await this.prisma.subscriptionPlan.findUnique({
            where: { id: input.planId }
        });

        if (!plan) {
            throw new Error('Plan not found');
        }

        if (!plan.isActive) {
            throw new Error('Plan is not available');
        }

        // Check if tenant already has active subscription
        const existingSubscription = await this.prisma.subscription.findUnique({
            where: { tenantId: input.tenantId }
        });

        if (existingSubscription && ['ACTIVE', 'TRIALING'].includes(existingSubscription.status)) {
            throw new Error('Tenant already has an active subscription');
        }

        // Check for pending manual payment
        const pendingPayment = await this.prisma.manualPayment.findFirst({
            where: {
                tenantId: input.tenantId,
                status: 'PENDING'
            }
        });

        if (pendingPayment) {
            throw new Error('You already have a pending payment request');
        }

        // Calculate price with coupon
        let originalPrice = plan.priceAmount;
        let finalPrice = originalPrice;
        let appliedCoupon: string | null = null;

        if (input.couponCode) {
            // Get active coupon from growth settings
            const growth = await this.prisma.growthSettings.findFirst();
            if (growth?.couponEnabled &&
                growth.couponCode === input.couponCode &&
                (!growth.couponExpiresAt || new Date(growth.couponExpiresAt) >= new Date())) {

                appliedCoupon = input.couponCode;

                if (growth.couponType === 'PERCENTAGE' && growth.couponValue) {
                    finalPrice = Math.round(originalPrice * (1 - growth.couponValue / 100));
                } else if (growth.couponType === 'FIXED' && growth.couponValue) {
                    finalPrice = Math.max(0, originalPrice - growth.couponValue);
                }
            }
        }

        // Create payment record
        const payment = await this.prisma.manualPayment.create({
            data: {
                tenantId: input.tenantId,
                planId: input.planId,
                method: input.method,
                senderName: input.senderName,
                senderNumber: input.senderNumber,
                reference: input.reference,
                screenshotUrl: input.screenshotUrl,
                couponCode: appliedCoupon,
                originalPrice,
                finalPrice,
                status: 'PENDING'
            },
            include: {
                plan: true,
                tenant: true
            }
        });

        logger.info({
            paymentId: payment.id,
            tenantId: input.tenantId,
            method: input.method,
            amount: finalPrice
        }, 'Manual payment submitted');

        return payment;
    }

    /**
     * List manual payments (Super Admin)
     */
    async listPayments(options?: {
        status?: ManualPaymentStatus;
        limit?: number;
        offset?: number;
    }): Promise<{ payments: any[]; total: number }> {
        const where = options?.status ? { status: options.status } : {};

        const [payments, total] = await Promise.all([
            this.prisma.manualPayment.findMany({
                where,
                include: {
                    tenant: {
                        select: { id: true, name: true }
                    },
                    plan: {
                        select: { id: true, name: true, priceAmount: true }
                    }
                },
                orderBy: { createdAt: 'desc' },
                take: options?.limit || 50,
                skip: options?.offset || 0
            }),
            this.prisma.manualPayment.count({ where })
        ]);

        return { payments, total };
    }

    /**
     * Get single payment details
     */
    async getPayment(paymentId: string): Promise<any> {
        const payment = await this.prisma.manualPayment.findUnique({
            where: { id: paymentId },
            include: {
                tenant: true,
                plan: true
            }
        });

        if (!payment) {
            throw new Error('Payment not found');
        }

        return payment;
    }

    /**
     * Approve manual payment and create subscription
     */
    async approvePayment(input: ReviewPaymentInput): Promise<any> {
        const payment = await this.getPayment(input.paymentId);

        if (payment.status !== 'PENDING') {
            throw new Error(`Payment is already ${payment.status.toLowerCase()}`);
        }

        // Use transaction for atomicity
        const result = await this.prisma.$transaction(async (tx) => {
            // Update payment status
            const updatedPayment = await tx.manualPayment.update({
                where: { id: input.paymentId },
                data: {
                    status: 'APPROVED',
                    reviewedBy: input.reviewerId,
                    reviewerNote: input.note,
                    reviewedAt: new Date()
                }
            });

            // Delete any existing subscription (shouldn't exist, but safety)
            await tx.subscription.deleteMany({
                where: { tenantId: payment.tenantId }
            });

            // Create subscription record (manual = no Stripe IDs)
            const subscription = await tx.subscription.create({
                data: {
                    tenantId: payment.tenantId,
                    planId: payment.planId,
                    stripeCustomerId: 'manual_payment',
                    stripeSubscriptionId: `manual_${payment.id}`,
                    status: 'ACTIVE',
                    currentPeriodStart: new Date(),
                    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 days
                    cancelAtPeriodEnd: false
                }
            });

            // Apply AI tier from plan
            await tx.tenant.update({
                where: { id: payment.tenantId },
                data: {
                    aiPlan: payment.plan.aiPlan,
                    aiTier: payment.plan.aiTier,
                    aiDailyLimit: payment.plan.aiDailyLimit,
                    aiMonthlyLimit: payment.plan.aiMonthlyLimit,
                    aiDailyUsage: 0,
                    aiMonthlyUsage: 0,
                    aiUsageResetAt: new Date()
                }
            });

            return { payment: updatedPayment, subscription };
        });

        logger.info({
            paymentId: input.paymentId,
            tenantId: payment.tenantId,
            reviewerId: input.reviewerId
        }, 'Manual payment approved');

        return result;
    }

    /**
     * Reject manual payment
     */
    async rejectPayment(input: ReviewPaymentInput): Promise<any> {
        const payment = await this.getPayment(input.paymentId);

        if (payment.status !== 'PENDING') {
            throw new Error(`Payment is already ${payment.status.toLowerCase()}`);
        }

        const updatedPayment = await this.prisma.manualPayment.update({
            where: { id: input.paymentId },
            data: {
                status: 'REJECTED',
                reviewedBy: input.reviewerId,
                reviewerNote: input.note,
                reviewedAt: new Date()
            }
        });

        logger.info({
            paymentId: input.paymentId,
            tenantId: payment.tenantId,
            reviewerId: input.reviewerId,
            note: input.note
        }, 'Manual payment rejected');

        return updatedPayment;
    }
}
