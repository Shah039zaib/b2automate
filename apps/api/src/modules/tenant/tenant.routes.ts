import { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma';
import { requireTenantId } from '../../middleware/tenant-context';
import { requireTenantAdmin } from '../../middleware/rbac';
import { logger } from '@b2automate/logger';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export async function tenantRoutes(app: FastifyInstance) {
    // All routes require:
    // 1. Authentication (via app.authenticate decorator from index.ts)
    // 2. Tenant context
    // 3. TENANT_ADMIN or SUPER_ADMIN role (STAFF blocked)
    app.addHook('preHandler', app.authenticate);
    app.addHook('preHandler', requireTenantId);
    app.addHook('preHandler', requireTenantAdmin);

    // ============================================
    // Tenant Settings
    // ============================================

    // Get current tenant settings
    app.get('/settings', async (req, reply) => {
        const tenant = await prisma.tenant.findUnique({
            where: { id: req.tenantId },
            select: {
                id: true,
                name: true,
                businessPhone: true,
                businessAddress: true,
                businessDescription: true,
                isAiEnabled: true,
                isWhatsappEnabled: true,
                status: true,
                createdAt: true
            }
        });

        if (!tenant) {
            return reply.code(404).send({ error: 'Tenant not found' });
        }

        return tenant;
    });

    // Update tenant settings
    app.patch('/settings', async (req, reply) => {
        const body = req.body as any;

        const allowedFields = ['name', 'businessPhone', 'businessAddress', 'businessDescription', 'isAiEnabled', 'isWhatsappEnabled'];
        const updates: Record<string, any> = {};

        for (const field of allowedFields) {
            if (body[field] !== undefined) {
                updates[field] = body[field];
            }
        }

        if (Object.keys(updates).length === 0) {
            return reply.code(400).send({ error: 'No valid fields to update' });
        }

        const tenant = await prisma.tenant.update({
            where: { id: req.tenantId },
            data: updates,
            select: {
                id: true,
                name: true,
                businessPhone: true,
                businessAddress: true,
                businessDescription: true,
                isAiEnabled: true,
                isWhatsappEnabled: true,
                status: true
            }
        });

        logger.info({ tenantId: req.tenantId, updates }, 'Tenant settings updated');
        return tenant;
    });

    // ============================================
    // Billing Info (READ-ONLY)
    // ============================================

    /**
     * GET /tenant/billing
     * Returns tenant's subscription status and AI usage
     * Does NOT call Stripe API - reads from local database only
     */
    app.get('/billing', async (req, reply) => {
        // Get tenant with AI usage fields
        const tenant = await prisma.tenant.findUnique({
            where: { id: req.tenantId },
            select: {
                id: true,
                aiPlan: true,
                aiTier: true,
                aiDailyUsage: true,
                aiDailyLimit: true,
                aiMonthlyUsage: true,
                aiMonthlyLimit: true,
                stripeCustomerId: true
            }
        });

        if (!tenant) {
            return reply.code(404).send({ error: 'Tenant not found' });
        }

        // Get subscription if exists
        const subscription = await prisma.subscription.findUnique({
            where: { tenantId: req.tenantId },
            include: {
                plan: {
                    select: {
                        id: true,
                        name: true,
                        description: true,
                        priceAmount: true,
                        priceCurrency: true,
                        priceInterval: true,
                        aiPlan: true,
                        aiTier: true,
                        aiDailyLimit: true,
                        aiMonthlyLimit: true
                    }
                }
            }
        });

        // Build response matching frontend TenantBillingInfo interface
        return {
            subscription: subscription ? {
                id: subscription.id,
                planId: subscription.planId,
                status: subscription.status,
                currentPeriodStart: subscription.currentPeriodStart,
                currentPeriodEnd: subscription.currentPeriodEnd,
                cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
                plan: subscription.plan
            } : null,
            // AI usage from tenant record (source of truth)
            aiPlan: tenant.aiPlan,
            aiTier: tenant.aiTier,
            aiDailyUsage: tenant.aiDailyUsage,
            aiDailyLimit: tenant.aiDailyLimit,
            aiMonthlyUsage: tenant.aiMonthlyUsage,
            aiMonthlyLimit: tenant.aiMonthlyLimit,
            // Flag for Stripe portal availability
            hasStripeCustomer: !!tenant.stripeCustomerId
        };
    });

    // ============================================
    // AI Usage Trends (for charts)
    // ============================================

    /**
     * GET /tenant/ai-trends
     * Returns tenant's daily AI usage for chart display
     */
    app.get('/ai-trends', async (req, reply) => {
        const filter = (req.query as any).filter === '30d' ? '30d' : '7d';

        // Import service dynamically (cast to any for pre-migration compatibility)
        const mod = await import('../../services/ai-usage.service' as any);
        const aiUsageService = new mod.AiUsageService(prisma);

        return aiUsageService.getTenantDailyTrends(req.tenantId!, filter);
    });

    // ============================================
    // Manual Payment History (READ-ONLY)
    // ============================================

    /**
     * GET /tenant/manual-payments
     * Returns tenant's manual payment history for status tracking
     */
    app.get('/manual-payments', async (req, reply) => {
        const payments = await prisma.manualPayment.findMany({
            where: { tenantId: req.tenantId },
            orderBy: { createdAt: 'desc' },
            take: 20, // Limit to last 20 payments
            include: {
                plan: {
                    select: {
                        name: true,
                        priceAmount: true,
                    }
                }
            }
        });

        return payments.map(p => ({
            id: p.id,
            status: p.status,
            planName: p.plan.name,
            method: p.method,
            amount: p.plan.priceAmount,
            createdAt: p.createdAt,
            reviewedAt: p.reviewedAt,
        }));
    });

    // ============================================
    // Working Hours
    // ============================================

    // Get working hours
    app.get('/working-hours', async (req, reply) => {
        const hours = await prisma.workingHours.findMany({
            where: { tenantId: req.tenantId },
            orderBy: { dayOfWeek: 'asc' }
        });

        // If no hours exist, return default structure
        if (hours.length === 0) {
            const defaultHours = [];
            for (let day = 0; day < 7; day++) {
                defaultHours.push({
                    dayOfWeek: day,
                    openTime: '09:00',
                    closeTime: '18:00',
                    isClosed: day === 0 || day === 6 // Closed on weekends
                });
            }
            return defaultHours;
        }

        return hours;
    });

    // Update working hours (bulk)
    app.put('/working-hours', async (req, reply) => {
        const body = req.body as Array<{
            dayOfWeek: number;
            openTime: string;
            closeTime: string;
            isClosed: boolean;
        }>;

        if (!Array.isArray(body) || body.length !== 7) {
            return reply.code(400).send({ error: 'Must provide exactly 7 days of working hours' });
        }

        // Validate each day
        for (const day of body) {
            if (day.dayOfWeek < 0 || day.dayOfWeek > 6) {
                return reply.code(400).send({ error: `Invalid dayOfWeek: ${day.dayOfWeek}` });
            }
            if (!day.isClosed && (!day.openTime || !day.closeTime)) {
                return reply.code(400).send({ error: `Open/close time required for day ${day.dayOfWeek}` });
            }
        }

        // Upsert all days
        const results = await Promise.all(
            body.map(day =>
                prisma.workingHours.upsert({
                    where: {
                        tenantId_dayOfWeek: {
                            tenantId: req.tenantId,
                            dayOfWeek: day.dayOfWeek
                        }
                    },
                    update: {
                        openTime: day.openTime,
                        closeTime: day.closeTime,
                        isClosed: day.isClosed
                    },
                    create: {
                        tenantId: req.tenantId,
                        dayOfWeek: day.dayOfWeek,
                        openTime: day.openTime,
                        closeTime: day.closeTime,
                        isClosed: day.isClosed
                    }
                })
            )
        );

        logger.info({ tenantId: req.tenantId }, 'Working hours updated');
        return results;
    });

    // ============================================
    // Team Management
    // ============================================

    // List tenant users
    app.get('/users', async (req, reply) => {
        const users = await prisma.user.findMany({
            where: { tenantId: req.tenantId },
            select: {
                id: true,
                email: true,
                role: true,
                createdAt: true
            },
            orderBy: { createdAt: 'asc' }
        });

        return users;
    });

    // Create new user (invite)
    app.post('/users', async (req, reply) => {
        const { email, password, role } = req.body as {
            email: string;
            password: string;
            role: 'TENANT_ADMIN' | 'STAFF';
        };

        if (!email || !password) {
            return reply.code(400).send({ error: 'Email and password required' });
        }

        // Check if email already exists
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            return reply.code(409).send({ error: 'Email already in use' });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

        const user = await prisma.user.create({
            data: {
                email,
                passwordHash,
                role: role || 'STAFF',
                tenantId: req.tenantId
            },
            select: {
                id: true,
                email: true,
                role: true,
                createdAt: true
            }
        });

        logger.info({ tenantId: req.tenantId, userId: user.id }, 'New team member created');
        return reply.code(201).send(user);
    });

    // Delete user
    app.delete('/users/:id', async (req, reply) => {
        const { id } = req.params as { id: string };
        const actorId = (req.user as any)?.id;

        // Cannot delete yourself
        if (id === actorId) {
            return reply.code(400).send({ error: 'Cannot delete your own account' });
        }

        // Verify user belongs to tenant
        const user = await prisma.user.findFirst({
            where: { id, tenantId: req.tenantId }
        });

        if (!user) {
            return reply.code(404).send({ error: 'User not found' });
        }

        await prisma.user.delete({ where: { id } });

        logger.info({ tenantId: req.tenantId, deletedUserId: id }, 'Team member deleted');
        return { message: 'User deleted successfully' };
    });

    // ============================================
    // Analytics
    // ============================================

    app.get('/analytics', async (req, reply) => {
        const { days = 30 } = req.query as { days?: number };
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        // Aggregate data
        const [
            totalOrders,
            pendingOrders,
            approvedOrders,
            totalRevenue,
            activeServices,
            totalUsers,
            recentOrders
        ] = await Promise.all([
            prisma.order.count({
                where: { tenantId: req.tenantId }
            }),
            prisma.order.count({
                where: { tenantId: req.tenantId, status: 'PENDING_APPROVAL' }
            }),
            prisma.order.count({
                where: { tenantId: req.tenantId, status: 'APPROVED' }
            }),
            prisma.order.aggregate({
                where: {
                    tenantId: req.tenantId,
                    status: { in: ['APPROVED', 'COMPLETED'] }
                },
                _sum: { totalAmount: true }
            }),
            prisma.service.count({
                where: { tenantId: req.tenantId, isActive: true }
            }),
            prisma.user.count({
                where: { tenantId: req.tenantId }
            }),
            prisma.order.findMany({
                where: {
                    tenantId: req.tenantId,
                    createdAt: { gte: startDate }
                },
                select: {
                    id: true,
                    status: true,
                    totalAmount: true,
                    createdAt: true
                },
                orderBy: { createdAt: 'desc' },
                take: 10
            })
        ]);

        // Orders by date (last N days)
        const ordersByDate = await prisma.order.groupBy({
            by: ['createdAt'],
            where: {
                tenantId: req.tenantId,
                createdAt: { gte: startDate }
            },
            _count: { id: true }
        });

        // Format orders by date for chart
        const dailyOrders: Record<string, number> = {};
        for (let i = 0; i < days; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            dailyOrders[date.toISOString().split('T')[0]] = 0;
        }

        ordersByDate.forEach(item => {
            const dateKey = new Date(item.createdAt).toISOString().split('T')[0];
            if (dailyOrders[dateKey] !== undefined) {
                dailyOrders[dateKey] = item._count.id;
            }
        });

        return {
            summary: {
                totalOrders,
                pendingOrders,
                approvedOrders,
                totalRevenue: totalRevenue._sum.totalAmount || 0,
                activeServices,
                totalUsers
            },
            ordersByDate: Object.entries(dailyOrders)
                .map(([date, count]) => ({ date, count }))
                .reverse(),
            recentOrders
        };
    });

    // ============================================
    // Conversation Logs (Inbox - read only)
    // ============================================

    app.get('/conversations', async (req, reply) => {
        const { limit = 50, offset = 0 } = req.query as { limit?: number; offset?: number };

        // Get AI conversation audit logs grouped by customerJid
        const logs = await prisma.auditLog.findMany({
            where: {
                tenantId: req.tenantId,
                eventType: { in: ['AI_RESPONSE_GENERATED', 'CUSTOMER_DETAILS_COLLECTED', 'AI_MANUAL_TAKEOVER_REQUESTED'] }
            },
            orderBy: { timestamp: 'desc' },
            take: Number(limit),
            skip: Number(offset),
            select: {
                id: true,
                eventType: true,
                metadata: true,
                timestamp: true
            }
        });

        // Extract unique customer JIDs from metadata
        const conversations = logs.map(log => ({
            id: log.id,
            type: log.eventType,
            input: (log.metadata as any)?.input || '',
            output: (log.metadata as any)?.output || '',
            customerJid: (log.metadata as any)?.customerJid || 'unknown',
            timestamp: log.timestamp
        }));

        return conversations;
    });
}
