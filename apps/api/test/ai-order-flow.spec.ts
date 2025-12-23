import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIOrchestrator } from '../src/services/ai-orchestrator';

// Mocks
const mockPrisma = {
    service: {
        findMany: vi.fn(),
        findFirst: vi.fn()
    },
    auditLog: { create: vi.fn() },
    order: { create: vi.fn() }
} as any;

const mockQueue = { add: vi.fn() } as any;

// Mock Provider Interface - We need to spy on it or inject it
// In AIOrchestrator, we use 'MOCK' provider by default which returns generic text.
// We need to override it to return "ORDER_REQUEST: Service Name"

describe('AI Order Flow', () => {
    let orchestrator: AIOrchestrator;

    beforeEach(() => {
        vi.clearAllMocks();
        orchestrator = new AIOrchestrator(mockPrisma, mockQueue, 'MOCK');

        // Mock OrdersService inside orchestrator (it's private, so cast to any)
        (orchestrator as any).ordersService = {
            createDraftOrder: vi.fn().mockResolvedValue({ id: 'order-123' })
        };
    });

    it('should create Draft Order when AI outputs ORDER_REQUEST', async () => {
        // Mock Service Lookup (for Listing in prompt)
        mockPrisma.service.findMany.mockResolvedValue([{ name: 'Premium Audit', description: 'Desc' }]);

        // Mock Service Lookup (for Intent Resolution)
        mockPrisma.service.findFirst.mockResolvedValue({ id: 'srv-1', name: 'Premium Audit', price: 100 });

        // Spy on Provider to return Intent
        // The provider is private...
        const mockProvider = {
            generateResponse: vi.fn().mockResolvedValue('ORDER_REQUEST: Premium Audit')
        };
        (orchestrator as any).provider = mockProvider;

        await orchestrator.processInboundMessage('tenant-1', 'user-1', 'I want to buy Premium Audit');

        // 1. Verify Service Lookup happened
        expect(mockPrisma.service.findFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ name: expect.objectContaining({ equals: 'Premium Audit' }) })
        }));

        // 2. Verify Order Creation
        expect((orchestrator as any).ordersService.createDraftOrder).toHaveBeenCalledWith(
            'tenant-1', 'user-1', [{ serviceId: 'srv-1', quantity: 1 }]
        );

        // 3. Verify Outbound Message (Confirmation, NOT the raw "ORDER_REQUEST" string)
        expect(mockQueue.add).toHaveBeenCalledWith('message', expect.objectContaining({
            content: expect.stringContaining('draft order (ID: orde)')
        }));

        // 4. Verify Audit Log
        expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ eventType: 'AI_ORDER_DRAFT_CREATED' })
        }));
    });

    it('should handle Unknown Service in intent', async () => {
        mockPrisma.service.findMany.mockResolvedValue([]);
        mockPrisma.service.findFirst.mockResolvedValue(null); // Not found

        const mockProvider = {
            generateResponse: vi.fn().mockResolvedValue('ORDER_REQUEST: Unknown Service')
        };
        (orchestrator as any).provider = mockProvider;

        await orchestrator.processInboundMessage('tenant-1', 'user-1', 'buy unknown');

        // Verify NO Order created
        expect((orchestrator as any).ordersService.createDraftOrder).not.toHaveBeenCalled();

        // Verify Fallback Message
        expect(mockQueue.add).toHaveBeenCalledWith('message', expect.objectContaining({
            content: expect.stringContaining("couldn't find a service named")
        }));
    });
});
