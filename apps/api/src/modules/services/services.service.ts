import { PrismaClient } from '@b2automate/database';
import { logger } from '@b2automate/logger';

export class ServicesService {
    constructor(private prisma: PrismaClient) { }

    async createService(tenantId: string, data: { name: string, description: string, price: number, currency?: string }) {
        logger.info({ tenantId, name: data.name }, 'Creating service');

        // Create Service
        const service = await this.prisma.service.create({
            data: {
                tenantId,
                name: data.name,
                description: data.description,
                price: data.price,
                currency: data.currency || 'USD',
                isActive: true
            }
        });

        // Audit Log
        await this.prisma.auditLog.create({
            data: {
                tenantId,
                eventType: 'SERVICE_CREATED',
                metadata: { serviceId: service.id, name: service.name, price: service.price },
                actorUserId: null // TODO: Pass actor from context if available
            }
        });

        return service;
    }

    async listServices(tenantId: string) {
        return this.prisma.service.findMany({ where: { tenantId } });
    }

    async updateService(tenantId: string, id: string, data: Partial<{ name: string, description: string, price: number, isActive: boolean }>) {
        // Create Audit Log Snapshot BEFORE update?
        // For now, simpler audit
        const updated = await this.prisma.service.update({
            where: { id, tenantId }, // Ensure tenant isolation
            data
        });

        await this.prisma.auditLog.create({
            data: {
                tenantId,
                eventType: 'SERVICE_UPDATED',
                metadata: { serviceId: id, updates: data }
            }
        });

        return updated;
    }
}
