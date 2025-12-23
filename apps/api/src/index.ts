import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import { logger } from '@b2automate/logger';
import { tenantContextMiddleware } from './middleware/tenant-context';
import Redis from 'ioredis';
import { PrismaClient } from '@b2automate/database';
// import { authRoutes } from './modules/auth/auth.routes';

const app = Fastify({
    logger: true
});

// Register Plugins
app.register(cors);
app.register(fastifyJwt, {
    secret: process.env.JWT_SECRET || 'supersecret_dev_key' // In prod, rely on env
});
// Rate Limit
import { rateLimitConfig } from './config/rate-limit';
app.register(rateLimitConfig);

// Register Global Middleware
app.addHook('onRequest', tenantContextMiddleware);

// Health Check
app.get('/health', async () => {
    return { status: 'ok' };
});

// Register Routes
import { authRoutes } from './modules/auth/auth.routes';
import { whatsappRoutes } from './modules/whatsapp/whatsapp.routes';
import { servicesRoutes } from './modules/services/services.routes';
import { ordersRoutes } from './modules/orders/orders.routes';

app.register(authRoutes, { prefix: '/auth' });
app.register(whatsappRoutes, { prefix: '/whatsapp' });
app.register(servicesRoutes, { prefix: '/services' });
app.register(ordersRoutes, { prefix: '/orders' });

// Start Inbound Event Processor
import { startEventProcessor } from './workers/event-processor';
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const prisma = new PrismaClient(); // Ensure we use one instance if possible, but for simplicity here new
startEventProcessor(redis, prisma);

const start = async () => {
    try {
        const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
        await app.listen({ port, host: '0.0.0.0' });
        logger.info(`Server listening on port ${port}`);
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
};

start();
