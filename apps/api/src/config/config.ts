import { logger } from '@b2automate/logger';

/**
 * Configuration Loader
 * 
 * Centralized configuration management with:
 * - Environment-based separation
 * - Validation at startup
 * - Prepared for future secrets manager integration
 * 
 * Future: Replace getEnv with secrets manager calls
 * e.g., AWS Secrets Manager, GCP Secret Manager, HashiCorp Vault
 */

interface Config {
    // Server
    port: number;
    nodeEnv: string;

    // Database
    databaseUrl: string;

    // Redis
    redisUrl: string;

    // JWT
    jwtSecret: string;
    jwtAccessExpiry: string;
    jwtRefreshExpiry: string;

    // AI
    openaiApiKey: string | null;
    openrouterApiKey: string | null;
    openrouterModel: string;
    aiProvider: 'mock' | 'openai' | 'openrouter';

    // Rate Limiting
    rateLimitMax: number;
    rateLimitWindow: string;

    // WhatsApp
    whatsappMessageRateLimit: number;
    whatsappCustomerRateLimit: number;
    whatsappCustomerRateWindow: number; // seconds
}

/**
 * Get environment variable with optional default
 * Future: This function will call secrets manager
 */
function getEnv(key: string, defaultValue?: string): string {
    const value = process.env[key];
    if (value !== undefined) {
        return value;
    }
    if (defaultValue !== undefined) {
        return defaultValue;
    }
    throw new Error(`Missing required environment variable: ${key}`);
}

/**
 * Get optional environment variable
 */
function getOptionalEnv(key: string): string | null {
    return process.env[key] || null;
}

/**
 * Get environment variable as number
 */
function getEnvNumber(key: string, defaultValue: number): number {
    const value = process.env[key];
    if (value !== undefined) {
        const parsed = parseInt(value, 10);
        if (!isNaN(parsed)) {
            return parsed;
        }
    }
    return defaultValue;
}

/**
 * Load and validate configuration
 * Called once at application startup
 */
export function loadConfig(): Config {
    const config: Config = {
        // Server
        port: getEnvNumber('PORT', 3000),
        nodeEnv: getEnv('NODE_ENV', 'development'),

        // Database
        databaseUrl: getEnv('DATABASE_URL'),

        // Redis
        redisUrl: getEnv('REDIS_URL', 'redis://localhost:6379'),

        // JWT (validated in index.ts already)
        jwtSecret: getEnv('JWT_SECRET'),
        jwtAccessExpiry: getEnv('JWT_ACCESS_EXPIRY', '15m'),
        jwtRefreshExpiry: getEnv('JWT_REFRESH_EXPIRY', '7d'),

        // AI
        openaiApiKey: getOptionalEnv('OPENAI_API_KEY'),
        openrouterApiKey: getOptionalEnv('OPENROUTER_API_KEY'),
        openrouterModel: getEnv('OPENROUTER_MODEL', 'google/gemini-2.0-flash-exp:free'),
        aiProvider: (getEnv('AI_PROVIDER', 'mock') as 'mock' | 'openai' | 'openrouter'),

        // Rate Limiting
        rateLimitMax: getEnvNumber('RATE_LIMIT_MAX', 100),
        rateLimitWindow: getEnv('RATE_LIMIT_WINDOW', '1 minute'),

        // WhatsApp
        whatsappMessageRateLimit: getEnvNumber('WHATSAPP_MESSAGE_RATE_LIMIT', 5),
        whatsappCustomerRateLimit: getEnvNumber('WHATSAPP_CUSTOMER_RATE_LIMIT', 10),
        whatsappCustomerRateWindow: getEnvNumber('WHATSAPP_CUSTOMER_RATE_WINDOW', 60), // 10 messages per 60 seconds per customer
    };

    // Log configuration (without secrets)
    logger.info({
        port: config.port,
        nodeEnv: config.nodeEnv,
        aiProvider: config.aiProvider,
        rateLimitMax: config.rateLimitMax,
    }, 'Configuration loaded');

    return config;
}

// Singleton config instance
let configInstance: Config | null = null;

/**
 * Get configuration (lazy load)
 */
export function getConfig(): Config {
    if (!configInstance) {
        configInstance = loadConfig();
    }
    return configInstance;
}

/**
 * Check if running in production
 */
export function isProduction(): boolean {
    return getConfig().nodeEnv === 'production';
}

/**
 * Check if running in development
 */
export function isDevelopment(): boolean {
    return getConfig().nodeEnv === 'development';
}
