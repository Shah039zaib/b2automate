import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { QUEUE_NAMES, InboundEventPayload } from '@b2automate/shared-types';
import { PrismaClient } from '@b2automate/database';
import { logger } from '@b2automate/logger';

// We might want to use the singleton Prisma instance if exported, or create new.
// For worker, new instance is fine or passed in.
import { AIOrchestrator } from '../services/ai-orchestrator';
import { Queue } from 'bullmq';
import { OutboundMessagePayload } from '@b2automate/shared-types';

export function startEventProcessor(redisConnection: Redis, prisma: PrismaClient) {
    // BullMQ requires maxRetriesPerRequest: null for blocking connections
    // Extract connection details from existing Redis instance
    const redisOptions = redisConnection.options;
    const bullmqConnection = {
        host: redisOptions.host || 'localhost',
        port: redisOptions.port || 6379,
        maxRetriesPerRequest: null as null,
    };

    const outboundQueue = new Queue<OutboundMessagePayload>(QUEUE_NAMES.OUTBOUND_MESSAGES, { connection: bullmqConnection });
    const aiOrchestrator = new AIOrchestrator(prisma, outboundQueue); // Provider resolved per-request by governance

    const worker = new Worker<InboundEventPayload>(
        QUEUE_NAMES.INBOUND_EVENTS,
        async (job) => {
            const { tenantId, event, data } = job.data;
            // logger.info({ id: job.id, tenantId, event }, 'Processing inbound event'); // Too verbose

            if (event === 'message') {
                const remoteJid = data.key?.remoteJid;
                const text = data.message?.conversation || data.message?.extendedTextMessage?.text;

                if (text && remoteJid) {
                    logger.info({ tenantId, remoteJid }, 'Message received, sending to AI');

                    // Audit Log
                    await prisma.auditLog.create({
                        data: {
                            tenantId,
                            eventType: 'MESSAGE_RECEIVED',
                            metadata: { from: remoteJid, text },
                            actorUserId: null,
                            ipAddress: 'worker'
                        }
                    });

                    // Trigger AI
                    await aiOrchestrator.processInboundMessage(tenantId, remoteJid, text);
                }

            } else if (event === 'connection.update') {
                // Log connection change
                await prisma.auditLog.create({
                    data: {
                        tenantId,
                        eventType: 'WHATSAPP_CONNECTION_UPDATE',
                        metadata: data
                    }
                });
            }
        },
        { connection: bullmqConnection }
    );

    worker.on('failed', (job, err) => logger.error({ id: job?.id, err }, 'Inbound Event Job failed'));
    return worker;
}
