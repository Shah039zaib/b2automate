import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import { logger } from '@b2automate/logger';
import { tenantContextMiddleware } from './middleware/tenant-context';
import Redis from 'ioredis';
import { prisma } from './lib/prisma';
import {
    serializerCompiler,
    validatorCompiler
} from 'fastify-type-provider-zod';

// ============================================
// SECURITY: JWT Secret Validation (HARD FAIL)
// ============================================
// Application MUST NOT start without a valid JWT secret
// This prevents token forgery attacks in production

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    logger.error('FATAL: JWT_SECRET environment variable is not set');
    logger.error('Application cannot start without a secure JWT secret');
    logger.error('Set JWT_SECRET in your environment variables');
    process.exit(1);
}

if (JWT_SECRET.length < 32) {
    logger.error('FATAL: JWT_SECRET must be at least 32 characters long');
    logger.error('Use a cryptographically secure random string');
    process.exit(1);
}

const app = Fastify({
    logger: true
});

// Set Zod type provider compilers for schema validation
app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

// Register Plugins
app.register(cors);
app.register(fastifyJwt, {
    secret: JWT_SECRET
});
// Rate Limit
import { rateLimitConfig } from './config/rate-limit';
app.register(rateLimitConfig);

// Global Error Handler (sanitizes errors for client)
import { createErrorHandler } from './middleware/error-handler';
app.setErrorHandler(createErrorHandler());

// Register Global Middleware
app.addHook('onRequest', tenantContextMiddleware);

// ============================================
// Performance Monitoring: API Response Time
// ============================================
// Track response time and log slow requests (>200ms)
const SLOW_THRESHOLD_MS = 200;

app.addHook('onRequest', async (request) => {
    request.startTime = Date.now();
});

app.addHook('onResponse', async (request, reply) => {
    const responseTime = Date.now() - (request.startTime || Date.now());

    // Add response time header
    reply.header('X-Response-Time', `${responseTime}ms`);

    // Log slow requests
    if (responseTime > SLOW_THRESHOLD_MS) {
        request.log.warn({
            url: request.url,
            method: request.method,
            responseTime,
            statusCode: reply.statusCode,
            threshold: SLOW_THRESHOLD_MS
        }, `Slow API response: ${responseTime}ms > ${SLOW_THRESHOLD_MS}ms`);
    }
});

// Health Check (includes DB status)
app.get('/health', async () => {
    let dbStatus = 'unknown';
    try {
        await prisma.$queryRaw`SELECT 1`;
        dbStatus = 'connected';
    } catch {
        dbStatus = 'disconnected';
    }
    return {
        status: 'ok',
        database: dbStatus,
        timestamp: new Date().toISOString()
    };
});

// Register Routes
import { authRoutes } from './modules/auth/auth.routes';
import { whatsappRoutes } from './modules/whatsapp/whatsapp.routes';
import { servicesRoutes } from './modules/services/services.routes';
import { ordersRoutes } from './modules/orders/orders.routes';
import { adminRoutes } from './modules/admin/admin.routes';
import { aiUsageRoutes } from './modules/admin/ai-usage.routes';
import { planRoutes } from './modules/admin/plan.routes';
import { tenantRoutes } from './modules/tenant/tenant.routes';
import { systemRoutes } from './modules/system/system.routes';
import { checkoutRoutes } from './modules/checkout/checkout.routes';
import { stripeWebhookRoutes } from './modules/webhooks/stripe.routes';
import { growthRoutes } from './modules/growth/growth.routes';
import { manualPaymentRoutes } from './modules/manual-payments/manual-payment.routes';

// Add authentication decorator for protected routes
// Includes blacklist check for revoked tokens (Issue 3 fix)
import { AuthService } from './modules/auth/auth.service';
import { AuditLogger } from './services/audit-logger';

// Lazy-initialized after prisma is ready
let blacklistAuthService: AuthService | null = null;

import { FastifyRequest, FastifyReply } from 'fastify';

