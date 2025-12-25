/**
 * Growth Service
 * 
 * Manages platform-wide growth settings (analytics, pixel, coupon)
 * Singleton pattern - only one settings row exists
 */

import { PrismaClient, GrowthSettings, CouponType } from '@b2automate/database';
import { logger } from '@b2automate/logger';

const DEFAULT_SETTINGS = {
    gaEnabled: false,
    gaMeasurementId: null,
    fbPixelEnabled: false,
    fbPixelId: null,
    couponEnabled: false,
    couponCode: null,
    couponType: null,
    couponValue: null,
    couponMessage: null,
    couponExpiresAt: null,
    couponStripeCouponId: null,
};

export interface UpdateGrowthSettingsInput {
    gaEnabled?: boolean;
    gaMeasurementId?: string | null;
    fbPixelEnabled?: boolean;
    fbPixelId?: string | null;
    couponEnabled?: boolean;
    couponCode?: string | null;
    couponType?: CouponType | null;
    couponValue?: number | null;
    couponMessage?: string | null;
    couponExpiresAt?: Date | null;
    couponStripeCouponId?: string | null;
}

export interface PublicGrowthSettings {
    gaEnabled: boolean;
    gaMeasurementId: string | null;
    fbPixelEnabled: boolean;
    fbPixelId: string | null;
    couponEnabled: boolean;
    couponCode: string | null;
    couponDiscountType: 'percentage' | 'fixed' | null;
    couponDiscountValue: number | null;
    couponMessage: string | null;
    couponExpiry: string | null;
    couponStripeCouponId: string | null;
}

export class GrowthService {
    constructor(private prisma: PrismaClient) { }

    /**
     * Get or create the singleton settings row
     */
    async getSettings(): Promise<GrowthSettings> {
        let settings = await this.prisma.growthSettings.findFirst();

        if (!settings) {
            logger.info('Creating default growth settings');
            settings = await this.prisma.growthSettings.create({
                data: DEFAULT_SETTINGS as any
            });
        }

        // Auto-disable expired coupons
        if (settings.couponEnabled && settings.couponExpiresAt) {
            if (new Date(settings.couponExpiresAt) < new Date()) {
                logger.info('Coupon expired, auto-disabling');
                settings = await this.prisma.growthSettings.update({
                    where: { id: settings.id },
                    data: { couponEnabled: false }
                });
            }
        }

        return settings;
    }

    /**
     * Update settings (Super Admin only)
     */
    async updateSettings(
        input: UpdateGrowthSettingsInput,
        actorUserId: string
    ): Promise<GrowthSettings> {
        const current = await this.getSettings();

        // Validate coupon value
        if (input.couponType === 'PERCENTAGE' && input.couponValue !== undefined && input.couponValue !== null) {
            if (input.couponValue < 0 || input.couponValue > 100) {
                throw new Error('Percentage discount must be between 0 and 100');
            }
        }

        if (input.couponType === 'FIXED' && input.couponValue !== undefined && input.couponValue !== null) {
            if (input.couponValue < 0) {
                throw new Error('Fixed discount cannot be negative');
            }
        }

        // Update settings
        const updated = await this.prisma.growthSettings.update({
            where: { id: current.id },
            data: {
                ...input,
                updatedBy: actorUserId
            }
        });

        logger.info({
            actorUserId,
            changes: Object.keys(input)
        }, 'Growth settings updated');

        return updated;
    }

    /**
     * Get public-facing settings (no auth required)
     * Excludes admin metadata
     */
    async getPublicSettings(): Promise<PublicGrowthSettings> {
        const settings = await this.getSettings();

        // Check expiry for public response
        let couponEnabled = settings.couponEnabled;
        if (couponEnabled && settings.couponExpiresAt) {
            if (new Date(settings.couponExpiresAt) < new Date()) {
                couponEnabled = false;
            }
        }

        return {
            gaEnabled: settings.gaEnabled,
            gaMeasurementId: settings.gaMeasurementId,
            fbPixelEnabled: settings.fbPixelEnabled,
            fbPixelId: settings.fbPixelId,
            couponEnabled,
            couponCode: couponEnabled ? settings.couponCode : null,
            couponDiscountType: settings.couponType?.toLowerCase() as 'percentage' | 'fixed' | null,
            couponDiscountValue: couponEnabled ? settings.couponValue : null,
            couponMessage: couponEnabled ? settings.couponMessage : null,
            couponExpiry: settings.couponExpiresAt?.toISOString() || null,
            couponStripeCouponId: couponEnabled ? settings.couponStripeCouponId : null,
        };
    }

    /**
     * Get active coupon for Stripe checkout
     * Returns null if no valid coupon
     */
    async getActiveCoupon(): Promise<{ couponId: string; code: string } | null> {
        const settings = await this.getSettings();

        if (!settings.couponEnabled || !settings.couponStripeCouponId) {
            return null;
        }

        // Check expiry
        if (settings.couponExpiresAt && new Date(settings.couponExpiresAt) < new Date()) {
            return null;
        }

        return {
            couponId: settings.couponStripeCouponId,
            code: settings.couponCode || ''
        };
    }
}
