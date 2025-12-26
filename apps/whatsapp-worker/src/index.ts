import 'dotenv/config';
import { Worker } from 'bullmq';
import { logger } from '@b2automate/logger';
import { QUEUE_NAMES, OutboundMessagePayload, WorkerCommandPayload } from '@b2automate/shared-types';
import Redis from 'ioredis';
import { SessionManager } from './session-manager';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Main Redis connection for general operations
const redisConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });

// BullMQ requires maxRetriesPerRequest: null - we pass connection config to workers
const bullmqConnectionConfig = {
    host: new URL(redisUrl.replace('redis://', 'http://')).hostname || 'localhost',
    port: parseInt(new URL(redisUrl.replace('redis://', 'http://')).port || '6379'),
    maxRetriesPerRequest: null as null,
};

// Per-customer rate limiting configuration
const CUSTOMER_RATE_LIMIT = parseInt(process.env.WHATSAPP_CUSTOMER_RATE_LIMIT || '10', 10); // 10 messages
const CUSTOMER_RATE_WINDOW = parseInt(process.env.WHATSAPP_CUSTOMER_RATE_WINDOW || '60', 10); // per 60 seconds

/**
 * Check and increment per-customer message count
 * Returns true if within rate limit, false if exceeded
 */
async function checkCustomerRateLimit(tenantId: string, customerJid: string): Promise<boolean> {
    const key = `rate:customer:${tenantId}:${customerJid}`;
    const count = await redisConnection.incr(key);

    // Set expiry on first increment
    if (count === 1) {
        await redisConnection.expire(key, CUSTOMER_RATE_WINDOW);
    }

    if (count > CUSTOMER_RATE_LIMIT) {
        logger.warn({ tenantId, customerJid, count, limit: CUSTOMER_RATE_LIMIT },
            'Customer rate limit exceeded - message blocked');
        return false;
    }

    return true;
}

import { Queue } from 'bullmq';
import { InboundEventPayload } from '@b2automate/shared-types';

// Queue with retry configuration
const defaultJobOptions = {
    attempts: 3,
    backoff: {
        type: 'exponential' as const,
        delay: 1000, // Start with 1 second, then 2s, 4s
    },
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 500, // Keep last 500 failed jobs for DLQ visibility
};

const inboundQueue = new Queue<InboundEventPayload>(QUEUE_NAMES.INBOUND_EVENTS, {
    connection: redisConnection,
    defaultJobOptions,
});

const sessionManager = new SessionManager(redisUrl, inboundQueue);