app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
        await request.jwtVerify();

        // Initialize AuthService lazily on first request
        if (!blacklistAuthService) {
            blacklistAuthService = new AuthService(prisma, new AuditLogger(prisma));
        }

        // CRITICAL FIX: Set tenantId from verified JWT
        // Global middleware runs on 'onRequest' (before auth), so we must populate it here
        const user = request.user as { tenantId?: string } | undefined;
        if (user && user.tenantId) {
            request.tenantId = user.tenantId;
        }

        // SECURITY: Check if token was revoked via logout
        const authHeader = request.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
            const token = authHeader.slice(7);
            const isBlacklisted = await blacklistAuthService.isTokenBlacklisted(token);
            if (isBlacklisted) {
                return reply.code(401).send({ error: 'Token has been revoked' });
            }
        }
    } catch (err) {
        reply.send(err);
    }
});

app.register(authRoutes, { prefix: '/auth' });
app.register(whatsappRoutes, { prefix: '/whatsapp' });
app.register(servicesRoutes, { prefix: '/services' });
app.register(ordersRoutes, { prefix: '/orders' });
app.register(adminRoutes, { prefix: '/admin' });  // Super Admin routes
app.register(aiUsageRoutes, { prefix: '/admin/ai-usage' }); // AI Usage Dashboard
app.register(planRoutes, { prefix: '/admin/plans' }); // Plan management (Super Admin)
app.register(tenantRoutes, { prefix: '/tenant' }); // Tenant settings/team routes
app.register(systemRoutes, { prefix: '/system' }); // Global system settings
app.register(checkoutRoutes, { prefix: '/checkout' }); // Public checkout
app.register(stripeWebhookRoutes, { prefix: '/webhooks' }); // Stripe webhooks
app.register(growthRoutes); // Growth settings (mixed public + admin)
app.register(manualPaymentRoutes); // Manual payments (mixed user + admin)

// Phase 6A: Conversation Search
import { conversationRoutes } from './modules/conversations/conversation.routes';
app.register(conversationRoutes, { prefix: '/conversations' });

// Phase 6B: Scheduled Messages & Templates
import { scheduledMessageRoutes } from './modules/scheduled-messages/scheduled-message.routes';
import { templateRoutes } from './modules/templates/template.routes';
app.register(scheduledMessageRoutes, { prefix: '/scheduled-messages' });
app.register(templateRoutes, { prefix: '/templates' });

// Start Inbound Event Processor
import { startEventProcessor } from './workers/event-processor';
import { BootstrapService } from './services/bootstrap.service';
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
startEventProcessor(redis, prisma);

// Phase 6B: Scheduled Message Processor (started after DB verification)
import { Queue } from 'bullmq';
import { QUEUE_NAMES, OutboundMessagePayload } from '@b2automate/shared-types';
import { ScheduledMessageProcessor } from './workers/scheduled-message-processor';

// BullMQ requires proper connection config (Queue also needs maxRetriesPerRequest for consistency)
const redisConfig = {
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    maxRetriesPerRequest: null as null,
};
const outboundQueue = new Queue<OutboundMessagePayload>(QUEUE_NAMES.OUTBOUND_MESSAGES, { connection: redisConfig });

const start = async () => {
    try {
        // ============================================
        // DATABASE BOOTSTRAP (CRASH-SAFE)
        // ============================================
        // Ensures singleton rows exist before accepting requests
        // NEVER crashes the server on failure - logs and continues

        const bootstrapService = new BootstrapService(prisma);
        const bootstrapResult = await bootstrapService.runStartupBootstrap();

        if (!bootstrapResult.success) {
            logger.warn({ errors: bootstrapResult.errors },
                'BOOTSTRAP WARNING: Running with incomplete initialization');
        }

        // ============================================
        // START SCHEDULED MESSAGE PROCESSOR (PHASE 6B)
        // ============================================
        // Only start if database is reachable (bootstrap success)
        // This prevents error spam when DB is unreachable

        if (bootstrapResult.success) {
            const scheduledProcessor = new ScheduledMessageProcessor(prisma, outboundQueue);
            scheduledProcessor.start();
            logger.info('Scheduled message processor started (DB connected)');
        } else {
            logger.warn('Scheduled message processor NOT started (DB unreachable)');
        }

        const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
        await app.listen({ port, host: '0.0.0.0' });
        logger.info(`Server listening on port ${port}`);
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
};

start();

