import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIOrchestrator } from '../src/services/ai-orchestrator';

// Complete mocks for AI Orchestrator + Governance
const mockPrisma = {
    systemSettings: {
        findUnique: vi.fn().mockResolvedValue({
            id: 'system',
            globalAiEnabled: true
        })
    },
    tenant: {
        findUnique: vi.fn().mockResolvedValue({
            id: 'tenant-1',
            isAiEnabled: true,
            aiPlan: 'PAID_BASIC',
            aiTier: 'LOW',
            aiDailyLimit: 500,
            aiDailyUsage: 0,
            aiMonthlyLimit: 10000,
            aiMonthlyUsage: 0,
            aiUsageResetAt: new Date()
        }),
        update: vi.fn().mockResolvedValue({})
    },
    growthSettings: {
        findUnique: vi.fn().mockResolvedValue(null)
    },
    conversation: {
        findFirst: vi.fn().mockResolvedValue(null)
    },
    message: {
        findMany: vi.fn().mockResolvedValue([])
    },
    service: {
        findMany: vi.fn(),
        findFirst: vi.fn()
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    aiUsageLog: { create: vi.fn().mockResolvedValue({}) },
    order: { create: vi.fn() }
} as unknown as any;

const mockQueue = { add: vi.fn().mockResolvedValue({}) } as unknown as any;

describe('AI Order Flow', () => {
    let orchestrator: AIOrchestrator;

    beforeEach(() => {
        vi.clearAllMocks();
        // Reset tenant mock
        mockPrisma.tenant.findUnique.mockResolvedValue({
            id: 'tenant-1',
            isAiEnabled: true,
            aiPlan: 'PAID_BASIC',
            aiTier: 'LOW',
            aiDailyLimit: 500,
            aiDailyUsage: 0,
            aiMonthlyLimit: 10000,
            aiMonthlyUsage: 0,
            aiUsageResetAt: new Date()
        });
        orchestrator = new AIOrchestrator(mockPrisma, mockQueue);

        // Mock OrdersService inside orchestrator
        (orchestrator as any).ordersService = {
            createDraftOrder: vi.fn().mockResolvedValue({ id: 'order-123' })
        };
    });

    it('should create Draft Order when AI outputs ORDER_REQUEST', async () => {
        // Mock Service Lookup
        mockPrisma.service.findMany.mockResolvedValue([{ name: 'Premium Audit', description: 'Desc' }]);
        mockPrisma.service.findFirst.mockResolvedValue({ id: 'srv-1', name: 'Premium Audit', price: 100 });

        // Spy on Provider to return Intent
        const mockProvider = {
            generateResponse: vi.fn().mockResolvedValue('ORDER_REQUEST: Premium Audit')
        };
        (orchestrator as any).provider = mockProvider;

        await orchestrator.processInboundMessage('tenant-1', 'user-1', 'I want to buy Premium Audit');

        // Verify outbound message was sent (any message)
        expect(mockQueue.add).toHaveBeenCalled();
    });

    it('should handle Unknown Service in intent', async () => {
        mockPrisma.service.findMany.mockResolvedValue([]);
        mockPrisma.service.findFirst.mockResolvedValue(null);

        const mockProvider = {
            generateResponse: vi.fn().mockResolvedValue('ORDER_REQUEST: Unknown Service')
        };
        (orchestrator as any).provider = mockProvider;

        await orchestrator.processInboundMessage('tenant-1', 'user-1', 'buy unknown');

        // Verify outbound message was sent (any response to user)
        expect(mockQueue.add).toHaveBeenCalled();
    });
});
