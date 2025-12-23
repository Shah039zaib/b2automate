import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIOrchestrator } from '../src/services/ai-orchestrator';

// Mock Dependencies
const mockPrisma = {
    tenant: { findUnique: vi.fn() },
    service: { findMany: vi.fn(), findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
    // Orders service mocked inside Orchestrator manually usually, 
    // but here we are checking the "Orchestrator" flow principally.
    order: { create: vi.fn() } // For OrdersService instantiation if any
} as any;

const mockQueue = { add: vi.fn() } as any;

describe('SMOKE TEST: Go-Live Simulation', () => {
    let orchestrator: AIOrchestrator;

    beforeEach(() => {
        vi.clearAllMocks();
        orchestrator = new AIOrchestrator(mockPrisma, mockQueue, 'MOCK');
        // Hack to mock orders service internals if needed, but for "Smoke" we want as much real logic as possible.
        // But since we can't spin up real DB in this unit test...
        (orchestrator as any).ordersService = {
            createDraftOrder: vi.fn().mockResolvedValue({ id: 'smoke-order-1', status: 'DRAFT' })
        };
    });

    it('STEP 1: Verify AI OFF by default (Simulation)', async () => {
        // Tenant 1: isAiEnabled = false
        mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', isAiEnabled: false });

        await orchestrator.processInboundMessage('tenant-1', 'user-1', 'Hello');

        // Expect KILL SWITCH LOG
        expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ eventType: 'AI_BLOCKED_KILL_SWITCH' })
        }));

        // Expect NO OUTBOUND
        expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('STEP 2: Enable Tenant & End-to-End Flow', async () => {
        // Tenant 1: Enabled
        mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', isAiEnabled: true });

        // Services Mock
        mockPrisma.service.findMany.mockResolvedValue([{ name: 'Test Service', description: 'Test' }]);

        // Send Message
        await orchestrator.processInboundMessage('tenant-1', 'user-1', 'Hello');

        // Audit Log: RESPONSE GENERATED
        expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ eventType: 'AI_RESPONSE_GENERATED' })
        }));

        // Outbound Queue: Message Added
        expect(mockQueue.add).toHaveBeenCalledTimes(1);
    });

    it('STEP 3: Safety Guardrail in Prod', async () => {
        mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', isAiEnabled: true });

        // Mock Provider returning Violation
        const mockBadProvider = {
            generateResponse: vi.fn().mockResolvedValue('The price is $100.')
        };
        (orchestrator as any).provider = mockBadProvider;

        await orchestrator.processInboundMessage('tenant-1', 'user-1', 'Price?');

        // Expect Violation Log
        expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ eventType: 'AI_GUARDRAIL_VIOLATION' })
        }));

        // Output Blocked (Fallback sent? Yes, Orchestrator sends fallback)
        expect(mockQueue.add).toHaveBeenCalledWith('message', expect.objectContaining({
            content: expect.stringContaining("cannot process that request")
        }));
    });
});
