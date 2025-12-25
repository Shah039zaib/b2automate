/**
 * Centralized Settings Access
 * 
 * ALWAYS use these helpers instead of direct Prisma queries.
 * Guarantees a valid row is returned, creating safely if needed.
 * 
 * SAFETY GUARANTEES:
 * - Returns valid object even on empty database
 * - Creates with safe defaults if missing
 * - Never throws on missing row
 */

import { PrismaClient, SystemSettings, GrowthSettings } from '@b2automate/database';
import { logger } from '@b2automate/logger';

// Default values (features OFF)
const SYSTEM_DEFAULTS: Omit<SystemSettings, 'updatedAt'> = {
    id: 'system',
    globalAiEnabled: false,
    globalWhatsappEnabled: false,
    defaultAiProvider: 'mock',
    openaiApiKey: null,              // SAFE: No API key exposed
    maxTenantsAllowed: 100,
    maxMessagesPerHour: 1000,
    // Email System (all OFF by default)
    emailEnabled: false,
    emailVerificationRequired: false,
    passwordResetEnabled: false,
    paymentEmailsEnabled: false,
    emailProvider: 'none',
    smtpHost: null,
    smtpPort: null,
    smtpUser: null,
    smtpPass: null,
    resendApiKey: null,
};

const GROWTH_DEFAULTS: Partial<GrowthSettings> = {
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
    updatedBy: null,
};

/**
 * Get SystemSettings with guaranteed return
 * Creates default row if not exists
 */
export async function getSystemSettings(prisma: PrismaClient): Promise<SystemSettings> {
    try {
        let settings = await prisma.systemSettings.findUnique({
            where: { id: 'system' }
        });

        if (!settings) {
            logger.info('SystemSettings not found, creating with safe defaults');
            settings = await prisma.systemSettings.create({
                data: SYSTEM_DEFAULTS
            });
        }

        return settings;
    } catch (error) {
        logger.error({ error }, 'Failed to get SystemSettings, returning safe defaults');
        // Return in-memory defaults if database fails
        return {
            ...SYSTEM_DEFAULTS,
            updatedAt: new Date()
        } as SystemSettings;
    }
}

/**
 * Get GrowthSettings with guaranteed return
 * Creates default row if not exists
 */
export async function getGrowthSettings(prisma: PrismaClient): Promise<GrowthSettings> {
    try {
        let settings = await prisma.growthSettings.findFirst();

        if (!settings) {
            logger.info('GrowthSettings not found, creating with safe defaults');
            settings = await prisma.growthSettings.create({
                data: GROWTH_DEFAULTS as any
            });
        }

        return settings;
    } catch (error) {
        logger.error({ error }, 'Failed to get GrowthSettings, returning safe defaults');
        // Return in-memory defaults if database fails
        return {
            id: 'default',
            ...GROWTH_DEFAULTS,
            updatedAt: new Date()
        } as GrowthSettings;
    }
}

/**
 * Check if system is in safe mode (database unavailable)
 */
export async function isDatabaseHealthy(prisma: PrismaClient): Promise<boolean> {
    try {
        await prisma.$queryRaw`SELECT 1`;
        return true;
    } catch {
        return false;
    }
}

/**
 * Safe system state for error responses
 */
export const SAFE_MODE_RESPONSE = {
    error: 'System is initializing. Please try again in a moment.',
    code: 'SYSTEM_INITIALIZING'
};
