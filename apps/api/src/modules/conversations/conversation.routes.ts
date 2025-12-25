/**
 * Conversation Search Routes
 * 
 * READ-ONLY search endpoint for conversations and messages.
 * Tenant-isolated, indexed search with pagination.
 * 
 * PHASE 6A: No create/update/delete - read-only
 * NOTE: Run `npx prisma migrate dev` after schema changes
 */

import { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma';
import { requireTenantId } from '../../middleware/tenant-context';
import z from 'zod';

// Cast for Phase 6A fields (safe after migration)
const db = prisma as any;

export async function conversationRoutes(app: FastifyInstance) {
    // All routes require authentication and tenant context
    app.addHook('preHandler', app.authenticate);
    app.addHook('preHandler', requireTenantId);

    // ============================================
    // Conversation Search (READ-ONLY)
    // ============================================

    /**
     * GET /conversations/search
     * Search conversations by keyword, phone, date range
     * 
     * Query params:
     * - keyword: Text search in messages
     * - phone: Phone number filter
     * - startDate: ISO date string
     * - endDate: ISO date string
     * - status: Conversation status filter
     * - limit: Max 50 (enforced)
     * - offset: Pagination offset
     */
    app.get('/search', {
        schema: {
            querystring: z.object({
                keyword: z.string().optional(),
                phone: z.string().optional(),
                startDate: z.string().optional(),
                endDate: z.string().optional(),
                status: z.enum(['OPEN', 'ASSIGNED', 'RESOLVED', 'CLOSED']).optional(),
                limit: z.string().optional(),
                offset: z.string().optional()
            })
        }
    }, async (req, reply) => {
        const tenantId = req.tenantId!;
        const {
            keyword,
            phone,
            startDate,
            endDate,
            status,
            limit: limitStr = '20',
            offset: offsetStr = '0'
        } = req.query as any;

        // Enforce max page size
        const limit = Math.min(parseInt(limitStr) || 20, 50);
        const offset = parseInt(offsetStr) || 0;

        // Build where clause - ALWAYS include tenantId
        const where: any = {
            tenantId // MANDATORY - tenant isolation
        };

        // Phone number filter
        if (phone) {
            where.customerJid = { contains: phone };
        }

        // Status filter
        if (status) {
            where.status = status;
        }

        // Date range filter
        if (startDate || endDate) {
            where.lastMessageAt = {};
            if (startDate) {
                where.lastMessageAt.gte = new Date(startDate);
            }
            if (endDate) {
                where.lastMessageAt.lte = new Date(endDate);
            }
        }

        // Keyword search - requires message content search
        let messageFilter = undefined;
        if (keyword) {
            messageFilter = {
                some: {
                    content: { contains: keyword, mode: 'insensitive' as const }
                }
            };
            where.messages = messageFilter;
        }

        // Execute query
        const [conversations, total] = await Promise.all([
            db.conversation.findMany({
                where,
                include: {
                    messages: {
                        orderBy: { timestamp: 'desc' },
                        take: 1, // Only last message for preview
                        select: {
                            id: true,
                            content: true,
                            direction: true,
                            type: true,
                            timestamp: true
                        }
                    },
                    _count: {
                        select: { messages: true }
                    }
                },
                orderBy: { lastMessageAt: 'desc' },
                take: limit,
                skip: offset
            }),
            db.conversation.count({ where })
        ]);

        return {
            conversations: conversations.map((c: any) => ({
                id: c.id,
                customerJid: c.customerJid,
                customerName: c.customerName,
                customerPhone: c.customerPhone,
                status: c.status,
                lastMessageAt: c.lastMessageAt,
                messageCount: c._count.messages,
                lastMessage: c.messages[0] || null
            })),
            total,
            limit,
            offset,
            hasMore: offset + conversations.length < total
        };
    });

    // ============================================
    // Get Single Conversation with Messages
    // ============================================

    /**
     * GET /conversations/:id
     * Get conversation details with paginated messages
     */
    app.get('/:id', {
        schema: {
            params: z.object({
                id: z.string().uuid()
            }),
            querystring: z.object({
                messageLimit: z.string().optional(),
                messageOffset: z.string().optional()
            })
        }
    }, async (req, reply) => {
        const tenantId = req.tenantId!;
        const { id } = req.params as { id: string };
        const { messageLimit = '50', messageOffset = '0' } = req.query as any;

        const limit = Math.min(parseInt(messageLimit) || 50, 100);
        const offset = parseInt(messageOffset) || 0;

        // Find conversation - MUST match tenantId
        const conversation = await db.conversation.findFirst({
            where: { id, tenantId },
            include: {
                messages: {
                    orderBy: { timestamp: 'asc' },
                    take: limit,
                    skip: offset,
                    select: {
                        id: true,
                        direction: true,
                        type: true,
                        content: true,
                        mediaUrl: true,
                        mimeType: true,
                        isFromAi: true,
                        aiConfidence: true,
                        timestamp: true
                    }
                },
                _count: { select: { messages: true } }
            }
        });

        if (!conversation) {
            return reply.code(404).send({ error: 'Conversation not found' });
        }

        return {
            ...conversation,
            messageCount: conversation._count.messages,
            hasMoreMessages: offset + conversation.messages.length < conversation._count.messages
        };
    });
}
