import { PrismaClient } from '@b2automate/database';
import { logger } from '@b2automate/logger';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, OutboundMessagePayload } from '@b2automate/shared-types';
import { MockAIProvider, AIProvider, Guardrails } from '@b2automate/ai-core';
import { OrdersService } from '../modules/orders/orders.service';
// import { OpenAIProvider } from '@b2automate/ai-core';

export class AIOrchestrator {
    private outboundQueue: Queue<OutboundMessagePayload>;
    private provider: AIProvider;
    private ordersService: OrdersService; // Dependency

    constructor(
        private prisma: PrismaClient,
        outboundQueue: Queue<OutboundMessagePayload>,
        providerType: 'OPENAI' | 'MOCK' = 'MOCK'
    ) {
        this.outboundQueue = outboundQueue;
        this.ordersService = new OrdersService(prisma); // Simple instantiation

        // In prod, load keys safely
        const apiKey = process.env.OPENAI_API_KEY || 'mock-key';

        if (providerType === 'OPENAI') {
            throw new Error('OpenAI Provider temporarily disabled');
            // this.provider = new OpenAIProvider(apiKey);
        } else {
            this.provider = new MockAIProvider();
        }
    }

    async processInboundMessage(tenantId: string, remoteJid: string, text: string) {
        logger.info({ tenantId, remoteJid }, 'AI Processing Started');

        try {
            // 0. Security Check: Kill Switch
            const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });

            if (tenant && !tenant.isAiEnabled) {
                logger.warn({ tenantId }, 'AI Execution Blocked by Kill Switch');
                await this.prisma.auditLog.create({
                    data: {
                        tenantId,
                        eventType: 'AI_BLOCKED_KILL_SWITCH',
                        metadata: { reason: 'Tenant AI Disabled' },
                        actorUserId: null
                    }
                });
                // Silent stop or notify? Silent is strictly safer for a kill switch to stop loops.
                return;
            }

            // 1. Context Building (System Prompt)
            const systemPrompt = await this.buildSystemPrompt(tenantId);

            // 2. Generate Response
            // TODO: Load history from DB
            const responseText = await this.provider.generateResponse(systemPrompt, text, []);

            // 2.5 Intent Detection (Tool Call Simulation)
            const orderMatch = responseText.match(/ORDER_REQUEST: (.+)/);
            if (orderMatch) {
                const serviceName = orderMatch[1].trim();
                logger.info({ tenantId, serviceName }, 'AI Detected Order Intent');

                // Find Service
                const service = await this.prisma.service.findFirst({
                    where: { tenantId, name: { equals: serviceName, mode: 'insensitive' }, isActive: true }
                });

                if (service) {
                    // Create Draft Order
                    const order = await this.ordersService.createDraftOrder(tenantId, remoteJid, [{ serviceId: service.id, quantity: 1 }]);

                    // Override Response
                    const confirmationMsg = `I have received your request for *${service.name}*. A draft order (ID: ${order.id.slice(0, 4)}) has been created and sent for approval.`;
                    await this.sendOutbound(tenantId, remoteJid, confirmationMsg);

                    // Audit
                    await this.prisma.auditLog.create({
                        data: { tenantId, eventType: 'AI_ORDER_DRAFT_CREATED', metadata: { orderId: order.id, service: service.name } }
                    });
                    return;
                } else {
                    // Service not found fallback
                    await this.sendOutbound(tenantId, remoteJid, `I couldn't find a service named "${serviceName}". Could you check the name?`);
                    return;
                }
            }

            // 3. Guardrails
            const validation = Guardrails.validateOutput(responseText);
            if (!validation.isValid) {
                logger.warn({ tenantId, validation }, 'AI Output Blocked by Guardrails');

                // Audit Log Violation
                await this.prisma.auditLog.create({
                    data: {
                        tenantId,
                        eventType: 'AI_GUARDRAIL_VIOLATION',
                        metadata: { input: text, output: responseText, reason: validation.reason },
                        actorUserId: null,
                        ipAddress: 'system'
                    }
                });

                // Fallback message (or silence)
                // For now, simple fallback
                await this.sendOutbound(tenantId, remoteJid, "I apologize, but I cannot process that request right now.");
                return;
            }

            // 4. Send Response
            await this.sendOutbound(tenantId, remoteJid, responseText);

            // Audit Log Success
            await this.prisma.auditLog.create({
                data: {
                    tenantId,
                    eventType: 'AI_RESPONSE_GENERATED',
                    metadata: { input: text, output: responseText },
                    actorUserId: null
                }
            });

        } catch (err) {
            logger.error({ err, tenantId }, 'AI Orchestration Failed');
        }
    }

    private async buildSystemPrompt(tenantId: string): Promise<string> {
        // Fetch Tenant Services
        const services = await this.prisma.service.findMany({
            where: { tenantId, isActive: true }
        });

        const serviceList = services.map(s => `- ${s.name}: ${s.description}`).join('\n');

        return `
You are a helpful assistant for a business.
Your goal is to answer questions based ONLY on the provided services.

AVAILABLE SERVICES:
${serviceList}

RULES:
- Do NOT mention specific prices in numbers (e.g. "$10"). If asked for price, say "I can check the price for you".
- If the user explicitly asks to order or buy a service, output EXACTLY: "ORDER_REQUEST: <Exact Service Name>"
- Do NOT confirm the order yourself.
- Do NOT invent services.
- If unsure, ask for clarification.
      `.trim();
    }

    private async sendOutbound(tenantId: string, to: string, content: string) {
        await this.outboundQueue.add('message', {
            tenantId,
            sessionId: tenantId,
            to,
            type: 'text',
            content
        });
    }
}
