import { PrismaClient } from '@b2automate/database';
import { logger } from '@b2automate/logger';

export class ServicesService {
    constructor(private prisma: PrismaClient) { }

    async createService(tenantId: string, actorUserId: string | null, data: { name: string, description: string, price: number, currency?: string }) {
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
                actorUserId
            }
        });

        return service;
    }

    async listServices(tenantId: string) {
        return this.prisma.service.findMany({ where: { tenantId } });
    }

    async updateService(tenantId: string, actorUserId: string | null, id: string, data: Partial<{ name: string, description: string, price: number, isActive: boolean }>) {
        const updated = await this.prisma.service.update({
            where: { id, tenantId },
            data
        });

        await this.prisma.auditLog.create({
            data: {
                tenantId,
                eventType: 'SERVICE_UPDATED',
                metadata: { serviceId: id, updates: data },
                actorUserId
            }
        });

        return updated;
    }

    async deleteService(tenantId: string, actorUserId: string | null, id: string) {
        // Check if service has order items
        const orderItemsCount = await this.prisma.orderItem.count({
            where: { serviceId: id }
        });

        let result: { action: 'soft_deleted' | 'hard_deleted'; service?: any };

        if (orderItemsCount > 0) {
            // Soft delete - just set isActive to false
            const updated = await this.prisma.service.update({
                where: { id, tenantId },
                data: { isActive: false }
            });
            result = { action: 'soft_deleted', service: updated };
        } else {
            // Hard delete
            await this.prisma.service.delete({
                where: { id, tenantId }
            });
            result = { action: 'hard_deleted' };
        }

        await this.prisma.auditLog.create({
            data: {
                tenantId,
                eventType: result.action === 'soft_deleted' ? 'SERVICE_DEACTIVATED' : 'SERVICE_DELETED',
                metadata: { serviceId: id, action: result.action },
                actorUserId
            }
        });

        return result;
    }

    /**
     * Bulk create services from CSV import
     * Returns count of created and skipped services
     */
    async bulkCreateServices(
        tenantId: string,
        actorUserId: string | null,
        services: Array<{ name: string; description: string; price: number; currency?: string }>
    ): Promise<{ created: number; skipped: number; errors: string[] }> {
        logger.info({ tenantId, count: services.length }, 'Bulk importing services');

        const results = {
            created: 0,
            skipped: 0,
            errors: [] as string[]
        };

        for (const [index, svc] of services.entries()) {
            try {
                // Basic validation
                if (!svc.name || svc.name.trim().length === 0) {
                    results.errors.push(`Row ${index + 1}: Name is required`);
                    results.skipped++;
                    continue;
                }

                if (!svc.description || svc.description.trim().length === 0) {
                    results.errors.push(`Row ${index + 1}: Description is required`);
                    results.skipped++;
                    continue;
                }

                const price = typeof svc.price === 'number' ? svc.price : parseFloat(String(svc.price));
                if (isNaN(price) || price <= 0) {
                    results.errors.push(`Row ${index + 1}: Invalid price "${svc.price}"`);
                    results.skipped++;
                    continue;
                }

                // Check for duplicate name in tenant
                const existing = await this.prisma.service.findFirst({
                    where: { tenantId, name: svc.name.trim() }
                });

                if (existing) {
                    results.errors.push(`Row ${index + 1}: Service "${svc.name}" already exists`);
                    results.skipped++;
                    continue;
                }

                // Create service
                await this.prisma.service.create({
                    data: {
                        tenantId,
                        name: svc.name.trim(),
                        description: svc.description.trim(),
                        price: price,
                        currency: svc.currency || 'USD',
                        isActive: true
                    }
                });

                results.created++;
            } catch (err: any) {
                results.errors.push(`Row ${index + 1}: ${err.message || 'Unknown error'}`);
                results.skipped++;
            }
        }

        // Single audit log for bulk import
        await this.prisma.auditLog.create({
            data: {
                tenantId,
                eventType: 'SERVICES_BULK_IMPORTED',
                metadata: { created: results.created, skipped: results.skipped },
                actorUserId
            }
        });

        logger.info({ tenantId, created: results.created, skipped: results.skipped }, 'Bulk import completed');
        return results;
    }
}
