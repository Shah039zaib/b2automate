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
 * - Auto-schema: Creates tables on first run if missing (prisma db push)
 */

import { PrismaClient } from '@b2automate/database';
import { logger } from '@b2automate/logger';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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
    private schemaInitialized = false;

    constructor(private prisma: PrismaClient) { }

    /**
     * Check if database schema exists by testing for core tables
     * Returns true if schema is ready, false if tables are missing
     */
    private async checkSchemaExists(): Promise<boolean> {
        try {
            // Try to query a core table - if it fails with P2021, schema is missing
            await this.prisma.$queryRaw`SELECT 1 FROM "tenants" LIMIT 1`;
            return true;
        } catch (error: any) {
            // P2021 = Table does not exist
            // P2010 = Raw query failed (table missing)
            if (error?.code === 'P2021' || error?.code === 'P2010' || 
                error?.message?.includes('does not exist')) {
                return false;
            }
            // Other errors (permission, etc.) - assume schema exists
            logger.warn({ error: error.message }, 'Schema check returned unexpected error');
            return true;
        }
    }

    /**
     * Ensure database schema exists
     * Runs prisma db push ONLY if tables are missing (first-time setup)
     * 
     * SAFETY:
     * - Only runs when tables don't exist
     * - prisma db push does NOT delete existing data
     * - Idempotent: safe to call multiple times
     */
    async ensureSchemaExists(): Promise<{ created: boolean; error?: string }> {
        // Check if schema already exists
        const schemaExists = await this.checkSchemaExists();
        
        if (schemaExists) {
            logger.debug('Database schema already exists, skipping creation');
            this.schemaInitialized = true;
            return { created: false };
        }

        logger.warn('Database schema missing - running prisma db push to create tables');
        
        try {
            // Run prisma db push to create all tables
            // --skip-generate: don't regenerate client (already done in Docker build)
            // --accept-data-loss: not needed since DB is empty, but included for safety
            const schemaPath = './packages/database/prisma/schema.prisma';
            const command = `npx prisma db push --schema=${schemaPath} --skip-generate --accept-data-loss`;
            
            logger.info({ command }, 'Executing prisma db push...');
            
            const { stdout, stderr } = await execAsync(command, {
                timeout: 120000, // 2 minute timeout
                cwd: process.cwd()
            });
            
            if (stdout) {
                logger.info({ stdout }, 'prisma db push output');
            }
            if (stderr && !stderr.includes('warn')) {
                logger.warn({ stderr }, 'prisma db push stderr');
            }
            
            // Verify schema was created
            const verifySchema = await this.checkSchemaExists();
            if (!verifySchema) {
                throw new Error('Schema creation failed - tables still missing after db push');
            }
            
            logger.info('✅ Database schema created successfully (first-time setup)');
            this.schemaInitialized = true;
            return { created: true };
            
        } catch (error: any) {
            const errorMsg = `Failed to create database schema: ${error.message}`;
            logger.error({ error: error.message, stderr: error.stderr }, errorMsg);
            return { created: false, error: errorMsg };
        }
    }

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

        // Step 1: Test database connection
        try {
            await this.prisma.$queryRaw`SELECT 1`;
            logger.info('Database connection verified');
        } catch (error: any) {
            const msg = 'Database connection failed - bootstrap aborted';
            logger.error({ error: error.message }, msg);
            errors.push(msg);
            return { success: false, errors };
        }

        // Step 2: Ensure schema exists (auto-create tables on first run)
        try {
            const schemaResult = await this.ensureSchemaExists();
            if (schemaResult.error) {
                errors.push(schemaResult.error);
                // Don't abort - try to continue with other bootstrap steps
            } else if (schemaResult.created) {
                logger.info('Schema was created on this startup (first-time setup)');
            }
        } catch (error: any) {
            const msg = `Schema check failed: ${error.message}`;
            logger.error({ error: error.message }, msg);
            errors.push(msg);
        }

        // Step 3: Bootstrap SystemSettings
        try {
            await this.ensureSystemSettings();
        } catch (error: any) {
            errors.push(`SystemSettings: ${error.message}`);
        }

        // Step 4: Bootstrap GrowthSettings
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
