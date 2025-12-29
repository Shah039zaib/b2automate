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
            tenantId,
            forceNew: true  // Always generate fresh QR when user explicitly requests
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
        const pairingCode = await this.redis.get(`whatsapp:pairingCode:${tenantId}`);
        return { status, qr, pairingCode };
    }

    async requestPairingCode(tenantId: string, phoneNumber: string) {
        // Validate phone number format
        const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');

        if (cleanPhone.length < 10) {
            throw new Error('Phone number must be at least 10 digits');
        }

        if (cleanPhone.length > 15) {
            throw new Error('Phone number must not exceed 15 digits');
        }

        logger.info({ tenantId, phoneNumber: cleanPhone }, 'Requesting pairing code');
        await this.redis.set(`whatsapp:status:${tenantId}`, 'REQUESTING_PAIRING_CODE');

        await this.commandQueue.add('request-pairing-code', {
            type: 'REQUEST_PAIRING_CODE',
            tenantId,
            phoneNumber: cleanPhone
        });

        return { status: 'REQUESTED', message: 'Pairing code request sent' };
    }
}
