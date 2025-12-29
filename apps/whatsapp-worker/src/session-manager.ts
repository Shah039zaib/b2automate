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
    // Track event listeners for cleanup
    private eventListeners: Map<string, Array<{ event: string; handler: any }>> = new Map();
    // Track in-flight reconnection attempts to prevent race conditions
    private reconnecting: Map<string, Promise<void>> = new Map();

    constructor(redisUrl: string, inboundQueue: Queue<InboundEventPayload>) {
        this.redis = new Redis(redisUrl);
        this.inboundQueue = inboundQueue;
    }

    /**
     * Remove all event listeners for a tenant to prevent memory leaks
     */
    private removeEventListeners(tenantId: string, sock: WASocket) {
        const listeners = this.eventListeners.get(tenantId) || [];
        for (const { event, handler } of listeners) {
            sock.ev.off(event as any, handler);
        }
        this.eventListeners.delete(tenantId);
        logger.debug({ tenantId, count: listeners.length }, 'Removed event listeners');
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

        // CRITICAL: Track whether WE acquired the lock (for proper cleanup in finally)
        const weOwnLock = lockAcquired === 'OK';

        try {
            const existingSocket = this.sessions.get(tenantId);

            // If forceNew is requested, clean up existing socket and auth state
            // This ensures a fresh QR code is generated
            if (forceNew) {
                logger.info({ tenantId }, 'Force new session requested - clearing existing state');

                // Close existing socket if any
                if (existingSocket) {
                    try {
                        // CRITICAL: Remove event listeners before closing to prevent memory leak
                        this.removeEventListeners(tenantId, existingSocket);
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

            // Initialize listener tracking for this tenant
            const listeners: Array<{ event: string; handler: any }> = [];

            // Event Listeners - Track all handlers for cleanup
            const credsHandler = saveCreds;
            sock.ev.on('creds.update', credsHandler);
            listeners.push({ event: 'creds.update', handler: credsHandler });

            const connectionHandler = async (update: Partial<ConnectionState>) => {
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
                    // Only set QR_READY if not already in pairing code mode
                    const currentStatus = await this.redis.get(`whatsapp:status:${tenantId}`);
                    if (currentStatus !== 'PAIRING_CODE_READY') {
                        await this.redis.set(`whatsapp:status:${tenantId}`, 'QR_READY');
                    }
                }

                if (connection === 'close') {
                    const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                    logger.warn({ tenantId, error: lastDisconnect?.error, shouldReconnect }, 'Connection closed');

                    // CRITICAL: Clean up event listeners before removing socket
                    this.removeEventListeners(tenantId, sock);
                    this.sessions.delete(tenantId);
                    await this.redis.set(`whatsapp:status:${tenantId}`, 'DISCONNECTED');
                    await this.redis.del(lockKey); // Release lock on disconnect

                    if (shouldReconnect) {
                        // CRITICAL: Prevent concurrent reconnect attempts for same tenant
                        const existingReconnect = this.reconnecting.get(tenantId);
                        if (existingReconnect) {
                            logger.info({ tenantId }, 'Reconnection already in progress, skipping duplicate attempt');
                            return;
                        }

                        // Track this reconnection attempt
                        const reconnectPromise = new Promise<void>((resolve) => {
                            setTimeout(async () => {
                                try {
                                    await this.startSession(tenantId);
                                    logger.info({ tenantId }, 'Reconnection successful');
                                } catch (err) {
                                    logger.error({ tenantId, err }, 'Failed to reconnect session');
                                } finally {
                                    // Always clean up tracking
                                    this.reconnecting.delete(tenantId);
                                    resolve();
                                }
                            }, 5000);
                        });

                        this.reconnecting.set(tenantId, reconnectPromise);
                    } else {
                        await this.cleanupSession(tenantId);
                    }
                } else if (connection === 'open') {
                    logger.info({ tenantId }, 'Connection opened successfully');
                    await this.redis.set(`whatsapp:status:${tenantId}`, 'CONNECTED');
                    // CLEANUP: Delete both QR and pairing code after successful connection
                    await this.redis.del(`whatsapp:qr:${tenantId}`);
                    await this.redis.del(`whatsapp:pairingCode:${tenantId}`);
                    await this.redis.del(lockKey); // Release lock on success
                }
            };
            sock.ev.on('connection.update', connectionHandler);
            listeners.push({ event: 'connection.update', handler: connectionHandler });

            const messagesHandler = async (m: any) => {
                logger.debug({ tenantId, count: m.messages.length }, 'Messages received');

                // PERFORMANCE: Collect all messages for batch processing
                const batchJobs: Array<{ name: string; data: any }> = [];

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

                        // Add to batch instead of individual queue operations
                        batchJobs.push({
                            name: 'message',
                            data: {
                                tenantId,
                                event: 'message',
                                data: {
                                    ...msg,
                                    // Attach media metadata if processed
                                    _mediaData: mediaData
                                }
                            }
                        });
                    }
                }

                // PERFORMANCE: Batch add all messages at once (reduces Redis overhead)
                if (batchJobs.length > 0) {
                    try {
                        await this.inboundQueue.addBulk(batchJobs);
                        logger.debug({ tenantId, count: batchJobs.length }, 'Batch added messages to queue');
                    } catch (err) {
                        logger.error({ tenantId, count: batchJobs.length, err }, 'Failed to batch add messages');
                        // Fallback: add individually if batch fails
                        for (const job of batchJobs) {
                            await this.inboundQueue.add(job.name, job.data);
                        }
                    }
                }
            };
            sock.ev.on('messages.upsert', messagesHandler);
            listeners.push({ event: 'messages.upsert', handler: messagesHandler });

            // Store all listeners for this tenant for later cleanup
            this.eventListeners.set(tenantId, listeners);

            this.sessions.set(tenantId, sock);
            logger.info({ tenantId }, 'Session started successfully, waiting for QR...');

        } catch (err) {
            logger.error({ tenantId, err }, 'Failed to start session');
            await this.redis.set(`whatsapp:status:${tenantId}`, 'DISCONNECTED');
            throw err;
        } finally {
            // CRITICAL: Always release lock if we acquired it
            // Lock is also deleted on connection success/close, but this ensures cleanup on errors
            if (weOwnLock) {
                const currentLock = await this.redis.get(lockKey);
                // Only delete if lock still exists (might have been deleted by connection handler)
                if (currentLock) {
                    await this.redis.del(lockKey);
                    logger.debug({ tenantId }, 'Released session start lock in finally block');
                }
            }
        }
    }

    async getSession(tenantId: string): Promise<WASocket | undefined> {
        return this.sessions.get(tenantId);
    }

    async stopSession(tenantId: string): Promise<void> {
        const sock = this.sessions.get(tenantId);
        if (sock) {
            // CRITICAL: Remove event listeners before closing to prevent memory leak
            this.removeEventListeners(tenantId, sock);
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
        await this.redis.del(`whatsapp:pairingCode:${tenantId}`);
        await this.redis.del(`whatsapp:claim:${tenantId}`);
        await this.redis.del(`whatsapp:starting:${tenantId}`);
    }

    /**
     * Get all active sessions in this instance
     */
    getActiveSessions(): string[] {
        return Array.from(this.sessions.keys());
    }

    /**
     * Request pairing code for phone number based linking (bypasses QR blocking)
     * This method is used when QR code generation is blocked by WhatsApp on cloud IPs
     */
    async requestPairingCode(tenantId: string, phoneNumber: string): Promise<string | null> {
        const sock = this.sessions.get(tenantId);
        if (!sock) {
            logger.warn({ tenantId }, 'No active socket for pairing code request - starting session first');
            // Auto-start session for pairing code
            await this.startSession(tenantId, true);
            // Wait a bit for socket to initialize
            await new Promise(r => setTimeout(r, 3000));
            const newSock = this.sessions.get(tenantId);
            if (!newSock) {
                logger.error({ tenantId }, 'Failed to get socket after session start');
                return null;
            }
            return this.doRequestPairingCode(tenantId, phoneNumber, newSock);
        }

        return this.doRequestPairingCode(tenantId, phoneNumber, sock);
    }

    private async doRequestPairingCode(tenantId: string, phoneNumber: string, sock: WASocket): Promise<string | null> {
        try {
            // Phone number should be in format: country code + number without + or spaces
            const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
            logger.info({ tenantId, phoneNumber: cleanPhone }, 'Requesting pairing code from WhatsApp...');

            // Wait for socket to be in connecting state before requesting pairing code
            await new Promise(r => setTimeout(r, 2000));

            const pairingCode = await (sock as any).requestPairingCode(cleanPhone);
            logger.info({ tenantId, pairingCode }, 'Pairing code generated successfully');

            // Store pairing code in Redis for frontend to retrieve
            await this.redis.set(`whatsapp:pairingCode:${tenantId}`, pairingCode, 'EX', 120);
            await this.redis.set(`whatsapp:status:${tenantId}`, 'PAIRING_CODE_READY');

            return pairingCode;
        } catch (err) {
            logger.error({ tenantId, err }, 'Failed to request pairing code');
            return null;
        }
    }

    /**
     * Get pairing code from Redis
     */
    async getPairingCode(tenantId: string): Promise<string | null> {
        return await this.redis.get(`whatsapp:pairingCode:${tenantId}`);
    }
}
