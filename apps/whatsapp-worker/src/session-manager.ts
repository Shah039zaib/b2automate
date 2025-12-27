import makeWASocket, {
    DisconnectReason,
    ConnectionState,
    WASocket
} from '@whiskeysockets/baileys';
import { logger } from '@b2automate/logger';
import Redis from 'ioredis';
import { Boom } from '@hapi/boom';
import { Queue } from 'bullmq';
import { InboundEventPayload } from '@b2automate/shared-types';
import { useRedisAuthState, clearRedisAuthState } from './redis-auth-state';

/**
 * SessionManager with Redis-based auth state storage
 * 
 * HORIZONTAL SCALING SUPPORT:
 * - Auth credentials stored in Redis (shared across instances)
 * - Session sockets stored in local Map (instance-specific)
 * - Each worker instance handles its own assigned tenants via BullMQ
 * 
 * For true horizontal scaling, use BullMQ's job distribution to assign
 * different tenants to different worker instances.
 */
export class SessionManager {
    private sessions: Map<string, WASocket> = new Map();
    private redis: Redis;
    private inboundQueue: Queue<InboundEventPayload>;

    constructor(redisUrl: string, inboundQueue: Queue<InboundEventPayload>) {
        this.redis = new Redis(redisUrl);
        this.inboundQueue = inboundQueue;
    }

    /**
     * Check if a session is being handled by ANY worker instance
     */
    async isSessionActive(tenantId: string): Promise<boolean> {
        const status = await this.redis.get(`whatsapp:status:${tenantId}`);
        return status === 'CONNECTED' || status === 'CONNECTING';
    }

    /**
     * Claim a session for this worker instance
     * Returns false if already claimed by another instance
     */
    async claimSession(tenantId: string, instanceId: string, ttlSeconds: number = 60): Promise<boolean> {
        const key = `whatsapp:claim:${tenantId}`;
        // Use SET NX EX for atomic claim with expiry
        const result = await this.redis.set(key, instanceId, 'EX', ttlSeconds, 'NX');
        if (result === 'OK') {
            return true;
        }
        // Check if we already own it
        const currentOwner = await this.redis.get(key);
        return currentOwner === instanceId;
    }

    /**
     * Renew the claim on a session (heartbeat)
     */
    async renewClaim(tenantId: string, instanceId: string, ttlSeconds: number = 60): Promise<void> {
        const key = `whatsapp:claim:${tenantId}`;
        const currentOwner = await this.redis.get(key);
        if (currentOwner === instanceId) {
            await this.redis.expire(key, ttlSeconds);
        }
    }

    /**
     * Release claim on a session
     */
    async releaseClaim(tenantId: string, instanceId: string): Promise<void> {
        const key = `whatsapp:claim:${tenantId}`;
        const currentOwner = await this.redis.get(key);
        if (currentOwner === instanceId) {
            await this.redis.del(key);
        }
    }

    async startSession(tenantId: string, forceNew: boolean = false) {
        // Prevent concurrent startSession calls for the same tenant
        const lockKey = `whatsapp:starting:${tenantId}`;
        const lockAcquired = await this.redis.set(lockKey, '1', 'EX', 30, 'NX');

        if (!lockAcquired && !forceNew) {
            logger.info({ tenantId }, 'Session start already in progress, skipping');
            return;
        }

        try {
            const existingSocket = this.sessions.get(tenantId);

            // If forceNew is requested, clean up existing socket and auth state
            // This ensures a fresh QR code is generated
            if (forceNew) {
                logger.info({ tenantId }, 'Force new session requested - clearing existing state');

                // Close existing socket if any
                if (existingSocket) {
                    try {
                        existingSocket.end(undefined);
                    } catch (e) {
                        // Ignore cleanup errors
                        logger.debug({ tenantId, error: e }, 'Error closing existing socket (ignored)');
                    }
                    this.sessions.delete(tenantId);
                }

                // Clear Redis auth state to force fresh QR generation
                await clearRedisAuthState(this.redis, tenantId);
                await this.redis.del(`whatsapp:qr:${tenantId}`);
                await this.redis.del(`whatsapp:status:${tenantId}`);
            } else if (existingSocket) {
                // Not forcing new, but socket exists - check if it's actually usable
                logger.info({ tenantId }, 'Session already active in this instance');
                await this.redis.del(lockKey);
                return;
            }

            logger.info({ tenantId, forceNew }, 'Initializing session with Redis auth state...');
            await this.redis.set(`whatsapp:status:${tenantId}`, 'CONNECTING');

            // Use Redis-based auth state (enables horizontal scaling)
            const { state, saveCreds } = await useRedisAuthState(this.redis, tenantId);

            logger.info({ tenantId }, 'Creating Baileys socket...');
            const sock = makeWASocket({
                auth: state,
                printQRInTerminal: false,
                browser: ['B2Automate', 'Chrome', '10.0'],
                syncFullHistory: false
            });

            logger.info({ tenantId }, 'Baileys socket created, attaching event listeners...');

            // Event Listeners
            sock.ev.on('creds.update', saveCreds);

            sock.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
                const { connection, lastDisconnect, qr } = update;

                // Log ALL connection updates for debugging
                logger.info({ tenantId, connection, hasQr: !!qr }, 'Connection update received');

                // Emit Event
                this.inboundQueue.add('event', {
                    tenantId,
                    event: 'connection.update',
                    data: { connection, qr, error: lastDisconnect?.error }
                });

                if (qr) {
                    logger.info({ tenantId, qrLength: qr.length }, 'QR Code generated - storing in Redis');
                    await this.redis.set(`whatsapp:qr:${tenantId}`, qr, 'EX', 60);
                    await this.redis.set(`whatsapp:status:${tenantId}`, 'QR_READY');
                }

                if (connection === 'close') {
                    const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                    logger.warn({ tenantId, error: lastDisconnect?.error, shouldReconnect }, 'Connection closed');

                    this.sessions.delete(tenantId);
                    await this.redis.set(`whatsapp:status:${tenantId}`, 'DISCONNECTED');
                    await this.redis.del(lockKey); // Release lock on disconnect

                    if (shouldReconnect) {
                        // SAFETY: Wrap async reconnect in try/catch to prevent silent crashes
                        setTimeout(() => {
                            this.startSession(tenantId).catch((err) => {
                                logger.error({ tenantId, err }, 'Failed to reconnect session');
                            });
                        }, 5000);
                    } else {
                        await this.cleanupSession(tenantId);
                    }
                } else if (connection === 'open') {
                    logger.info({ tenantId }, 'Connection opened successfully');
                    await this.redis.set(`whatsapp:status:${tenantId}`, 'CONNECTED');
                    await this.redis.del(`whatsapp:qr:${tenantId}`);
                    await this.redis.del(lockKey); // Release lock on success
                }
            });

