import { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma';
import { AuditLogger } from '../../services/audit-logger';
import { requireSuperAdmin } from '../../middleware/rbac';
import z from 'zod';

const auditLogger = new AuditLogger(prisma);

export async function systemRoutes(app: FastifyInstance) {
    // All system routes require SUPER_ADMIN role
    app.addHook('preHandler', app.authenticate);
    app.addHook('preHandler', requireSuperAdmin);

    // ============================================
    // System Settings
    // ============================================

    // Get system settings
    app.get('/settings', async () => {
        let settings = await prisma.systemSettings.findUnique({
            where: { id: 'system' }
        });

        // Create default settings if not exist
        if (!settings) {
            settings = await prisma.systemSettings.create({
                data: { id: 'system' }
            });
        }

        // Don't expose sensitive data
        return {
            globalAiEnabled: settings.globalAiEnabled,
            globalWhatsappEnabled: settings.globalWhatsappEnabled,
            defaultAiProvider: settings.defaultAiProvider,
            maxTenantsAllowed: settings.maxTenantsAllowed,
            maxMessagesPerHour: settings.maxMessagesPerHour,
            updatedAt: settings.updatedAt
        };
    });

    // Update system settings
    app.patch('/settings', {
        schema: {
            body: z.object({
                globalAiEnabled: z.boolean().optional(),
                globalWhatsappEnabled: z.boolean().optional(),
                defaultAiProvider: z.enum(['mock', 'openai']).optional(),
                maxTenantsAllowed: z.number().min(1).optional(),
                maxMessagesPerHour: z.number().min(1).optional()
            })
        }
    }, async (req) => {
        const updates = req.body as any;
        const actorId = (req.user as any)?.id;

        // Ensure settings exist
        await prisma.systemSettings.upsert({
            where: { id: 'system' },
            create: { id: 'system' },
            update: {}
        });

        const settings = await prisma.systemSettings.update({
            where: { id: 'system' },
            data: updates
        });

        await auditLogger.log({
            tenantId: 'SYSTEM',
            actorUserId: actorId,
            eventType: 'SYSTEM_SETTINGS_UPDATED',
            metadata: updates,
            ipAddress: req.ip
        });

        return {
            globalAiEnabled: settings.globalAiEnabled,
            globalWhatsappEnabled: settings.globalWhatsappEnabled,
            defaultAiProvider: settings.defaultAiProvider,
            maxTenantsAllowed: settings.maxTenantsAllowed,
            maxMessagesPerHour: settings.maxMessagesPerHour,
            updatedAt: settings.updatedAt
        };
    });

    // ============================================
    // Usage Statistics
    // ============================================

    app.get('/usage', async () => {
        // Get counts per tenant
        const tenantStats = await prisma.tenant.findMany({
            select: {
                id: true,
                name: true,
                status: true,
                _count: {
                    select: {
                        users: true,
                        services: true,
                        orders: true,
                        conversations: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: 20
        });

        // Get total message count
        const totalMessages = await prisma.message.count();

        // Get messages in last 24 hours
        const last24hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const messagesLast24h = await prisma.message.count({
            where: { timestamp: { gte: last24hours } }
        });

        // Get AI vs manual responses
        const aiResponses = await prisma.message.count({
            where: { isFromAi: true, direction: 'OUTBOUND' }
        });
        const manualResponses = await prisma.message.count({
            where: { isFromAi: false, direction: 'OUTBOUND' }
        });

        // Get conversation status breakdown
        const conversationStats = await prisma.conversation.groupBy({
            by: ['status'],
            _count: { id: true }
        });

        return {
            overview: {
                totalMessages,
                messagesLast24h,
                aiResponses,
                manualResponses,
                aiPercentage: totalMessages > 0 ? Math.round((aiResponses / (aiResponses + manualResponses)) * 100) : 0
            },
            conversationsByStatus: conversationStats.reduce((acc, item) => {
                acc[item.status] = item._count.id;
                return acc;
            }, {} as Record<string, number>),
            tenantUsage: tenantStats.map(t => ({
                id: t.id,
                name: t.name,
                status: t.status,
                users: t._count.users,
                services: t._count.services,
                orders: t._count.orders,
                conversations: t._count.conversations
            }))
        };
    });
}
