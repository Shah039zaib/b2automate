import { FastifyInstance } from 'fastify';
import { TenantStatus } from '@b2automate/database';
import { prisma } from '../../lib/prisma';
import { AuditLogger } from '../../services/audit-logger';
import { requireSuperAdmin } from '../../middleware/rbac';
import z from 'zod';
import { logger } from '@b2automate/logger';

const auditLogger = new AuditLogger(prisma);

export async function adminRoutes(app: FastifyInstance) {
    // All admin routes require SUPER_ADMIN role
    app.addHook('preHandler', app.authenticate);
    app.addHook('preHandler', requireSuperAdmin);

    // ============================================
    // Tenant Management
    // ============================================

    // List all tenants
    app.get('/tenants', async (req, reply) => {
        const { status, search, limit = 50, offset = 0 } = req.query as any;

        const where: any = {};
        if (status) {
            where.status = status;
        }
        if (search) {
            where.name = { contains: search, mode: 'insensitive' };
        }

        const [tenants, total] = await Promise.all([
            prisma.tenant.findMany({
                where,
                include: {
                    _count: {
                        select: { users: true, services: true, orders: true }
                    }
                },
                orderBy: { createdAt: 'desc' },
                take: parseInt(limit),
                skip: parseInt(offset)
            }),
            prisma.tenant.count({ where })
        ]);

        return {
            tenants,
            total,
            limit: parseInt(limit),
            offset: parseInt(offset)
        };
    });

    // Get single tenant details
    app.get('/tenants/:id', async (req, reply) => {
        const { id } = req.params as any;

        const tenant = await prisma.tenant.findUnique({
            where: { id },
            include: {
                users: {
                    select: { id: true, email: true, role: true, createdAt: true }
                },
                _count: {
                    select: { services: true, orders: true, auditLogs: true }
                }
            }
        });

        if (!tenant) {
            return reply.code(404).send({ error: 'Tenant not found' });
        }

        return tenant;
    });

    // Create new tenant (without user - admin creates tenant shell)
    app.post('/tenants', {
        schema: {
            body: z.object({
                name: z.string().min(2),
                status: z.enum(['ACTIVE', 'SUSPENDED', 'ARCHIVED']).optional()
            })
        }
    }, async (req, reply) => {
        const { name, status = 'ACTIVE' } = req.body as any;
        const actorId = (req.user as any)?.id;

        const tenant = await prisma.tenant.create({
            data: {
                name,
                status: status as TenantStatus
            }
        });

        await auditLogger.log({
            tenantId: tenant.id,
            actorUserId: actorId,
            eventType: 'TENANT_CREATED_BY_ADMIN',
            metadata: { name, status },
            ipAddress: req.ip
        });

        logger.info({ tenantId: tenant.id, actorId }, 'Tenant created by Super Admin');
        return reply.code(201).send(tenant);
    });

    // Update tenant (activate, suspend, update name, kill switches)
    app.patch('/tenants/:id', {
        schema: {
            body: z.object({
                name: z.string().min(2).optional(),
                status: z.enum(['ACTIVE', 'SUSPENDED', 'ARCHIVED']).optional(),
                isAiEnabled: z.boolean().optional(),
                isWhatsappEnabled: z.boolean().optional()
            })
        }
    }, async (req, reply) => {
        const { id } = req.params as any;
        const updates = req.body as any;
        const actorId = (req.user as any)?.id;

        // Check tenant exists
        const existing = await prisma.tenant.findUnique({ where: { id } });
        if (!existing) {
            return reply.code(404).send({ error: 'Tenant not found' });
        }

        const tenant = await prisma.tenant.update({
            where: { id },
            data: updates
        });

        await auditLogger.log({
            tenantId: id,
            actorUserId: actorId,
            eventType: 'TENANT_UPDATED_BY_ADMIN',
            metadata: { updates, previousStatus: existing.status },
            ipAddress: req.ip
        });

        logger.info({ tenantId: id, updates, actorId }, 'Tenant updated by Super Admin');
        return tenant;
    });

    // ============================================
    // Bulk Tenant Operations
    // ============================================

    /**
     * POST /admin/tenants/bulk
     * Perform bulk operations (suspend/reactivate/archive) on multiple tenants
     */
    app.post('/tenants/bulk', {
        schema: {
            body: z.object({
                tenantIds: z.array(z.string().uuid()).min(1).max(50),
                action: z.enum(['SUSPEND', 'REACTIVATE', 'ARCHIVE'])
            })
        }
    }, async (req, reply) => {
        const { tenantIds, action } = req.body as { tenantIds: string[], action: 'SUSPEND' | 'REACTIVATE' | 'ARCHIVE' };
        const actorId = (req.user as any)?.id;

        // Map action to status
        const statusMap = {
            SUSPEND: 'SUSPENDED' as TenantStatus,
            REACTIVATE: 'ACTIVE' as TenantStatus,
            ARCHIVE: 'ARCHIVED' as TenantStatus
        };
        const newStatus = statusMap[action];

        // Update all tenants in transaction
        const result = await prisma.$transaction(async (tx) => {
            const updated = await tx.tenant.updateMany({
                where: { id: { in: tenantIds } },
                data: { status: newStatus }
            });

            // Create audit log for bulk action
            await tx.auditLog.create({
                data: {
                    tenantId: tenantIds[0], // Use first tenant for audit, metadata has all
                    actorUserId: actorId,
                    eventType: `BULK_TENANT_${action}`,
                    metadata: { tenantIds, count: updated.count, newStatus }
                }
            });

            return updated;
        });

        logger.info({ action, count: result.count, actorId }, 'Bulk tenant operation completed');

        return {
            success: true,
            updatedCount: result.count,
            action,
            newStatus
        };
    });

    // ============================================
    // Export to CSV
    // ============================================

    /**
     * GET /admin/export/:type
     * Export tenants, payments, or audit logs to CSV format
     */
    app.get('/export/:type', async (req, reply) => {
        const { type } = req.params as { type: string };

        let csvContent = '';
        let filename = '';

        if (type === 'tenants') {
            const tenants = await prisma.tenant.findMany({
                select: { id: true, name: true, status: true, aiPlan: true, aiTier: true, createdAt: true }
            });
            csvContent = 'ID,Name,Status,AI Plan,AI Tier,Created At\n';
            csvContent += tenants.map(t =>
                `${t.id},"${t.name}",${t.status},${t.aiPlan},${t.aiTier},${t.createdAt.toISOString()}`
            ).join('\n');
            filename = 'tenants_export.csv';
        } else if (type === 'payments') {
            const payments = await prisma.manualPayment.findMany({
                include: { tenant: { select: { name: true } }, plan: { select: { name: true, priceAmount: true } } },
                orderBy: { createdAt: 'desc' },
                take: 1000
            });
            csvContent = 'ID,Tenant,Plan,Amount,Method,Status,Created At\n';
            csvContent += payments.map(p =>
                `${p.id},"${p.tenant.name}","${p.plan.name}",${p.plan.priceAmount},${p.method},${p.status},${p.createdAt.toISOString()}`
            ).join('\n');
            filename = 'payments_export.csv';
        } else if (type === 'audit') {
            const logs = await prisma.auditLog.findMany({
                include: { tenant: { select: { name: true } } },
                orderBy: { timestamp: 'desc' },
                take: 1000
            });
            csvContent = 'ID,Tenant,Event Type,Timestamp\n';
            csvContent += logs.map(l =>
                `${l.id},"${l.tenant?.name || 'System'}",${l.eventType},${l.timestamp.toISOString()}`
            ).join('\n');
            filename = 'audit_logs_export.csv';
        } else {
            return reply.code(400).send({ error: 'Invalid export type. Use: tenants, payments, audit' });
        }

        reply.header('Content-Type', 'text/csv');
        reply.header('Content-Disposition', `attachment; filename="${filename}"`);
        return reply.send(csvContent);
    });

    // ============================================
    // AI Settings Management (Super Admin Only)
    // ============================================

    // Valid plan-tier combinations
    const VALID_PLAN_TIER_MAP: Record<string, string[]> = {
        'FREE': ['FREE'],
        'PAID_BASIC': ['FREE', 'LOW'],
        'PAID_PRO': ['FREE', 'LOW', 'MEDIUM'],
        'ENTERPRISE': ['FREE', 'LOW', 'MEDIUM', 'HIGH']
    };

    // Default limits per plan
    const DEFAULT_LIMITS_BY_PLAN: Record<string, { daily: number; monthly: number }> = {
        'FREE': { daily: 50, monthly: 1000 },
        'PAID_BASIC': { daily: 500, monthly: 10000 },
        'PAID_PRO': { daily: 2000, monthly: 50000 },
        'ENTERPRISE': { daily: 999999, monthly: 999999 }
    };

    // Update tenant AI settings
    app.patch('/tenants/:id/ai-settings', {
        schema: {
            body: z.object({
                aiPlan: z.enum(['FREE', 'PAID_BASIC', 'PAID_PRO', 'ENTERPRISE']),
                aiTier: z.enum(['FREE', 'LOW', 'MEDIUM', 'HIGH']),
                aiDailyLimit: z.number().int().min(1).max(999999),
                aiMonthlyLimit: z.number().int().min(1).max(999999),
                aiCustomModel: z.string().nullable().optional()
            })
        }
    }, async (req, reply) => {
        const { id } = req.params as any;
        const { aiPlan, aiTier, aiDailyLimit, aiMonthlyLimit, aiCustomModel } = req.body as any;
        const actorId = (req.user as any)?.id;

        // 1. Check tenant exists
        const existing = await prisma.tenant.findUnique({ where: { id } });
        if (!existing) {
            return reply.code(404).send({ error: 'Tenant not found' });
        }

        // 2. Validate plan-tier combination
        const validTiers = VALID_PLAN_TIER_MAP[aiPlan];
        if (!validTiers.includes(aiTier)) {
            return reply.code(400).send({
                error: 'Invalid plan-tier combination',
                message: `Plan "${aiPlan}" only allows tiers: ${validTiers.join(', ')}`,
                allowedTiers: validTiers
            });
        }

        // 3. Validate aiCustomModel (ENTERPRISE only)
        if (aiCustomModel && aiPlan !== 'ENTERPRISE') {
            return reply.code(400).send({
                error: 'Custom model not allowed',
                message: 'Custom model is only available for ENTERPRISE plan'
            });
        }

        // 4. Apply defaults for limits if not specified or use provided
        const defaults = DEFAULT_LIMITS_BY_PLAN[aiPlan];
        const finalDailyLimit = aiDailyLimit ?? defaults.daily;
        const finalMonthlyLimit = aiMonthlyLimit ?? defaults.monthly;

        // 5. Update tenant with AI settings and RESET usage counters
        const tenant = await prisma.tenant.update({
            where: { id },
            data: {
                aiPlan,
                aiTier,
                aiDailyLimit: finalDailyLimit,
                aiMonthlyLimit: finalMonthlyLimit,
                aiCustomModel: aiPlan === 'ENTERPRISE' ? aiCustomModel : null,
                // Reset usage counters on plan change
                aiDailyUsage: 0,
                aiMonthlyUsage: 0,
                aiUsageResetAt: new Date()
            }
        });

        // 6. Audit log
        await auditLogger.log({
            tenantId: id,
            actorUserId: actorId,
            eventType: 'AI_SETTINGS_UPDATED',
            metadata: {
                previousPlan: existing.aiPlan,
                previousTier: existing.aiTier,
                newPlan: aiPlan,
                newTier: aiTier,
                dailyLimit: finalDailyLimit,
                monthlyLimit: finalMonthlyLimit,
                customModel: aiCustomModel || null
            },
            ipAddress: req.ip
        });

        logger.info({
            tenantId: id,
            aiPlan,
            aiTier,
            actorId
        }, 'Tenant AI settings updated by Super Admin');

        return {
            success: true,
            tenant: {
                id: tenant.id,
                name: tenant.name,
                aiPlan: tenant.aiPlan,
                aiTier: tenant.aiTier,
                aiDailyLimit: tenant.aiDailyLimit,
                aiMonthlyLimit: tenant.aiMonthlyLimit,
                aiCustomModel: tenant.aiCustomModel,
                aiDailyUsage: tenant.aiDailyUsage,
                aiMonthlyUsage: tenant.aiMonthlyUsage
            }
        };
    });

    // Get tenant AI settings (read-only endpoint)
    app.get('/tenants/:id/ai-settings', async (req, reply) => {
        const { id } = req.params as any;

        const tenant = await prisma.tenant.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                aiPlan: true,
                aiTier: true,
                aiDailyLimit: true,
                aiMonthlyLimit: true,
                aiCustomModel: true,
                aiDailyUsage: true,
                aiMonthlyUsage: true,
                aiUsageResetAt: true,
                isAiEnabled: true
            }
        });

        if (!tenant) {
            return reply.code(404).send({ error: 'Tenant not found' });
        }

        return {
            ...tenant,
            validTiers: VALID_PLAN_TIER_MAP[tenant.aiPlan],
            defaults: DEFAULT_LIMITS_BY_PLAN[tenant.aiPlan]
        };
    });
    // Activate tenant (shorthand)
    app.post('/tenants/:id/activate', async (req, reply) => {
        const { id } = req.params as any;
        const actorId = (req.user as any)?.id;

        const tenant = await prisma.tenant.update({
            where: { id },
            data: { status: 'ACTIVE' }
        });

        await auditLogger.log({
            tenantId: id,
            actorUserId: actorId,
            eventType: 'TENANT_ACTIVATED',
            ipAddress: req.ip
        });

        return tenant;
    });

    // Suspend tenant (shorthand)
    app.post('/tenants/:id/suspend', async (req, reply) => {
        const { id } = req.params as any;
        const actorId = (req.user as any)?.id;

        const tenant = await prisma.tenant.update({
            where: { id },
            data: { status: 'SUSPENDED' }
        });

        await auditLogger.log({
            tenantId: id,
            actorUserId: actorId,
            eventType: 'TENANT_SUSPENDED',
            ipAddress: req.ip
        });

        logger.warn({ tenantId: id, actorId }, 'Tenant suspended');
        return tenant;
    });

    // ============================================
    // Tenant Delete Operations
    // ============================================

    // Soft Delete (Archive) - Sets status to ARCHIVED, data preserved
    app.post('/tenants/:id/archive', async (req, reply) => {
        const { id } = req.params as any;
        const actorId = (req.user as any)?.id;

        const existing = await prisma.tenant.findUnique({ where: { id } });
        if (!existing) {
            return reply.code(404).send({ error: 'Tenant not found' });
        }

        const tenant = await prisma.tenant.update({
            where: { id },
            data: { status: 'ARCHIVED' }
        });

        await auditLogger.log({
            tenantId: id,
            actorUserId: actorId,
            eventType: 'TENANT_ARCHIVED',
            metadata: { previousStatus: existing.status },
            ipAddress: req.ip
        });

        logger.info({ tenantId: id, actorId }, 'Tenant archived (soft deleted)');
        return { message: 'Tenant archived successfully', tenant };
    });

    // Hard Delete - Permanently removes tenant and ALL related data
    // DANGEROUS: Requires confirmation query param
    app.delete('/tenants/:id', {
        schema: {
            querystring: z.object({
                confirm: z.literal('DELETE_PERMANENTLY').optional()
            })
        }
    }, async (req, reply) => {
        const { id } = req.params as any;
        const { confirm } = req.query as any;
        const actorId = (req.user as any)?.id;

        // Safety: Require confirmation
        if (confirm !== 'DELETE_PERMANENTLY') {
            return reply.code(400).send({
                error: 'Confirmation required',
                message: 'Add ?confirm=DELETE_PERMANENTLY to permanently delete this tenant and ALL its data'
            });
        }

        const existing = await prisma.tenant.findUnique({
            where: { id },
            include: {
                _count: { select: { users: true, services: true, orders: true, auditLogs: true } }
            }
        });

        if (!existing) {
            return reply.code(404).send({ error: 'Tenant not found' });
        }

        // Warning about data to be deleted
        const dataToDelete = {
            users: existing._count.users,
            services: existing._count.services,
            orders: existing._count.orders,
            auditLogs: existing._count.auditLogs
        };

        // Delete in transaction (cascade)
        await prisma.$transaction(async (tx) => {
            // 1. Delete OrderItems first (foreign key to Order)
            await tx.orderItem.deleteMany({
                where: { order: { tenantId: id } }
            });

            // 2. Delete Orders
            await tx.order.deleteMany({ where: { tenantId: id } });

            // 3. Delete Services
            await tx.service.deleteMany({ where: { tenantId: id } });

            // 4. Delete AuditLogs
            await tx.auditLog.deleteMany({ where: { tenantId: id } });

            // 5. Delete Users
            await tx.user.deleteMany({ where: { tenantId: id } });

            // 6. Finally delete Tenant
            await tx.tenant.delete({ where: { id } });
        });

        logger.warn({
            tenantId: id,
            actorId,
            tenantName: existing.name,
            dataDeleted: dataToDelete
        }, 'TENANT PERMANENTLY DELETED');

        return {
            message: 'Tenant permanently deleted',
            deleted: {
                tenant: existing.name,
                ...dataToDelete
            }
        };
    });

    // ============================================
    // Global Statistics
    // ============================================

    app.get('/stats', async (req, reply) => {
        const [
            totalTenants,
            activeTenants,
            suspendedTenants,
            totalUsers,
            totalOrders,
            totalServices
        ] = await Promise.all([
            prisma.tenant.count(),
            prisma.tenant.count({ where: { status: 'ACTIVE' } }),
            prisma.tenant.count({ where: { status: 'SUSPENDED' } }),
            prisma.user.count(),
            prisma.order.count(),
            prisma.service.count()
        ]);

        // Orders by status
        const ordersByStatus = await prisma.order.groupBy({
            by: ['status'],
            _count: { id: true }
        });

        return {
            tenants: {
                total: totalTenants,
                active: activeTenants,
                suspended: suspendedTenants
            },
            users: totalUsers,
            orders: {
                total: totalOrders,
                byStatus: ordersByStatus.reduce((acc, item) => {
                    acc[item.status] = item._count.id;
                    return acc;
                }, {} as Record<string, number>)
            },
            services: totalServices
        };
    });

    // ============================================
    // System-wide Audit Logs
    // ============================================

    app.get('/audit-logs', async (req, reply) => {
        const { tenantId, eventType, limit = 100, offset = 0 } = req.query as any;

        const where: any = {};
        if (tenantId) where.tenantId = tenantId;
        if (eventType) where.eventType = eventType;

        const [logs, total] = await Promise.all([
            prisma.auditLog.findMany({
                where,
                include: {
                    tenant: { select: { name: true } },
                    actor: { select: { email: true } }
                },
                orderBy: { timestamp: 'desc' },
                take: parseInt(limit),
                skip: parseInt(offset)
            }),
            prisma.auditLog.count({ where })
        ]);

        return {
            logs,
            total,
            limit: parseInt(limit),
            offset: parseInt(offset)
        };
    });
}
