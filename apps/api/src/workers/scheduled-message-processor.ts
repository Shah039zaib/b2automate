/**
 * Scheduled Message Processor
 * 
 * PHASE 6B: Polling worker that sends scheduled messages when due.
 * 
 * RULES:
 * - Only sends when scheduledAt <= now
 * - Respects tenant kill switches
 * - Respects rate limits and anti-ban delays
 * - Retries on failure (max 3 attempts)
 * - Logs all sends/failures to audit
 */

import { PrismaClient } from '@b2automate/database';
import { Queue } from 'bullmq';
import { OutboundMessagePayload, QUEUE_NAMES } from '@b2automate/shared-types';
import { logger } from '@b2automate/logger';

const MAX_RETRIES = 3;
const POLL_INTERVAL_MS = 30000; // 30 seconds

// Type alias until prisma regenerate
type PrismaAny = any;

export class ScheduledMessageProcessor {
    private intervalId: NodeJS.Timeout | null = null;

    constructor(
        private prisma: PrismaClient,
        private outboundQueue: Queue<OutboundMessagePayload>
    ) { }

    /**
     * Start the polling worker
     */
    start(): void {
        if (this.intervalId) return;

        logger.info('Scheduled message processor started');

        // Initial run
        this.processPendingMessages();

        // Poll every 30 seconds
        this.intervalId = setInterval(() => {
            this.processPendingMessages();
        }, POLL_INTERVAL_MS);
    }

    /**
     * Stop the polling worker
     */
    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            logger.info('Scheduled message processor stopped');
        }
    }

    /**
     * Process all pending messages that are due
     */
    private async processPendingMessages(): Promise<void> {
        try {
            const now = new Date();

            // Find due messages
            const dueMessages = await (this.prisma as any).scheduledMessage.findMany({
                where: {
                    status: 'PENDING',
                    scheduledAt: { lte: now }
                },
                take: 50, // Process in batches
                include: {
                    tenant: {
                        select: {
                            id: true,
                            isWhatsappEnabled: true,
                            status: true
                        }
                    }
                }
            });

            if (dueMessages.length === 0) return;

            logger.info({ count: dueMessages.length }, 'Processing due scheduled messages');

            for (const msg of dueMessages) {
                await this.processMessage(msg);
            }

        } catch (err) {
            logger.error({ err }, 'Error processing scheduled messages');
        }
    }

    /**
     * Process a single scheduled message
     */
    private async processMessage(msg: any): Promise<void> {
        const { id, tenantId, recipientPhone, messageText, retryCount, tenant } = msg;

        try {
            // Check tenant kill switches
            if (tenant.status !== 'ACTIVE') {
                await this.markFailed(id, 'Tenant not active', retryCount);
                return;
            }

            if (!tenant.isWhatsappEnabled) {
                await this.markFailed(id, 'WhatsApp disabled for tenant', retryCount);
                return;
            }

            // Convert phone to JID format
            const jid = `${recipientPhone}@s.whatsapp.net`;

            // Queue for sending via existing WhatsApp pipeline
            await this.outboundQueue.add('scheduled', {
                tenantId,
                sessionId: tenantId, // 1:1 tenant-session model
                to: jid,
                content: messageText,
                type: 'text'
            });

            // Mark as sent
            await (this.prisma as any).scheduledMessage.update({
                where: { id },
                data: {
                    status: 'SENT',
                    sentAt: new Date()
                }
            });

            // Audit log
            await (this.prisma as any).auditLog.create({
                data: {
                    tenantId,
                    eventType: 'SCHEDULED_MESSAGE_SENT',
                    metadata: { id, recipientPhone }
                }
            });

            logger.info({ id, tenantId, recipientPhone }, 'Scheduled message sent');

        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Unknown error';
            logger.error({ err, id, tenantId }, 'Failed to send scheduled message');
            await this.markFailed(id, errorMsg, retryCount);
        }
    }

    /**
     * Mark message as failed with retry logic
     */
    private async markFailed(id: string, error: string, currentRetries: number): Promise<void> {
        const newRetryCount = currentRetries + 1;

        if (newRetryCount >= MAX_RETRIES) {
            // Max retries reached - permanently fail
            await (this.prisma as any).scheduledMessage.update({
                where: { id },
                data: {
                    status: 'FAILED',
                    lastError: error,
                    retryCount: newRetryCount
                }
            });
            logger.warn({ id, retries: newRetryCount }, 'Scheduled message permanently failed');
        } else {
            // Will retry on next poll
            await (this.prisma as any).scheduledMessage.update({
                where: { id },
                data: {
                    lastError: error,
                    retryCount: newRetryCount
                }
            });
            logger.info({ id, retries: newRetryCount }, 'Scheduled message will retry');
        }
    }
}
