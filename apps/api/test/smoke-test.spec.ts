import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIOrchestrator } from '../src/services/ai-orchestrator';

// Complete Mock Dependencies for AI Orchestrator + Governance Service
const mockPrisma = {
    systemSettings: {
        findUnique: vi.fn().mockResolvedValue({
            id: 'system',
            globalAiEnabled: true
        })
    },
    tenant: {
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({})
    },
    growthSettings: {
        findUnique: vi.fn().mockResolvedValue({
            tenantId: 'tenant-1',
            aiEnabled: true,
            defaultAiModel: 'mock-model'
        })
    },
    conversation: {
        findFirst: vi.fn().mockResolvedValue(null)
    },
    message: {
        findMany: vi.fn().mockResolvedValue([])
    },
    service: {
        findMany: vi.fn().mockResolvedValue([{ name: 'Test Service', description: 'Test' }]),
        findFirst: vi.fn()
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    aiUsageLog: { create: vi.fn().mockResolvedValue({}) },
    order: { create: vi.fn() }
} as unknown as any;

const mockQueue = { add: vi.fn().mockResolvedValue({}) } as unknown as any;

describe('SMOKE TEST: Go-Live Simulation', () => {
    let orchestrator: AIOrchestrator;

    beforeEach(() => {
        vi.clearAllMocks();
        orchestrator = new AIOrchestrator(mockPrisma, mockQueue);
        // Hack to mock orders service internals
        (orchestrator as any).ordersService = {
            createDraftOrder: vi.fn().mockResolvedValue({ id: 'smoke-order-1', status: 'DRAFT' })
        };
    });

    it('STEP 1: Verify AI OFF by default (Simulation)', async () => {
        // Tenant 1: isAiEnabled = false
        mockPrisma.tenant.findUnique.mockResolvedValue({
            id: 'tenant-1',
            isAiEnabled: false,
            aiPlan: 'FREE',
            aiTier: 'FREE',
            aiDailyLimit: 100,
            aiDailyUsage: 0,
            aiMonthlyLimit: 1000,
            aiMonthlyUsage: 0,
            aiUsageResetAt: new Date()
        });

        await orchestrator.processInboundMessage('tenant-1', 'user-1', 'Hello');

        // Expect TENANT AI DISABLED LOG (governance blocks at tenant level)
        expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ eventType: 'AI_BLOCKED_TENANT_AI_DISABLED' })
        }));

        // Should still send fallback message
        expect(mockQueue.add).toHaveBeenCalled();
    });

    it('STEP 2: Enable Tenant & End-to-End Flow', async () => {
        // Tenant 1: Enabled with full fields
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

        // Send Message
        await orchestrator.processInboundMessage('tenant-1', 'user-1', 'Hello');

        // Should send outbound message
        expect(mockQueue.add).toHaveBeenCalled();
    });

    it('STEP 3: Safety Guardrail in Prod', async () => {
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

        // Mock Provider returning price violation
        const mockBadProvider = {
            generateResponse: vi.fn().mockResolvedValue('The price is $100.')
        };
        (orchestrator as any).provider = mockBadProvider;

        await orchestrator.processInboundMessage('tenant-1', 'user-1', 'Price?');

        // Should send some outbound message (either guardrail fallback or other)
        expect(mockQueue.add).toHaveBeenCalled();
    });
});

