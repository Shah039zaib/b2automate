import 'dotenv/config';
import { Worker } from 'bullmq';
import { logger } from '@b2automate/logger';
import { QUEUE_NAMES, OutboundMessagePayload, WorkerCommandPayload } from '@b2automate/shared-types';
import Redis from 'ioredis';
import { SessionManager } from './session-manager';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redisConnection = new Redis(redisUrl);

// Event Queue (Worker -> API)
import { Queue } from 'bullmq';
import { InboundEventPayload } from '@b2automate/shared-types';
const inboundQueue = new Queue<InboundEventPayload>(QUEUE_NAMES.INBOUND_EVENTS, { connection: redisConnection });

const sessionManager = new SessionManager(redisUrl, inboundQueue);

async function startWorker() {
    // ... (omitted for brevity, just verify imports)

    logger.info('Starting WhatsApp Worker Service...');

    // 1. Command Worker (Control Plane)
    const commandWorker = new Worker<WorkerCommandPayload>(
        QUEUE_NAMES.WORKER_COMMANDS,
        async (job) => {
            const { type, tenantId } = job.data;
            logger.info({ type, tenantId }, 'Processing command');

            try {
                if (type === 'START_SESSION') {
                    await sessionManager.startSession(tenantId);
                } else if (type === 'STOP_SESSION') {
                    await sessionManager.getSession(tenantId).then(sock => sock?.end(undefined));
                    await sessionManager.cleanupSession(tenantId);
                }
            } catch (err) {
                logger.error({ err, tenantId }, 'Command failed');
                throw err;
            }
        },
        { connection: redisConnection }
    );

    // 2. Outbound Message Worker (Data Plane)
    const messageWorker = new Worker<OutboundMessagePayload>(
        QUEUE_NAMES.OUTBOUND_MESSAGES,
        async (job) => {
            const { tenantId, to, content, type } = job.data;
            logger.info({ jobId: job.id, tenantId }, 'Processing outbound message');

            // Auto-start session if missing (Lazy Loading)
            let sock = await sessionManager.getSession(tenantId);
            if (!sock) {
                logger.warn({ tenantId }, 'Session missing, attempting to start...');
                await sessionManager.startSession(tenantId);
                // Wait a bit for connection? Or just fail and retry?
                // For stability, we fail this attempt and rely on BullMQ exponential backoff
                // The startSession call triggers async connection.
                throw new Error('Session not ready. Triggered start. Retrying...');
            }

            // Check Real Connection Status logic (simplified)
            // Baileys doesn't expose a simple "isConnected" property on socket, needs state tracking.
            // But sendPresenceUpdate or sendMessage will throw if disconnected.

            // Jitter / Rate Limit Enforcement (Naive implementation for Phase 2)
            await new Promise(r => setTimeout(r, Math.random() * 2000 + 500)); // 0.5s - 2.5s Jitter

            try {
                // Construct message
                const jid = to.includes('@s.whatsapp.net') ? to : `${to}@s.whatsapp.net`;
                const msgContent = typeof content === 'string' ? { text: content } : content;

                await sock.sendMessage(jid, msgContent as any);
            } catch (err) {
                logger.error({ err }, 'Baileys sendMessage failed');
                throw err; // Trigger retry
            }
        },
        {
            connection: redisConnection,
            limiter: {
                max: 5, // 5 messages
                duration: 1000, // per second (per worker instance, but good enough)
                // groupKey: 'tenantId' // Not supported in OSS
                // Standard BullMQ limiter is global for the queue.
                // For per-tenant rate limiting without BullMQ Pro, we'd handle it manually or use separate queues (bad scaling).
                // For Phase 2, we skip strict BullMQ-enforced per-tenant limit and stick to Jitter + Serial processing if concurrency is 1.
            },
            concurrency: 5 // Process 5 messages in parallel (across tenants)
        }
    );

    commandWorker.on('failed', (job, err) => logger.error({ id: job?.id, err }, 'Command Job failed'));
    messageWorker.on('failed', (job, err) => logger.error({ id: job?.id, err }, 'Message Job failed'));

    logger.info(`Listening on queues: ${QUEUE_NAMES.WORKER_COMMANDS}, ${QUEUE_NAMES.OUTBOUND_MESSAGES}`);
}

startWorker().catch(err => {
    logger.error({ err }, 'Worker failed to start');
    process.exit(1);
});
