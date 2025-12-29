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
    /**
     * Clean up old sent/failed messages (retention: 30 days)
     * Run daily to prevent database bloat
     */
    async cleanupOldMessages(): Promise<void> {
        try {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const result = await (this.prisma as PrismaAny).scheduledMessage.deleteMany({
                where: {
                    status: {
                        in: ['SENT', 'FAILED']
                    },
                    updatedAt: {
                        lt: thirtyDaysAgo
                    }
                }
            });

            if (result.count > 0) {
                logger.info({ deletedCount: result.count }, 'Cleaned up old scheduled messages');
            }
        } catch (err) {
            logger.error({ err }, 'Failed to cleanup old scheduled messages');
        }
    }

    start(): void {
        if (this.intervalId) return;

        logger.info('Scheduled message processor started');

        // Schedule daily cleanup at 2 AM
        const scheduleCleanup = () => {
            const now = new Date();
            const next2AM = new Date();
            next2AM.setHours(2, 0, 0, 0);

            // If past 2 AM today, schedule for tomorrow
            if (now.getHours() >= 2) {
                next2AM.setDate(next2AM.getDate() + 1);
            }

            const msUntil2AM = next2AM.getTime() - now.getTime();

            setTimeout(() => {
                this.cleanupOldMessages();
                // Repeat daily
                setInterval(() => this.cleanupOldMessages(), 24 * 60 * 60 * 1000);
            }, msUntil2AM);

            logger.info({ nextCleanup: next2AM.toISOString() }, 'Scheduled message cleanup scheduled');
        };

        scheduleCleanup();

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
