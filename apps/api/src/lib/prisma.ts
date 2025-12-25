import { PrismaClient } from '@b2automate/database';
import { logger } from '@b2automate/logger';

/**
 * PrismaClient Singleton
 * 
 * IMPORTANT: This is the ONLY PrismaClient instance for the entire application.
 * Do NOT create new PrismaClient() instances elsewhere.
 * 
 * Import this instance instead:
 * import { prisma } from '../lib/prisma';
 */

// Prevent multiple instances in development with hot reload
declare global {
    var __prisma: PrismaClient | undefined;
}

const prisma = globalThis.__prisma ?? new PrismaClient({
    log: process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error']
});

if (process.env.NODE_ENV !== 'production') {
    globalThis.__prisma = prisma;
}

// Graceful shutdown
process.on('beforeExit', async () => {
    logger.info('Disconnecting Prisma Client...');
    await prisma.$disconnect();
});

export { prisma };
