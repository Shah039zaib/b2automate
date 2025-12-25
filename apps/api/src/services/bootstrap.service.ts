/**
 * Bootstrap Service
 * 
 * CRITICAL: This service ensures database singleton rows exist at startup.
 * 
 * SAFETY GUARANTEES:
 * - Idempotent: Safe to run multiple times
 * - Non-destructive: Never deletes or overwrites existing data
 * - Features OFF by default: No auto-enabling of AI, WhatsApp, or billing
 * - Crash-resistant: Logs errors but never crashes the server
 */

import { PrismaClient } from '@b2automate/database';
import { logger } from '@b2automate/logger';

/**
 * Safe default values for SystemSettings
 * ALL FEATURES DISABLED BY DEFAULT
 */
const SYSTEM_SETTINGS_DEFAULTS = {
    id: 'system',
    globalAiEnabled: false,          // SAFE: AI disabled
    globalWhatsappEnabled: false,    // SAFE: WhatsApp disabled
    defaultAiProvider: 'mock',       // SAFE: Mock provider
    openaiApiKey: null,              // SAFE: No API key
    maxTenantsAllowed: 100,
    maxMessagesPerHour: 1000,
};

/**
 * Safe default values for GrowthSettings
 * ALL MARKETING FEATURES DISABLED BY DEFAULT
 */
const GROWTH_SETTINGS_DEFAULTS = {
    gaEnabled: false,                // SAFE: Analytics disabled
    gaMeasurementId: null,
    fbPixelEnabled: false,           // SAFE: Pixel disabled
    fbPixelId: null,
    couponEnabled: false,            // SAFE: Coupon disabled
    couponCode: null,
    couponType: null,
    couponValue: null,
    couponMessage: null,
    couponExpiresAt: null,
    couponStripeCouponId: null,
};

export class BootstrapService {
    constructor(private prisma: PrismaClient) { }

    /**
     * Ensure SystemSettings row exists
     * Creates with SAFE DEFAULTS if missing
     */
    async ensureSystemSettings(): Promise<void> {
        try {
            const existing = await this.prisma.systemSettings.findUnique({
                where: { id: 'system' }
            });

            if (!existing) {
                await this.prisma.systemSettings.create({
                    data: SYSTEM_SETTINGS_DEFAULTS
                });
                logger.info('SystemSettings created with safe defaults (AI: OFF, WhatsApp: OFF)');
            } else {
                logger.debug('SystemSettings already exists, skipping creation');
            }
        } catch (error) {
            // Log but don't throw - let server continue
            logger.error({ error }, 'Failed to ensure SystemSettings - will retry on access');
        }
    }

    /**
     * Ensure GrowthSettings row exists
     * Creates with SAFE DEFAULTS if missing
     */
    async ensureGrowthSettings(): Promise<void> {
        try {
            const existing = await this.prisma.growthSettings.findFirst();

            if (!existing) {
                await this.prisma.growthSettings.create({
                    data: GROWTH_SETTINGS_DEFAULTS as any
                });
                logger.info('GrowthSettings created with safe defaults (Analytics: OFF, Coupon: OFF)');
            } else {
                logger.debug('GrowthSettings already exists, skipping creation');
            }
        } catch (error) {
            // Log but don't throw - let server continue
            logger.error({ error }, 'Failed to ensure GrowthSettings - will retry on access');
        }
    }

    /**
     * Run complete startup bootstrap
     * 
     * MUST be called before server starts accepting requests
     * NEVER crashes the server on failure
     */
    async runStartupBootstrap(): Promise<{ success: boolean; errors: string[] }> {
        const errors: string[] = [];

        logger.info('=== DATABASE BOOTSTRAP STARTING ===');

        try {
            // Test database connection first
            await this.prisma.$queryRaw`SELECT 1`;
            logger.info('Database connection verified');
        } catch (error: any) {
            const msg = 'Database connection failed - bootstrap aborted';
            logger.error({ error: error.message }, msg);
            errors.push(msg);
            return { success: false, errors };
        }

        // Bootstrap SystemSettings
        try {
            await this.ensureSystemSettings();
        } catch (error: any) {
            errors.push(`SystemSettings: ${error.message}`);
        }

        // Bootstrap GrowthSettings
        try {
            await this.ensureGrowthSettings();
        } catch (error: any) {
            errors.push(`GrowthSettings: ${error.message}`);
        }

        if (errors.length > 0) {
            logger.warn({ errors }, 'Bootstrap completed with errors - some features may fail');
            return { success: false, errors };
        }

        logger.info('=== DATABASE BOOTSTRAP COMPLETE ===');
        return { success: true, errors: [] };
    }
}