            sock.ev.on('messages.upsert', async (m) => {
                logger.debug({ tenantId, count: m.messages.length }, 'Messages received');
                // Push to Queue for API to process
                for (const msg of m.messages) {
                    if (!msg.key.fromMe) { // Only inbound
                        // ============================================
                        // Seen Status: Send read receipt
                        // ============================================
                        try {
                            // Small delay before marking as read (human-like)
                            const readDelay = Math.random() * 2000 + 1000; // 1-3 seconds
                            setTimeout(async () => {
                                try {
                                    await sock.readMessages([msg.key]);
                                    logger.debug({ tenantId, msgId: msg.key.id }, 'Message marked as read');
                                } catch (readErr) {
                                    // Ignore read receipt errors
                                    logger.debug({ tenantId, error: readErr }, 'Failed to send read receipt');
                                }
                            }, readDelay);
                        } catch {
                            // Ignore
                        }

                        // ============================================
                        // Media Processing (non-blocking)
                        // Download and store incoming media files
                        // ============================================
                        let mediaData: { mediaUrl?: string; mimeType?: string; fileSize?: number; mediaKey?: string } = {};
                        try {
                            const { hasMedia, processIncomingMedia } = await import('./media-handler.js');
                            if (hasMedia(msg)) {
                                const messageId = msg.key.id || `msg_${Date.now()}`;
                                const result = await processIncomingMedia(sock, tenantId, messageId, msg);
                                if (result.success) {
                                    mediaData = {
                                        mediaUrl: result.mediaUrl,
                                        mimeType: result.mimeType,
                                        fileSize: result.fileSize,
                                        mediaKey: result.mediaKey
                                    };
                                    logger.info({ tenantId, messageId, mediaKey: result.mediaKey }, 'Media processed successfully');
                                }
                            }
                        } catch (mediaErr) {
                            // Media processing failure should NOT block message processing
                            logger.warn({ tenantId, msgId: msg.key.id, err: mediaErr }, 'Media processing failed - continuing without media');
                        }

                        this.inboundQueue.add('message', {
                            tenantId,
                            event: 'message',
                            data: {
                                ...msg,
                                // Attach media metadata if processed
                                _mediaData: mediaData
                            }
                        });
                    }
                }
            });

            this.sessions.set(tenantId, sock);
            logger.info({ tenantId }, 'Session started successfully, waiting for QR...');

        } catch (err) {
            logger.error({ tenantId, err }, 'Failed to start session');
            await this.redis.del(lockKey);
            await this.redis.set(`whatsapp:status:${tenantId}`, 'DISCONNECTED');
            throw err;
        }
    }

    async getSession(tenantId: string): Promise<WASocket | undefined> {
        return this.sessions.get(tenantId);
    }

    async stopSession(tenantId: string): Promise<void> {
        const sock = this.sessions.get(tenantId);
        if (sock) {
            sock.end(undefined);
            this.sessions.delete(tenantId);
            await this.redis.set(`whatsapp:status:${tenantId}`, 'DISCONNECTED');
        }
    }

    async cleanupSession(tenantId: string) {
        // Clear Redis auth state (not file-based anymore)
        await clearRedisAuthState(this.redis, tenantId);
        await this.redis.del(`whatsapp:status:${tenantId}`);
        await this.redis.del(`whatsapp:qr:${tenantId}`);
        await this.redis.del(`whatsapp:claim:${tenantId}`);
        await this.redis.del(`whatsapp:starting:${tenantId}`);
    }

    /**
     * Get all active sessions in this instance
     */
    getActiveSessions(): string[] {
        return Array.from(this.sessions.keys());
    }
}
