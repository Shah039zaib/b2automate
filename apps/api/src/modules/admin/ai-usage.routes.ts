/**
 * AI Usage Analytics Routes
 * 
 * Read-only endpoints for Super Admin AI monitoring.
 * All routes protected by requireSuperAdmin.
 */

import { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma';
import { requireSuperAdmin } from '../../middleware/rbac';
import { AiUsageService } from '../../services/ai-usage.service';
import z from 'zod';

const aiUsageService = new AiUsageService(prisma);

export async function aiUsageRoutes(app: FastifyInstance) {
    // All routes require SUPER_ADMIN
    app.addHook('preHandler', app.authenticate);
    app.addHook('preHandler', requireSuperAdmin);

    // ============================================
    // Overview Stats
    // ============================================
    app.get('/overview', {
        schema: {
            querystring: z.object({
                filter: z.enum(['today', '7d', '30d', 'all']).optional()
            })
        }
    }, async (req) => {
        const { filter = 'today' } = req.query as any;
        return aiUsageService.getOverview(filter);
    });

    // ============================================
    // Tier Breakdown
    // ============================================
    app.get('/by-tier', {
        schema: {
            querystring: z.object({
                filter: z.enum(['today', '7d', '30d', 'all']).optional()
            })
        }
    }, async (req) => {
        const { filter = 'today' } = req.query as any;
        return aiUsageService.getByTier(filter);
    });

    // ============================================
    // Per-Tenant Usage
    // ============================================
    app.get('/by-tenant', {
        schema: {
            querystring: z.object({
                filter: z.enum(['today', '7d', '30d', 'all']).optional(),
                limit: z.string().optional(),
                offset: z.string().optional()
            })
        }
    }, async (req) => {
        const { filter = 'today', limit = '20', offset = '0' } = req.query as any;
        return aiUsageService.getByTenant(filter, parseInt(limit), parseInt(offset));
    });

    // ============================================
    // Blocked Requests Breakdown
    // ============================================
    app.get('/blocked', {
        schema: {
            querystring: z.object({
                filter: z.enum(['today', '7d', '30d', 'all']).optional()
            })
        }
    }, async (req) => {
        const { filter = 'today' } = req.query as any;
        return aiUsageService.getBlockedBreakdown(filter);
    });

    // ============================================
    // Daily Trends (for charts)
    // ============================================
    app.get('/trends', {
        schema: {
            querystring: z.object({
                filter: z.enum(['7d', '30d']).optional()
            })
        }
    }, async (req) => {
        const { filter = '7d' } = req.query as any;
        return aiUsageService.getDailyTrends(filter);
    });
}
