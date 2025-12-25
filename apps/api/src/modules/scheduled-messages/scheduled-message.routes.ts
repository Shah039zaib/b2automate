/**
 * Scheduled Messages Routes
 * 
 * PHASE 6B: Create, view, and cancel scheduled WhatsApp messages.
 * Messages are stored in DB and processed by a polling worker.
 * 
 * ACCESS CONTROL:
 * - TENANT_ADMIN: Full access
 * - STAFF: Create + View only
 * 
 * NOTE: Run `npx prisma migrate dev` after schema changes
 */

import { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma';
import { requireTenantId } from '../../middleware/tenant-context';
import { requireRole, requireTenantAdmin } from '../../middleware/rbac';
import { AuditLogger } from '../../services/audit-logger';
import z from 'zod';

const auditLogger = new AuditLogger(prisma);

// Cast for models added in Phase 6B (safe after migration)
const db = prisma as any; export async function scheduledMessageRoutes(app: FastifyInstance) {
    // All routes require authentication and tenant context
    app.addHook('preHandler', app.authenticate);
    app.addHook('preHandler', requireTenantId);

    // ============================================
    // CREATE Scheduled Message
    // ============================================

    /**
     * POST /scheduled-messages
     * Schedule a message for future delivery
     */
    app.post('/', {
        schema: {
            body: z.object({
                recipientPhone: z.string().min(10).max(20),
                messageText: z.string().min(1).max(4096),
                templateId: z.string().uuid().optional(),
                scheduledAt: z.string().datetime() // ISO 8601
            })
        }
    }, async (req, reply) => {
        const tenantId = req.tenantId!;
        const userId = (req.user as any).id;
        const { recipientPhone, messageText, templateId, scheduledAt } = req.body as any;

        // Validate scheduledAt is in the future
        const scheduledDate = new Date(scheduledAt);
        if (scheduledDate <= new Date()) {
            return reply.code(400).send({ error: 'scheduledAt must be in the future' });
        }

        // If templateId provided, verify it belongs to tenant
        if (templateId) {
            const template = await db.messageTemplate.findFirst({
                where: { id: templateId, tenantId }
            });
            if (!template) {
                return reply.code(400).send({ error: 'Template not found' });
            }
        }

        const scheduled = await db.scheduledMessage.create({
            data: {
                tenantId,
                recipientPhone: recipientPhone.replace(/\D/g, ''), // Normalize
                messageText,
                templateId,
                scheduledAt: scheduledDate,
                createdBy: userId
            }
        });

        await auditLogger.log({
            tenantId,
            actorUserId: userId,
            eventType: 'SCHEDULED_MESSAGE_CREATED',
            metadata: { id: scheduled.id, recipientPhone, scheduledAt },
            ipAddress: req.ip
        });

        return reply.code(201).send(scheduled);
    });

    // ============================================
    // LIST Scheduled Messages
    // ============================================

    /**
     * GET /scheduled-messages
     * List scheduled messages with filters
     */
    app.get('/', {
        schema: {
            querystring: z.object({
                status: z.enum(['PENDING', 'SENT', 'FAILED', 'CANCELED']).optional(),
                limit: z.string().optional(),
                offset: z.string().optional()
            })
        }
    }, async (req, reply) => {
        const tenantId = req.tenantId!;
        const { status, limit = '20', offset = '0' } = req.query as any;

        const where: any = { tenantId };
        if (status) where.status = status;

        const [messages, total] = await Promise.all([
            db.scheduledMessage.findMany({
                where,
                orderBy: { scheduledAt: 'asc' },
                take: Math.min(parseInt(limit), 50),
                skip: parseInt(offset),
                include: {
                    template: { select: { name: true } }
                }
            }),
            db.scheduledMessage.count({ where })
        ]);

        return { messages, total };
    });

    // ============================================
    // GET Single Scheduled Message
    // ============================================

    app.get('/:id', {
        schema: {
            params: z.object({ id: z.string().uuid() })
        }
    }, async (req, reply) => {
        const tenantId = req.tenantId!;
        const { id } = req.params as { id: string };

        const message = await db.scheduledMessage.findFirst({
            where: { id, tenantId },
            include: { template: true }
        });

        if (!message) {
            return reply.code(404).send({ error: 'Scheduled message not found' });
        }

        return message;
    });

    // ============================================
    // CANCEL Scheduled Message (Admin only)
    // ============================================

    /**
     * PATCH /scheduled-messages/:id/cancel
     * Cancel a pending scheduled message
     */
    app.patch('/:id/cancel', {
        preHandler: [requireTenantAdmin],
        schema: {
            params: z.object({ id: z.string().uuid() })
        }
    }, async (req, reply) => {
        const tenantId = req.tenantId!;
        const userId = (req.user as any).id;
        const { id } = req.params as { id: string };

        // Find and verify
        const existing = await db.scheduledMessage.findFirst({
            where: { id, tenantId }
        });

        if (!existing) {
            return reply.code(404).send({ error: 'Scheduled message not found' });
        }

        if (existing.status !== 'PENDING') {
            return reply.code(400).send({ error: `Cannot cancel message with status: ${existing.status}` });
        }

        const updated = await db.scheduledMessage.update({
            where: { id },
            data: { status: 'CANCELED' }
        });

        await auditLogger.log({
            tenantId,
            actorUserId: userId,
            eventType: 'SCHEDULED_MESSAGE_CANCELED',
            metadata: { id, previousStatus: existing.status },
            ipAddress: req.ip
        });

        return updated;
    });
}
