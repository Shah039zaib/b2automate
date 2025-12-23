import { PrismaClient } from '@b2automate/database';
import { logger } from '@b2automate/logger';

export class AuditLogger {
    constructor(private prisma: PrismaClient) { }

    async log(params: {
        tenantId: string;
        actorUserId?: string;
        eventType: string;
        metadata?: any;
        ipAddress?: string;
    }) {
        // Structural Enforcement: Cannot log without tenantId
        if (!params.tenantId) {
            logger.error('CRITICAL: Attempted to audit log without tenantId');
            throw new Error('Audit Log requires tenantId');
        }

        try {
            await this.prisma.auditLog.create({
                data: {
                    tenantId: params.tenantId,
                    actorUserId: params.actorUserId,
                    eventType: params.eventType,
                    metadata: params.metadata || {},
                    ipAddress: params.ipAddress
                }
            });
        } catch (error) {
            // Robustness: Audit logging failure should not crash the main request ideally,
            // BUT for high security (PRD), we might want to alert.
            logger.error({ error, params }, 'FAILED TO WRITE AUDIT LOG');
        }
    }
}
