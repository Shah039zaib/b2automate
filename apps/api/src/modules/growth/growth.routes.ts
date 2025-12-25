/**
 * Growth Routes
 * 
 * Admin: GET/PATCH /admin/growth/settings (Super Admin only)
 * Public: GET /growth/settings (no auth)
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { GrowthService } from '../../services/growth.service';
import { requireSuperAdmin } from '../../middleware/rbac';
import { logger } from '@b2automate/logger';

const growthService = new GrowthService(prisma);

// Validation schema for updating settings
const updateSettingsSchema = z.object({
    gaEnabled: z.boolean().optional(),
    gaMeasurementId: z.string().nullable().optional(),
    fbPixelEnabled: z.boolean().optional(),
    fbPixelId: z.string().nullable().optional(),
    couponEnabled: z.boolean().optional(),
    couponCode: z.string().nullable().optional(),
    couponType: z.enum(['PERCENTAGE', 'FIXED']).nullable().optional(),
    couponValue: z.number().int().min(0).max(10000).nullable().optional(),
    couponMessage: z.string().nullable().optional(),
    couponExpiresAt: z.string().datetime().nullable().optional(),
    couponStripeCouponId: z.string().nullable().optional(),
});

export async function growthRoutes(app: FastifyInstance) {
    // ============================================
    // ADMIN ROUTES (Super Admin Only)
    // ============================================

    /**
     * GET /admin/growth/settings
     * Get all growth settings (Super Admin only)
     */
    app.get('/admin/growth/settings', {
        // SECURITY: Explicit JWT auth before RBAC check
        preHandler: [app.authenticate, requireSuperAdmin]
    }, async (request, reply) => {
        try {
            const settings = await growthService.getSettings();

            return reply.send({
                gaEnabled: settings.gaEnabled,
                gaMeasurementId: settings.gaMeasurementId || '',
                fbPixelEnabled: settings.fbPixelEnabled,
                fbPixelId: settings.fbPixelId || '',
                couponEnabled: settings.couponEnabled,
                couponCode: settings.couponCode || '',
                couponDiscountType: settings.couponType?.toLowerCase() || 'percentage',
                couponDiscountValue: settings.couponValue || 0,
                couponMessage: settings.couponMessage || '',
                couponExpiry: settings.couponExpiresAt?.toISOString() || null,
                couponStripeCouponId: settings.couponStripeCouponId || '',
                updatedAt: settings.updatedAt.toISOString()
            });
        } catch (error) {
            logger.error({ error }, 'Failed to get growth settings');
            return reply.status(500).send({ error: 'Failed to get settings' });
        }
    });

    /**
     * PATCH /admin/growth/settings
     * Update growth settings (Super Admin only)
     */
    app.patch('/admin/growth/settings', {
        // SECURITY: Explicit JWT auth before RBAC check
        preHandler: [app.authenticate, requireSuperAdmin]
    }, async (request, reply) => {
        try {
            const input = updateSettingsSchema.parse(request.body);
            const user = (request as any).user;

            // Convert datetime string to Date
            const data: any = { ...input };
            if (input.couponExpiresAt !== undefined) {
                data.couponExpiresAt = input.couponExpiresAt
                    ? new Date(input.couponExpiresAt)
                    : null;
            }

            // Validate percentage
            if (input.couponType === 'PERCENTAGE' && input.couponValue !== undefined && input.couponValue !== null) {
                if (input.couponValue > 100) {
                    return reply.status(400).send({ error: 'Percentage discount cannot exceed 100' });
                }
            }

            const settings = await growthService.updateSettings(data, user.id);

            // Create audit log for platform-level action
            // Using a system tenant ID for platform actions
            await prisma.auditLog.create({
                data: {
                    tenantId: user.tenantId, // Super admin's tenant
                    actorUserId: user.id,
                    eventType: 'GROWTH_SETTINGS_UPDATED',
                    metadata: {
                        changes: Object.keys(input),
                        gaEnabled: settings.gaEnabled,
                        fbPixelEnabled: settings.fbPixelEnabled,
                        couponEnabled: settings.couponEnabled
                    },
                    ipAddress: request.ip
                }
            });

            logger.info({ userId: user.id, changes: Object.keys(input) }, 'Growth settings updated');

            return reply.send({
                gaEnabled: settings.gaEnabled,
                gaMeasurementId: settings.gaMeasurementId || '',
                fbPixelEnabled: settings.fbPixelEnabled,
                fbPixelId: settings.fbPixelId || '',
                couponEnabled: settings.couponEnabled,
                couponCode: settings.couponCode || '',
                couponDiscountType: settings.couponType?.toLowerCase() || 'percentage',
                couponDiscountValue: settings.couponValue || 0,
                couponMessage: settings.couponMessage || '',
                couponExpiry: settings.couponExpiresAt?.toISOString() || null,
                couponStripeCouponId: settings.couponStripeCouponId || '',
                updatedAt: settings.updatedAt.toISOString()
            });
        } catch (error: any) {
            if (error.name === 'ZodError') {
                return reply.status(400).send({ error: 'Invalid input', details: error.errors });
            }
            logger.error({ error }, 'Failed to update growth settings');
            return reply.status(500).send({ error: error.message || 'Failed to update settings' });
        }
    });

    // ============================================
    // PUBLIC ROUTES (No Auth Required)
    // ============================================

    /**
     * GET /growth/settings
     * Public endpoint for frontend to fetch analytics and coupon config
     */
    app.get('/growth/settings', async (request, reply) => {
        try {
            const settings = await growthService.getPublicSettings();
            return reply.send(settings);
        } catch (error) {
            logger.error({ error }, 'Failed to get public growth settings');
            return reply.status(500).send({ error: 'Failed to get settings' });
        }
    });
}
