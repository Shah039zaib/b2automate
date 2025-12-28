/**
 * Manual Payment Routes
 * 
 * POST /checkout/manual - Submit manual payment (authenticated user)
 * GET /admin/manual-payments - List all payments (Super Admin)
 * PATCH /admin/manual-payments/:id/approve - Approve payment
 * PATCH /admin/manual-payments/:id/reject - Reject payment
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { ManualPaymentService } from '../../services/manual-payment.service';
import { AuditLogger } from '../../services/audit-logger';
import { requireSuperAdmin } from '../../middleware/rbac';
import { logger } from '@b2automate/logger';

const manualPaymentService = new ManualPaymentService(prisma);
const auditLogger = new AuditLogger(prisma);

// Type definitions
interface AuthenticatedUser {
    id: string;
    tenantId: string;
    role: string;
}

interface PaymentListQuery {
    status?: string;
    limit?: string;
    offset?: string;
}

interface PaymentIdParams {
    id: string;
}

// Validation schemas
const submitPaymentSchema = z.object({
    planId: z.string().uuid(),
    method: z.enum(['EASYPAISA', 'JAZZCASH', 'BANK_TRANSFER']),
    senderName: z.string().min(2).max(100),
    senderNumber: z.string().optional(),
    reference: z.string().optional(),
    screenshotUrl: z.string().url(),
    couponCode: z.string().optional()
});

const reviewPaymentSchema = z.object({
    note: z.string().optional()
});

export async function manualPaymentRoutes(app: FastifyInstance) {
    // ============================================
    // USER ROUTES (Authenticated)
    // ============================================

    /**
     * POST /checkout/manual - Submit manual payment request
     */
    app.post('/checkout/manual', {
        preHandler: [app.authenticate]
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const input = submitPaymentSchema.parse(request.body);
            const user = request.user as AuthenticatedUser;

            const payment = await manualPaymentService.submitPayment({
                tenantId: user.tenantId,
                planId: input.planId,
                method: input.method,
                senderName: input.senderName,
                senderNumber: input.senderNumber,
                reference: input.reference,
                screenshotUrl: input.screenshotUrl,
                couponCode: input.couponCode
            }, user.id);

            // Audit log
            await auditLogger.log({
                tenantId: user.tenantId,
                actorUserId: user.id,
                eventType: 'MANUAL_PAYMENT_SUBMITTED',
                metadata: {
                    paymentId: payment.id,
                    planId: input.planId,
                    method: input.method,
                    amount: payment.finalPrice
                },
                ipAddress: request.ip
            });

            return reply.status(201).send({
                id: payment.id,
                status: payment.status,
                planName: payment.plan.name,
                originalPrice: payment.originalPrice,
                finalPrice: payment.finalPrice,
                couponApplied: payment.couponCode,
                message: 'Payment submitted successfully. Please wait for admin approval.'
            });
        } catch (error: unknown) {
            const err = error as { name?: string; message?: string; errors?: unknown[] };
            if (err.name === 'ZodError') {
                return reply.status(400).send({ error: 'Invalid input', details: err.errors });
            }
            logger.error({ error: err.message }, 'Manual payment submission failed');
            return reply.status(400).send({ error: err.message || 'Submission failed' });
        }
    });

    // ============================================
    // ADMIN ROUTES (Super Admin Only)
    // ============================================

    /**
     * GET /admin/manual-payments - List all manual payments
     */
    app.get('/admin/manual-payments', {
        preHandler: [requireSuperAdmin]
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const query = request.query as PaymentListQuery;
            const status = query.status?.toUpperCase();
            const limit = parseInt(query.limit || '50') || 50;
            const offset = parseInt(query.offset || '0') || 0;

            const result = await manualPaymentService.listPayments({
                status: status as 'PENDING' | 'APPROVED' | 'REJECTED' | undefined,
                limit,
                offset
            });

            return {
                payments: result.payments.map(p => ({
                    id: p.id,
                    tenant: { id: p.tenant.id, name: p.tenant.name },
                    plan: { id: p.plan.id, name: p.plan.name },
                    method: p.method,
                    senderName: p.senderName,
                    senderNumber: p.senderNumber,
                    reference: p.reference,
                    screenshotUrl: p.screenshotUrl,
                    originalPrice: p.originalPrice,
                    finalPrice: p.finalPrice,
                    couponCode: p.couponCode,
                    status: p.status,
                    reviewedBy: p.reviewedBy,
                    reviewerNote: p.reviewerNote,
                    reviewedAt: p.reviewedAt?.toISOString(),
                    createdAt: p.createdAt.toISOString()
                })),
                total: result.total,
                limit,
                offset
            };
        } catch (error: unknown) {
            const err = error as { message?: string };
            logger.error({ error: err.message }, 'Failed to list manual payments');
            return reply.status(500).send({ error: 'Failed to list payments' });
        }
    });

    /**
     * PATCH /admin/manual-payments/:id/approve - Approve payment
     */
    app.patch('/admin/manual-payments/:id/approve', {
        preHandler: [requireSuperAdmin]
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const { id } = request.params as PaymentIdParams;
            const input = reviewPaymentSchema.parse(request.body || {});
            const user = request.user as AuthenticatedUser;

            const result = await manualPaymentService.approvePayment({
                paymentId: id,
                reviewerId: user.id,
                note: input.note
            });

            // Audit log
            await auditLogger.log({
                tenantId: result.payment.tenantId,
                actorUserId: user.id,
                eventType: 'MANUAL_PAYMENT_APPROVED',
                metadata: {
                    paymentId: id,
                    planId: result.payment.planId,
                    amount: result.payment.finalPrice
                },
                ipAddress: request.ip
            });

            return {
                message: 'Payment approved successfully',
                payment: {
                    id: result.payment.id,
                    status: result.payment.status,
                    reviewedAt: result.payment.reviewedAt?.toISOString()
                },
                subscription: {
                    id: result.subscription.id,
                    status: result.subscription.status,
                    periodEnd: result.subscription.currentPeriodEnd.toISOString()
                }
            };
        } catch (error: unknown) {
            const err = error as { message?: string };
            logger.error({ error: err.message }, 'Payment approval failed');
            return reply.status(400).send({ error: err.message || 'Approval failed' });
        }
    });

    /**
     * PATCH /admin/manual-payments/:id/reject - Reject payment
     */
    app.patch('/admin/manual-payments/:id/reject', {
        preHandler: [requireSuperAdmin]
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const { id } = request.params as PaymentIdParams;
            const input = reviewPaymentSchema.parse(request.body || {});
            const user = request.user as AuthenticatedUser;

            const payment = await manualPaymentService.rejectPayment({
                paymentId: id,
                reviewerId: user.id,
                note: input.note
            });

            // Audit log
            await auditLogger.log({
                tenantId: payment.tenantId,
                actorUserId: user.id,
                eventType: 'MANUAL_PAYMENT_REJECTED',
                metadata: {
                    paymentId: id,
                    reason: input.note
                },
                ipAddress: request.ip
            });

            return {
                message: 'Payment rejected',
                payment: {
                    id: payment.id,
                    status: payment.status,
                    reviewedAt: payment.reviewedAt?.toISOString(),
                    note: payment.reviewerNote
                }
            };
        } catch (error: unknown) {
            const err = error as { message?: string };
            logger.error({ error: err.message }, 'Payment rejection failed');
            return reply.status(400).send({ error: err.message || 'Rejection failed' });
        }
    });

    /**
     * GET /admin/manual-payments/:id - Get single payment details
     */
    app.get('/admin/manual-payments/:id', {
        preHandler: [requireSuperAdmin]
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const { id } = request.params as PaymentIdParams;
            const payment = await manualPaymentService.getPayment(id);

            return {
                id: payment.id,
                tenant: { id: payment.tenant.id, name: payment.tenant.name },
                plan: payment.plan,
                method: payment.method,
                senderName: payment.senderName,
                senderNumber: payment.senderNumber,
                reference: payment.reference,
                screenshotUrl: payment.screenshotUrl,
                originalPrice: payment.originalPrice,
                finalPrice: payment.finalPrice,
                couponCode: payment.couponCode,
                status: payment.status,
                reviewedBy: payment.reviewedBy,
                reviewerNote: payment.reviewerNote,
                reviewedAt: payment.reviewedAt?.toISOString(),
                createdAt: payment.createdAt.toISOString(),
                updatedAt: payment.updatedAt.toISOString()
            };
        } catch (error: unknown) {
            const err = error as { message?: string };
            return reply.status(404).send({ error: err.message || 'Payment not found' });
        }
    });
}
