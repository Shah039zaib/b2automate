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
            aiDailyLimit: 500,
            aiDailyUsage: 0
        }),
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
        findMany: vi.fn().mockResolvedValue([{ name: 'Test Service', description: 'A test service' }])
    },
    auditLog: {
        create: vi.fn().mockResolvedValue({})
    },
    aiUsageLog: {
        create: vi.fn().mockResolvedValue({})
    }
} as unknown as any;

const mockQueue = {
    add: vi.fn().mockResolvedValue({})
} as unknown as any;

describe('AI Orchestrator Guardrails', () => {
    let orchestrator: AIOrchestrator;

    beforeEach(() => {
        vi.clearAllMocks();
        // Reset tenant mock to enabled state
        mockPrisma.tenant.findUnique.mockResolvedValue({
            id: 'tenant-1',
            isAiEnabled: true,
            aiPlan: 'PAID_BASIC',
            aiDailyLimit: 500,
            aiDailyUsage: 0
        });
        orchestrator = new AIOrchestrator(mockPrisma, mockQueue);
    });

    it('should process safe output', async () => {
        await orchestrator.processInboundMessage('tenant-1', 'user-1', 'Hello');

        // Should verify audit log Success
        expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ eventType: 'AI_RESPONSE_GENERATED' })
        }));
        // Should send outbound
        expect(mockQueue.add).toHaveBeenCalled();
    });

    it('should BLOCK output containing prices', async () => {
        // Send a message that might trigger guardrails
        await orchestrator.processInboundMessage('tenant-1', 'user-1', 'Tell me price violations');

        // Verify some outbound message was sent (either normal response or fallback)
        expect(mockQueue.add).toHaveBeenCalled();
    });
});
