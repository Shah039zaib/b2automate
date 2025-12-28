import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrdersService } from '../src/modules/orders/orders.service';

const mockPrisma = {
    order: {
        findUnique: vi.fn(),
        update: vi.fn()
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) }
} as unknown as any;

describe('Order Approval Flow', () => {
    let service: OrdersService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new OrdersService(mockPrisma);
    });

    it('should approve PENDING order', async () => {
        mockPrisma.order.findUnique.mockResolvedValue({
            id: 'o-1',
            tenantId: 'tenant-1',
            status: 'PENDING_APPROVAL'
        });
        mockPrisma.order.update.mockResolvedValue({ id: 'o-1', status: 'APPROVED' });

        await service.approveOrder('tenant-1', 'o-1', 'admin-1');

        expect(mockPrisma.order.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'o-1' },
            data: { status: 'APPROVED' }
        }));

        expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ eventType: 'ORDER_APPROVED', actorUserId: 'admin-1' })
        }));
    });

    it('should REJECT approval if order is DRAFT', async () => {
        mockPrisma.order.findUnique.mockResolvedValue({
            id: 'o-1',
            tenantId: 'tenant-1',
            status: 'DRAFT'
        });

        await expect(service.approveOrder('tenant-1', 'o-1', 'admin-1'))
            .rejects.toThrow('Order is not pending approval');

        expect(mockPrisma.order.update).not.toHaveBeenCalled();
    });
});
