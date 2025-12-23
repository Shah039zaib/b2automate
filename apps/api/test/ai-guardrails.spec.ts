import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIOrchestrator } from '../src/services/ai-orchestrator';
import { PrismaClient } from '@b2automate/database';
import { Queue } from 'bullmq';

// Mocks
const mockPrisma = {
    service: {
        findMany: vi.fn().mockResolvedValue([{ name: 'Test Service', description: 'A test service' }])
    },
    auditLog: {
        create: vi.fn()
    }
} as any;

const mockQueue = {
    add: vi.fn()
} as any;

describe('AI Orchestrator Guardrails', () => {
    let orchestrator: AIOrchestrator;

    beforeEach(() => {
        vi.clearAllMocks();
        orchestrator = new AIOrchestrator(mockPrisma, mockQueue, 'MOCK');
    });

    it('should process safe output', async () => {
        // Mock Provider returns safe text by default
        await orchestrator.processInboundMessage('tenant-1', 'user-1', 'Hello');

        // Should verify audit log Success
        expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ eventType: 'AI_RESPONSE_GENERATED' })
        }));
        // Should send outbound
        expect(mockQueue.add).toHaveBeenCalled();
    });

    it('should BLOCK output containing prices', async () => {
        // Force Mock Provider to return a price
        // "MockAIProvider" logic in src/mock.provider.ts checks if input has "price"

        await orchestrator.processInboundMessage('tenant-1', 'user-1', 'What is the price?');

        // Expected: Mock Provider returns "I cannot discuss prices directly." (Safe) ... wait.
        // The PROMPT says "Do NOT mention specific prices".
        // The MOCK Provider logic says: return "I cannot discuss prices directly." which is safe.

        // We want to test the GUARDRAIL failing.
        // We need to inject a provider that VIOLATES the rule.
        // We can mock the provider generation result directly or extend MockAIProvider?
        // Let's spy on the provider.

        vi.spyOn((orchestrator as any).provider, 'generateResponse').mockResolvedValue('The price is $50.');

        await orchestrator.processInboundMessage('tenant-1', 'user-1', 'Tell me price violations');

        // Should NOT send outbound message with price
        // Should verify audit log Violation
        expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ eventType: 'AI_GUARDRAIL_VIOLATION' })
        }));

        // Should NOT send the bad text
        expect(mockQueue.add).not.toHaveBeenCalledWith('message', expect.objectContaining({
            content: expect.stringContaining('$50')
        }));
    });
});
