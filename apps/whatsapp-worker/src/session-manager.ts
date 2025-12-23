import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    ConnectionState,
    WASocket
} from '@whiskeysockets/baileys';
import { logger } from '@b2automate/logger';
import Redis from 'ioredis';
import * as fs from 'fs';
import * as path from 'path';
import { Boom } from '@hapi/boom';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, InboundEventPayload } from '@b2automate/shared-types';

export class SessionManager {
    private sessions: Map<string, WASocket> = new Map();
    private redis: Redis;
    private inboundQueue: Queue<InboundEventPayload>;

    constructor(redisUrl: string, inboundQueue: Queue<InboundEventPayload>) {
        this.redis = new Redis(redisUrl);
        this.inboundQueue = inboundQueue;
    }

    async startSession(tenantId: string) {
        if (this.sessions.has(tenantId)) {
            logger.info({ tenantId }, 'Session already active in memory');
            return;
        }

        logger.info({ tenantId }, 'Initializing session...');

        // Ensure auth directory exists
        const authPath = path.join(process.cwd(), 'sessions', tenantId);
        if (!fs.existsSync(authPath)) {
            fs.mkdirSync(authPath, { recursive: true });
        }

        const { state, saveCreds } = await useMultiFileAuthState(authPath);

        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            browser: ['B2Automate', 'Chrome', '10.0'],
            syncFullHistory: false
        });

        // Event Listeners
        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
            const { connection, lastDisconnect, qr } = update;

            // Emit Event
            this.inboundQueue.add('event', {
                tenantId,
                event: 'connection.update',
                data: { connection, qr, error: lastDisconnect?.error }
            });

            if (qr) {
                logger.debug({ tenantId }, 'QR Code generated');
                await this.redis.set(`whatsapp:qr:${tenantId}`, qr, 'EX', 60);
                await this.redis.set(`whatsapp:status:${tenantId}`, 'QR_READY');
            }

            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                logger.warn({ tenantId, error: lastDisconnect?.error, shouldReconnect }, 'Connection closed');

                this.sessions.delete(tenantId);
                await this.redis.set(`whatsapp:status:${tenantId}`, 'DISCONNECTED');

                if (shouldReconnect) {
                    setTimeout(() => this.startSession(tenantId), 5000);
                } else {
                    await this.cleanupSession(tenantId);
                }
            } else if (connection === 'open') {
                logger.info({ tenantId }, 'Connection opened successfully');
                await this.redis.set(`whatsapp:status:${tenantId}`, 'CONNECTED');
                await this.redis.del(`whatsapp:qr:${tenantId}`);
            }
        });

        sock.ev.on('messages.upsert', async (m) => {
            logger.debug({ tenantId, count: m.messages.length }, 'Messages received');
            // Push to Queue for API to process
            for (const msg of m.messages) {
                if (!msg.key.fromMe) { // Only inbound
                    this.inboundQueue.add('message', {
                        tenantId,
                        event: 'message',
                        data: msg
                    });
                }
            }
        });

        this.sessions.set(tenantId, sock);
    }

    async getSession(tenantId: string): Promise<WASocket | undefined> {
        return this.sessions.get(tenantId);
    }

    async cleanupSession(tenantId: string) {
        const authPath = path.join(process.cwd(), 'sessions', tenantId);
        if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true });
        }
        await this.redis.del(`whatsapp:status:${tenantId}`);
        await this.redis.del(`whatsapp:qr:${tenantId}`);
    }
}
