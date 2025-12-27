import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { QUEUE_NAMES, WorkerCommandPayload } from '@b2automate/shared-types';
import { logger } from '@b2automate/logger';

export class WhatsAppService {
    private commandQueue: Queue<WorkerCommandPayload>;
    private redis: Redis;

    constructor(redisConnection: Redis) {
        this.redis = redisConnection;
        this.commandQueue = new Queue(QUEUE_NAMES.WORKER_COMMANDS, { connection: redisConnection });
    }

    async startSession(tenantId: string) {
        logger.info({ tenantId }, 'Requesting session start');
        await this.redis.set(`whatsapp:status:${tenantId}`, 'CONNECTING'); // Optimistic update
        await this.commandQueue.add('start-session', {
            type: 'START_SESSION',
            tenantId
        });
        return { status: 'REQUESTED' };
    }

    async stopSession(tenantId: string) {
        logger.info({ tenantId }, 'Requesting session stop');
        await this.commandQueue.add('stop-session', {
            type: 'STOP_SESSION',
            tenantId
        });
        return { status: 'REQUESTED' };
    }

    async getStatus(tenantId: string) {
        const status = await this.redis.get(`whatsapp:status:${tenantId}`) || 'DISCONNECTED';
        const qr = await this.redis.get(`whatsapp:qr:${tenantId}`);
        return { status, qr };
    }
}
