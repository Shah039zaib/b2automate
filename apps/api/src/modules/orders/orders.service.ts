import { PrismaClient, OrderStatus } from '@b2automate/database';
import { logger } from '@b2automate/logger';

export class OrdersService {
    constructor(private prisma: PrismaClient) { }

    async createDraftOrder(tenantId: string, customerJid: string, items: { serviceId: string, quantity: number }[]) {
        logger.info({ tenantId, customerJid, items }, 'Creating Draft Order');

        // 1. Calculate Totals (Backend Price Source of Truth)
        // OPTIMIZED: Use single batch query instead of N queries
        const serviceIds = items.map(item => item.serviceId);

        // Fetch all services in one query
        const services = await this.prisma.service.findMany({
            where: {
                id: { in: serviceIds },
                tenantId,
                isActive: true
            }
        });

        // Build service lookup map for O(1) access
        const serviceMap = new Map(services.map(s => [s.id, s]));

        // Validate all services exist and are active
        for (const item of items) {
            const service = serviceMap.get(item.serviceId);
            if (!service) {
                throw new Error(`Service ${item.serviceId} is invalid or inactive`);
            }
        }

        // Calculate totals and build order items
        let totalAmount = 0;
        const orderItemsData = [];

        for (const item of items) {
            const service = serviceMap.get(item.serviceId)!; // Safe - validated above
            const lineTotal = Number(service.price) * item.quantity;
            totalAmount += lineTotal;

            orderItemsData.push({
                serviceId: service.id,
                quantity: item.quantity,
                price: service.price // Snapshot price
            });
        }

        // 2. Create Order
        const order = await this.prisma.order.create({
            data: {
                tenantId,
                customerJid,
                status: 'DRAFT',
                totalAmount: totalAmount,
                items: {
                    create: orderItemsData
                }
            },
            include: { items: { include: { service: true } } }
        });

        // Audit Log
        await this.prisma.auditLog.create({
            data: {
                tenantId,
                eventType: 'ORDER_CREATED',
                metadata: { orderId: order.id, status: 'DRAFT', total: totalAmount },
                orderId: order.id
            }
        });

        return order;
    }

    async submitForApproval(tenantId: string, orderId: string) {
        // Transition DRAFT -> PENDING_APPROVAL
        // Only if DRAFT
        const order = await this.prisma.order.findUnique({ where: { id: orderId, tenantId } });
        if (!order) throw new Error('Order not found');
        if (order.status !== 'DRAFT') throw new Error('Order must be in DRAFT to submit');

        const updated = await this.prisma.order.update({
            where: { id: orderId },
            data: { status: 'PENDING_APPROVAL' },
            include: { items: { include: { service: true } } }
        });
        return updated;
    }

    async approveOrder(tenantId: string, orderId: string, userId: string) {
        // PENDING -> APPROVED
        const order = await this.prisma.order.findUnique({ where: { id: orderId, tenantId } });
        if (!order) throw new Error('Order not found');
        if (order.status !== 'PENDING_APPROVAL') throw new Error('Order is not pending approval');

        const updated = await this.prisma.order.update({
            where: { id: orderId },
            data: { status: 'APPROVED' }
        });

        // Audit
        await this.prisma.auditLog.create({
            data: {
                tenantId,
                eventType: 'ORDER_APPROVED',
                actorUserId: userId,
                orderId,
                metadata: { previousStatus: 'PENDING_APPROVAL' }
            }
        });

        return updated;
    }

    async rejectOrder(tenantId: string, orderId: string, userId: string) {
        // PENDING -> REJECTED
        const updated = await this.prisma.order.update({
            where: { id: orderId, tenantId },
            data: { status: 'REJECTED' }
        });

        await this.prisma.auditLog.create({
            data: {
                tenantId,
                eventType: 'ORDER_REJECTED',
                actorUserId: userId,
                orderId
            }
        });
        return updated;
    }

    async listOrders(tenantId: string, status?: OrderStatus) {
        return this.prisma.order.findMany({
            where: { tenantId, status },
            include: { items: { include: { service: true } } },
            orderBy: { createdAt: 'desc' }
        });
    }

    async getOrderById(tenantId: string, orderId: string) {
        const order = await this.prisma.order.findFirst({
            where: { id: orderId, tenantId },
            include: {
                items: { include: { service: true } },
                auditLogs: {
                    orderBy: { timestamp: 'desc' },
                    take: 10,
                    select: {
                        id: true,
                        eventType: true,
                        timestamp: true,
                        actor: { select: { email: true } }
                    }
                }
            }
        });
        if (!order) {
            throw new Error('Order not found');
        }
        return order;
    }
}
