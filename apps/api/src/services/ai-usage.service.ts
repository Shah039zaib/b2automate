/**
 * AI Usage Analytics Service
 * 
 * Provides read-only analytics for AI usage monitoring.
 * All data comes from AiUsageLog table.
 */

import { PrismaClient, AiTier } from '@b2automate/database';

// Cost estimation per tier (rough OpenRouter pricing)
const COST_PER_REQUEST: Record<AiTier, number> = {
    FREE: 0,
    LOW: 0.0001,   // ~$0.10 per 1K requests
    MEDIUM: 0.001, // ~$1.00 per 1K requests
    HIGH: 0.01     // ~$10 per 1K requests
};

export interface DateRange {
    start: Date;
    end: Date;
}

export interface UsageOverview {
    totalRequests: number;
    totalBlocked: number;
    totalGuardrailViolations: number;
    estimatedCost: number;
    dateRange: { start: string; end: string };
}

export interface TierBreakdown {
    tier: AiTier;
    count: number;
    percentage: number;
}

export interface TenantUsage {
    tenantId: string;
    tenantName: string;
    aiPlan: string;
    aiTier: AiTier;
    todayUsage: number;
    dailyLimit: number;
    monthlyUsage: number;
    monthlyLimit: number;
    percentDailyUsed: number;
    percentMonthlyUsed: number;
    status: 'OK' | 'WARNING' | 'BLOCKED';
}

export class AiUsageService {
    constructor(private prisma: PrismaClient) { }

    /**
     * Get date range based on filter type
     */
    getDateRange(filter: 'today' | '7d' | '30d' | 'all' = 'today'): DateRange {
        const now = new Date();
        const end = new Date(now);
        end.setHours(23, 59, 59, 999);

        let start: Date;
        switch (filter) {
            case 'today':
                start = new Date(now);
                start.setHours(0, 0, 0, 0);
                break;
            case '7d':
                start = new Date(now);
                start.setDate(start.getDate() - 7);
                start.setHours(0, 0, 0, 0);
                break;
            case '30d':
                start = new Date(now);
                start.setDate(start.getDate() - 30);
                start.setHours(0, 0, 0, 0);
                break;
            case 'all':
                start = new Date(0); // Beginning of time
                break;
            default:
                start = new Date(now);
                start.setHours(0, 0, 0, 0);
        }

        return { start, end };
    }

    /**
     * Get usage overview stats
     */
    async getOverview(filter: 'today' | '7d' | '30d' | 'all' = 'today'): Promise<UsageOverview> {
        const { start, end } = this.getDateRange(filter);

        // Get all usage logs in date range
        const [totalRequests, blockedRequests, tierCounts] = await Promise.all([
            this.prisma.aiUsageLog.count({
                where: { timestamp: { gte: start, lte: end } }
            }),
            this.prisma.aiUsageLog.count({
                where: { timestamp: { gte: start, lte: end }, wasBlocked: true }
            }),
            this.prisma.aiUsageLog.groupBy({
                by: ['tier'],
                where: { timestamp: { gte: start, lte: end }, wasBlocked: false },
                _count: { id: true }
            })
        ]);

        // Get guardrail violations from AuditLog
        const guardrailViolations = await this.prisma.auditLog.count({
            where: {
                timestamp: { gte: start, lte: end },
                eventType: 'AI_GUARDRAIL_VIOLATION'
            }
        });

        // Calculate estimated cost
        let estimatedCost = 0;
        for (const item of tierCounts) {
            estimatedCost += item._count.id * COST_PER_REQUEST[item.tier];
        }

        return {
            totalRequests,
            totalBlocked: blockedRequests,
            totalGuardrailViolations: guardrailViolations,
            estimatedCost: Math.round(estimatedCost * 100) / 100,
            dateRange: {
                start: start.toISOString(),
                end: end.toISOString()
            }
        };
    }

    /**
     * Get usage breakdown by tier
     */
    async getByTier(filter: 'today' | '7d' | '30d' | 'all' = 'today'): Promise<TierBreakdown[]> {
        const { start, end } = this.getDateRange(filter);

        const tierCounts = await this.prisma.aiUsageLog.groupBy({
            by: ['tier'],
            where: { timestamp: { gte: start, lte: end } },
            _count: { id: true }
        });

        const totalCount = tierCounts.reduce((sum, t) => sum + t._count.id, 0);

        // Ensure all tiers are represented
        const allTiers: AiTier[] = ['FREE', 'LOW', 'MEDIUM', 'HIGH'];
        const result: TierBreakdown[] = allTiers.map(tier => {
            const found = tierCounts.find(t => t.tier === tier);
            const count = found ? found._count.id : 0;
            return {
                tier,
                count,
                percentage: totalCount > 0 ? Math.round((count / totalCount) * 100) : 0
            };
        });

        return result;
    }

