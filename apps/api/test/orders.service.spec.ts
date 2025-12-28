/**
 * Orders Service Unit Tests
 * 
 * Tests for order management including:
 * - Order state machine
 * - Draft creation
 * - Approval workflow
 * - Rejection workflow
 * - Tenant isolation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrdersService } from '../src/modules/orders/orders.service';
import { createMockPrisma, mockOrders, mockServices, mockUsers } from './utils/test-helpers';

describe('OrdersService', () => {
    let ordersService: OrdersService;
    let mockPrisma: ReturnType<typeof createMockPrisma>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockPrisma = createMockPrisma();
        ordersService = new OrdersService(mockPrisma as any);
    });

    // ============================================
    // Order Creation Tests
    // ============================================

    describe('createDraftOrder', () => {
        it('should create a draft order with items', async () => {
            const tenantId = 'tenant-001';
            const customerJid = '1234567890@s.whatsapp.net';
            const items = [
                { serviceId: 'service-001', quantity: 2 },
            ];

            // Mock findUnique for service lookup (called in loop)
            mockPrisma.service.findUnique.mockResolvedValue({
                id: 'service-001',
                tenantId,
                name: 'Test Service',
                price: 100,
                isActive: true,
            });

            mockPrisma.order.create.mockResolvedValue({
                id: 'new-order-001',
                tenantId,
                customerJid,
                status: 'DRAFT',
                totalAmount: 200,
                items: [],
            });

            const order = await ordersService.createDraftOrder(tenantId, customerJid, items);

            expect(order.status).toBe('DRAFT');
            expect(mockPrisma.order.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        tenantId,
                        customerJid,
                        status: 'DRAFT',
                    }),
                })
            );
        });

        it('should reject invalid service', async () => {
            mockPrisma.service.findUnique.mockResolvedValue(null);

            await expect(
                ordersService.createDraftOrder('tenant-001', '123@s.whatsapp.net', [
                    { serviceId: 'invalid-service', quantity: 1 },
                ])
            ).rejects.toThrow(/invalid|inactive/i);
        });
    });

    // ============================================
    // Order State Machine Tests
    // ============================================

    describe('Order State Machine', () => {
        describe('submitForApproval', () => {
            it('should transition DRAFT to PENDING_APPROVAL', async () => {
                mockPrisma.order.findUnique.mockResolvedValue({
                    ...mockOrders.draft,
                    tenantId: 'tenant-001',
                });

                mockPrisma.order.update.mockResolvedValue({
                    ...mockOrders.draft,
                    status: 'PENDING_APPROVAL',
                });

                const order = await ordersService.submitForApproval('tenant-001', 'order-001');

                expect(order.status).toBe('PENDING_APPROVAL');
            });

            it('should reject if order not in DRAFT', async () => {
                mockPrisma.order.findUnique.mockResolvedValue({
                    ...mockOrders.approved,
                    status: 'APPROVED',
                });

                await expect(
                    ordersService.submitForApproval('tenant-001', 'order-003')
                ).rejects.toThrow(/DRAFT|must be/i);
            });
        });

        describe('approveOrder', () => {
            it('should transition PENDING_APPROVAL to APPROVED', async () => {
                mockPrisma.order.findUnique.mockResolvedValue({
                    ...mockOrders.pendingApproval,
                    status: 'PENDING_APPROVAL',
                });

                mockPrisma.order.update.mockResolvedValue({
                    ...mockOrders.pendingApproval,
                    status: 'APPROVED',
                    approvedBy: mockUsers.tenantAdmin.id,
                });

                const order = await ordersService.approveOrder(
                    'tenant-001',
                    'order-002',
                    mockUsers.tenantAdmin.id
                );

                expect(order.status).toBe('APPROVED');
                expect(order.approvedBy).toBe(mockUsers.tenantAdmin.id);
            });

            it('should reject if order not in PENDING_APPROVAL', async () => {
                mockPrisma.order.findUnique.mockResolvedValue({
                    ...mockOrders.draft,
                    status: 'DRAFT',
                });

                await expect(
                    ordersService.approveOrder('tenant-001', 'order-001', 'user-001')
                ).rejects.toThrow();
            });
        });

        describe('rejectOrder', () => {
            it('should transition PENDING_APPROVAL to REJECTED', async () => {
                mockPrisma.order.findUnique.mockResolvedValue({
                    ...mockOrders.pendingApproval,
                    status: 'PENDING_APPROVAL',
                });

                mockPrisma.order.update.mockResolvedValue({
                    ...mockOrders.pendingApproval,
                    status: 'REJECTED',
                });

                const order = await ordersService.rejectOrder(
                    'tenant-001',
                    'order-002',
                    mockUsers.tenantAdmin.id
                );

                expect(order.status).toBe('REJECTED');
            });
        });
    });

    // ============================================
    // Tenant Isolation Tests
    // ============================================

    describe('Tenant Isolation', () => {
        it('should not access orders from other tenants', async () => {
            mockPrisma.order.findUnique.mockResolvedValue({
                ...mockOrders.draft,
                tenantId: 'tenant-002', // Different tenant
            });

            await expect(
                ordersService.getOrderById('tenant-001', 'order-001')
            ).rejects.toThrow(/not found|forbidden/i);
        });

        it('should filter orders by tenantId in list', async () => {
            mockPrisma.order.findMany.mockResolvedValue([mockOrders.draft]);

            await ordersService.listOrders('tenant-001');

            expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        tenantId: 'tenant-001',
                    }),
                })
            );
        });
    });

    // ============================================
    // Edge Cases
    // ============================================

    describe('Edge Cases', () => {
        it('should handle non-existent order gracefully', async () => {
            mockPrisma.order.findUnique.mockResolvedValue(null);

            await expect(
                ordersService.getOrderById('tenant-001', 'non-existent')
            ).rejects.toThrow(/not found/i);
        });

        it('should calculate total correctly with quantities', async () => {
            const tenantId = 'tenant-001';
            const items = [
                { serviceId: 'service-001', quantity: 3 },
            ];

            // Service lookup uses findUnique not findMany
            mockPrisma.service.findUnique.mockResolvedValue({
                id: 'service-001',
                tenantId,
                name: 'Test Service',
                price: 50,
                isActive: true
            });

            mockPrisma.order.create.mockImplementation(async ({ data }) => ({
                id: 'new-order',
                status: 'DRAFT',
                totalAmount: data.totalAmount,
            }));

            const order = await ordersService.createDraftOrder(tenantId, 'jid', items);

            // 3 × 50 = 150
            expect(order.totalAmount).toBe(150);
        });
    });
});