async function startWorker() {
    // ... (omitted for brevity, just verify imports)

    logger.info('Starting WhatsApp Worker Service...');

    // ============================================
    // BullMQ Worker Configuration (Retry + DLQ)
    // ============================================
    // Failed jobs will be logged and kept in 'failed' state for admin review
    const workerOptions = {
        connection: bullmqConnectionConfig,
        // Concurrency limit
        concurrency: 5,
    };

    // Job default options for retry + backoff (applied via Queue, but workers handle failures)
    const handleFailedJob = (jobId: string | undefined, error: Error, queueName: string) => {
        logger.error({
            jobId,
            queue: queueName,
            error: error.message,
            // This log serves as DLQ visibility - failed jobs remain in Redis failed set
        }, 'JOB_FAILED_PERMANENTLY: Job exhausted all retries');
    };

    // 1. Command Worker (Control Plane)
    const commandWorker = new Worker<WorkerCommandPayload>(
        QUEUE_NAMES.WORKER_COMMANDS,
        async (job) => {
            const { type, tenantId } = job.data;
            logger.info({ type, tenantId, attempt: job.attemptsMade + 1 }, 'Processing command');

            try {
                if (type === 'START_SESSION') {
                    await sessionManager.startSession(tenantId);
                } else if (type === 'STOP_SESSION') {
                    await sessionManager.getSession(tenantId).then(sock => sock?.end(undefined));
                    await sessionManager.cleanupSession(tenantId);
                }
            } catch (err) {
                logger.error({ err, tenantId, attempt: job.attemptsMade + 1 }, 'Command failed');
                throw err; // Rethrow to trigger retry
            }
        },
        workerOptions
    );

    // Log permanently failed command jobs
    commandWorker.on('failed', (job, err) => {
        if (job && job.attemptsMade >= 3) {
            handleFailedJob(job.id, err, QUEUE_NAMES.WORKER_COMMANDS);
        }
    });

    // 2. Outbound Message Worker (Data Plane)
    const messageWorker = new Worker<OutboundMessagePayload>(
        QUEUE_NAMES.OUTBOUND_MESSAGES,
        async (job) => {
            const { tenantId, to, content, type } = job.data;
            logger.info({ jobId: job.id, tenantId }, 'Processing outbound message');

            // ============================================
            // Per-Customer Rate Limiting
            // ============================================
            const isAllowed = await checkCustomerRateLimit(tenantId, to);
            if (!isAllowed) {
                // Skip this message - customer has received too many messages
                logger.info({ tenantId, to }, 'Message skipped due to customer rate limit');
                return; // Complete job without sending
            }

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

            try {
                // Construct JID
                const jid = to.includes('@s.whatsapp.net') ? to : `${to}@s.whatsapp.net`;

                // ============================================
                // Build message content based on type
                // ============================================
                let msgContent: any;
                let messageText = '';

                if (type === 'text') {
                    // Text message
                    msgContent = typeof content === 'string' ? { text: content } : content;
                    messageText = typeof content === 'string' ? content : '';
                } else if (type === 'image') {
                    // Image message
                    const imageData = typeof content === 'object' ? content : { url: content };
                    msgContent = {
                        image: { url: (imageData as any).url },
                        caption: (imageData as any).caption || ''
                    };
                    messageText = (imageData as any).caption || '[Image]';
                } else if (type === 'audio') {
                    // Audio/Voice message
                    const audioData = typeof content === 'object' ? content : { url: content };
                    msgContent = {
                        audio: { url: (audioData as any).url },
                        mimetype: 'audio/mp4',
                        ptt: true // Play as voice note
                    };
                    messageText = '[Voice Message]';
                } else {
                    // Document (any other type treated as document)
                    const docData = typeof content === 'object' ? content : { url: content };
                    msgContent = {
                        document: { url: (docData as any).url },
                        mimetype: (docData as any).mimetype || 'application/octet-stream',
                        fileName: (docData as any).fileName || 'document'
                    };
                    messageText = (docData as any).fileName || '[Document]';
                }

                // ============================================
                // Anti-Ban: Human-like Behavior
                // ============================================

                // 1. Mark as "online" presence
                await sock.sendPresenceUpdate('available', jid);

                // 2. Initial delay (reading the message) - 0.5s to 1.5s
                const readDelay = Math.random() * 1000 + 500;
                await new Promise(r => setTimeout(r, readDelay));

                // 3. Send "composing" (typing indicator)
                await sock.sendPresenceUpdate('composing', jid);

                // 4. Typing delay based on message length
                // Average human types ~40 chars per second, but we add randomness
                const charCount = messageText.length;
                const baseTypingTime = (charCount / 40) * 1000; // base time in ms
                const typingJitter = Math.random() * 1000 + 500; // 0.5s - 1.5s extra
                const typingDelay = Math.min(baseTypingTime + typingJitter, 5000); // Cap at 5 seconds
                await new Promise(r => setTimeout(r, typingDelay));

                // 5. Stop typing indicator
                await sock.sendPresenceUpdate('paused', jid);

                // 6. Small pause before sending (finger moving to send button)
                await new Promise(r => setTimeout(r, Math.random() * 300 + 100));

                // 7. Send the actual message
                await sock.sendMessage(jid, msgContent);

                // 8. Mark as "unavailable" after sending (natural behavior)
                setTimeout(async () => {
                    try {
                        await sock.sendPresenceUpdate('unavailable', jid);
                    } catch (e) {
                        // Ignore presence update errors
                    }
                }, 2000);

                logger.debug({ tenantId, type, charCount, typingDelay }, 'Message sent with human-like delays');

            } catch (err) {
                logger.error({ err }, 'Baileys sendMessage failed');
                throw err; // Trigger retry
            }
        },
        {
            connection: bullmqConnectionConfig,
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

    // Log permanently failed message jobs
    messageWorker.on('failed', (job, err) => {
        if (job && job.attemptsMade >= 3) {
            handleFailedJob(job.id, err, QUEUE_NAMES.OUTBOUND_MESSAGES);
        }
    });

    logger.info(`Listening on queues: ${QUEUE_NAMES.WORKER_COMMANDS}, ${QUEUE_NAMES.OUTBOUND_MESSAGES}`);
}

startWorker().catch(err => {
    logger.error({ err }, 'Worker failed to start');
    process.exit(1);
});