    /**
     * Get usage by tenant with pagination
     */
    async getByTenant(
        filter: 'today' | '7d' | '30d' | 'all' = 'today',
        limit: number = 20,
        offset: number = 0
    ): Promise<{ tenants: TenantUsage[]; total: number }> {
        // Get all active tenants with their AI settings
        const [tenants, total] = await Promise.all([
            this.prisma.tenant.findMany({
                where: { status: 'ACTIVE' },
                select: {
                    id: true,
                    name: true,
                    aiPlan: true,
                    aiTier: true,
                    aiDailyLimit: true,
                    aiMonthlyLimit: true,
                    aiDailyUsage: true,
                    aiMonthlyUsage: true
                },
                orderBy: { aiMonthlyUsage: 'desc' },
                take: limit,
                skip: offset
            }),
            this.prisma.tenant.count({ where: { status: 'ACTIVE' } })
        ]);

        // Calculate today's usage from AiUsageLog
        const { start, end } = this.getDateRange('today');

        const todayUsageCounts = await this.prisma.aiUsageLog.groupBy({
            by: ['tenantId'],
            where: {
                tenantId: { in: tenants.map(t => t.id) },
                timestamp: { gte: start, lte: end },
                wasBlocked: false
            },
            _count: { id: true }
        });

        const todayUsageMap = new Map(
            todayUsageCounts.map(t => [t.tenantId, t._count.id])
        );

        const result: TenantUsage[] = tenants.map(tenant => {
            const todayUsage = todayUsageMap.get(tenant.id) || 0;
            const percentDailyUsed = Math.round((todayUsage / tenant.aiDailyLimit) * 100);
            const percentMonthlyUsed = Math.round((tenant.aiMonthlyUsage / tenant.aiMonthlyLimit) * 100);

            let status: 'OK' | 'WARNING' | 'BLOCKED' = 'OK';
            if (percentDailyUsed >= 100 || percentMonthlyUsed >= 100) {
                status = 'BLOCKED';
            } else if (percentDailyUsed >= 80 || percentMonthlyUsed >= 80) {
                status = 'WARNING';
            }

            return {
                tenantId: tenant.id,
                tenantName: tenant.name,
                aiPlan: tenant.aiPlan,
                aiTier: tenant.aiTier,
                todayUsage,
                dailyLimit: tenant.aiDailyLimit,
                monthlyUsage: tenant.aiMonthlyUsage,
                monthlyLimit: tenant.aiMonthlyLimit,
                percentDailyUsed,
                percentMonthlyUsed,
                status
            };
        });

        return { tenants: result, total };
    }

    /**
     * Get blocked requests breakdown
     */
    async getBlockedBreakdown(filter: 'today' | '7d' | '30d' | 'all' = 'today'): Promise<Record<string, number>> {
        const { start, end } = this.getDateRange(filter);

        const blockedByReason = await this.prisma.aiUsageLog.groupBy({
            by: ['blockReason'],
            where: {
                timestamp: { gte: start, lte: end },
                wasBlocked: true,
                blockReason: { not: null }
            },
            _count: { id: true }
        });

        const result: Record<string, number> = {};
        for (const item of blockedByReason) {
            if (item.blockReason) {
                result[item.blockReason] = item._count.id;
            }
        }

        return result;
    }

    /**
     * Get daily usage trends for chart display
     * Returns array of { date, count, blocked } for each day in range
     */
    async getDailyTrends(filter: '7d' | '30d' = '7d'): Promise<{ date: string; requests: number; blocked: number }[]> {
        const days = filter === '7d' ? 7 : 30;
        const results: { date: string; requests: number; blocked: number }[] = [];

        for (let i = days - 1; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            date.setHours(0, 0, 0, 0);
            const endOfDay = new Date(date);
            endOfDay.setHours(23, 59, 59, 999);

            const [requests, blocked] = await Promise.all([
                this.prisma.aiUsageLog.count({
                    where: { timestamp: { gte: date, lte: endOfDay } }
                }),
                this.prisma.aiUsageLog.count({
                    where: { timestamp: { gte: date, lte: endOfDay }, wasBlocked: true }
                })
            ]);

            results.push({
                date: date.toISOString().split('T')[0], // YYYY-MM-DD
                requests,
                blocked
            });
        }

        return results;
    }

    /**
     * Get tenant-specific daily trends for their billing dashboard
     */
    async getTenantDailyTrends(tenantId: string, filter: '7d' | '30d' = '7d'): Promise<{ date: string; requests: number }[]> {
        const days = filter === '7d' ? 7 : 30;
        const results: { date: string; requests: number }[] = [];

        for (let i = days - 1; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            date.setHours(0, 0, 0, 0);
            const endOfDay = new Date(date);
            endOfDay.setHours(23, 59, 59, 999);

            const requests = await this.prisma.aiUsageLog.count({
                where: {
                    tenantId,
                    timestamp: { gte: date, lte: endOfDay },
                    wasBlocked: false
                }
            });

            results.push({
                date: date.toISOString().split('T')[0],
                requests
            });
        }

        return results;
    }
}
