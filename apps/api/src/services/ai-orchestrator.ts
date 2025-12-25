import { PrismaClient } from '@b2automate/database';
import { logger } from '@b2automate/logger';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, OutboundMessagePayload } from '@b2automate/shared-types';
import { MockAIProvider, OpenAIProvider, OpenRouterProvider, OPENROUTER_MODELS, AIProvider, Guardrails, AIResponseWithConfidence } from '@b2automate/ai-core';
import { OrdersService } from '../modules/orders/orders.service';
import { AiGovernanceService, BlockReason } from './ai-governance.service';

// Configuration
const CONFIDENCE_THRESHOLD = 85; // 85% confidence required

export class AIOrchestrator {
    private outboundQueue: Queue<OutboundMessagePayload>;
    private ordersService: OrdersService;
    private governanceService: AiGovernanceService;

    constructor(
        private prisma: PrismaClient,
        outboundQueue: Queue<OutboundMessagePayload>
    ) {
        this.outboundQueue = outboundQueue;
        this.ordersService = new OrdersService(prisma);
        this.governanceService = new AiGovernanceService(prisma);
    }

    /**
     * Create AI provider for a specific model
     */
    private createProvider(model: string): AIProvider {
        const openaiKey = process.env.OPENAI_API_KEY || '';
        const openrouterKey = process.env.OPENROUTER_API_KEY || '';

        // Determine provider based on model and available keys
        // OpenRouter models have format: provider/model-name
        if (model.includes('/') && openrouterKey) {
            logger.debug({ model }, 'Creating OpenRouter provider');
            return new OpenRouterProvider(openrouterKey, model);
        } else if (openaiKey && openaiKey !== 'mock-key') {
            logger.debug('Creating OpenAI provider');
            return new OpenAIProvider(openaiKey);
        } else {
            logger.debug('Creating Mock provider');
            return new MockAIProvider();
        }
    }

    /**
     * Get recent conversation history for context
     * Limits to last 10 messages or ~2000 chars to prevent token explosion
     */
    private async getConversationHistory(tenantId: string, remoteJid: string): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
        const MAX_MESSAGES = 10;
        const MAX_TOTAL_CHARS = 2000; // ~500 tokens approx

        // Find or create conversation
        let conversation = await this.prisma.conversation.findFirst({
            where: { tenantId, customerJid: remoteJid }
        });

        if (!conversation) {
            return [];
        }

        // Get recent messages
        const messages = await this.prisma.message.findMany({
            where: { conversationId: conversation.id },
            orderBy: { timestamp: 'desc' },
            take: MAX_MESSAGES,
            select: {
                direction: true,
                content: true
            }
        });

        // Reverse to chronological order and limit by character count
        const chronological = messages.reverse();
        const history: { role: 'user' | 'assistant'; content: string }[] = [];
        let totalChars = 0;

        for (const msg of chronological) {
            if (totalChars + msg.content.length > MAX_TOTAL_CHARS) {
                break; // Stop adding if we'd exceed char limit
            }
            history.push({
                role: msg.direction === 'INBOUND' ? 'user' : 'assistant',
                content: msg.content
            });
            totalChars += msg.content.length;
        }

        logger.debug({ tenantId, historyCount: history.length, totalChars }, 'Loaded conversation history');
        return history;
    }

    async processInboundMessage(tenantId: string, remoteJid: string, text: string) {
        logger.info({ tenantId, remoteJid }, 'AI Processing Started');

        try {
            // ============================================
            // 0. AI GOVERNANCE CHECK (NEW - Enforces ALL limits)
            // ============================================
            const accessResult = await this.governanceService.checkAiAccessAndResolveModel(tenantId);

            if (!accessResult.allowed) {
                logger.warn({
                    tenantId,
                    blockReason: accessResult.blockReason
                }, 'AI request blocked by governance');

                // Send safe fallback message
                const message = this.governanceService.getFallbackMessage(accessResult.blockReason as BlockReason);
                await this.sendOutbound(tenantId, remoteJid, message);

                // Log to audit (governance service already logs to AiUsageLog)
                await this.prisma.auditLog.create({
                    data: {
                        tenantId,
                        eventType: `AI_BLOCKED_${accessResult.blockReason}`,
                        metadata: {
                            reason: accessResult.blockReason,
                            tier: accessResult.tier
                        },
                        actorUserId: null
                    }
                });

                return;
            }

            // ============================================
            // 1. CREATE PROVIDER WITH RESOLVED MODEL
            // ============================================
            const provider = this.createProvider(accessResult.resolvedModel);

            logger.info({
                tenantId,
                model: accessResult.resolvedModel,
                tier: accessResult.tier
            }, 'AI access granted, using model');

            // 2. Build System Prompt
            const systemPrompt = await this.buildSystemPrompt(tenantId);

            // 2.5. Get Conversation History (with limits to prevent token explosion)
            const conversationHistory = await this.getConversationHistory(tenantId, remoteJid);

            // 3. Generate Response WITH Confidence
            let aiResponse: AIResponseWithConfidence;

            if (provider.generateResponseWithConfidence) {
                aiResponse = await provider.generateResponseWithConfidence(systemPrompt, text, conversationHistory);
            } else {
                // Fallback for providers without confidence
                const responseText = await provider.generateResponse(systemPrompt, text, conversationHistory);
                aiResponse = { text: responseText, confidence: 80, intent: 'GENERAL' };
            }

            logger.info({ tenantId, confidence: aiResponse.confidence, intent: aiResponse.intent }, 'AI Response Generated');


            // ============================================
            // 3. CONFIDENCE THRESHOLD CHECK
            // ============================================
            if (aiResponse.confidence < CONFIDENCE_THRESHOLD) {
                logger.warn({ tenantId, confidence: aiResponse.confidence }, 'AI confidence below threshold - escalating');

                await this.prisma.auditLog.create({
                    data: {
                        tenantId,
                        eventType: 'AI_LOW_CONFIDENCE_ESCALATION',
                        metadata: {
                            input: text,
                            confidence: aiResponse.confidence,
                            threshold: CONFIDENCE_THRESHOLD
                        }
                    }
                });

                await this.sendOutbound(tenantId, remoteJid,
                    "I'm not entirely sure about this. Let me connect you with our team for better assistance. A staff member will respond shortly."
                );
                return;
            }

            // ============================================
            // 4. MANUAL TAKEOVER DETECTION (Escalation)
            // ============================================
            if (aiResponse.intent === 'ESCALATE' || aiResponse.text.includes('ESCALATE_TO_HUMAN')) {
                logger.info({ tenantId, remoteJid }, 'Customer requested human assistance - escalating');

                await this.prisma.auditLog.create({
                    data: {
                        tenantId,
                        eventType: 'AI_MANUAL_TAKEOVER_REQUESTED',
                        metadata: {
                            customerJid: remoteJid,
                            input: text,
                            reason: 'Customer requested human'
                        }
                    }
                });

                await this.sendOutbound(tenantId, remoteJid,
                    "I understand you'd like to speak with a team member. I'm connecting you now. A staff member will respond shortly. Thank you for your patience!"
                );
                return;
            }

            // ============================================
            // 5. CUSTOMER DETAILS COLLECTION
            // ============================================
            if (aiResponse.intent === 'COLLECT_INFO' && aiResponse.extractedData && Object.keys(aiResponse.extractedData).length > 0) {
                logger.info({ tenantId, data: aiResponse.extractedData }, 'Customer details collected');

                await this.prisma.auditLog.create({
                    data: {
                        tenantId,
                        eventType: 'CUSTOMER_DETAILS_COLLECTED',
                        metadata: {
                            customerJid: remoteJid,
                            collectedData: aiResponse.extractedData
                        }
                    }
                });

                const collectedFields = Object.keys(aiResponse.extractedData).join(', ');
                await this.sendOutbound(tenantId, remoteJid,
                    `Thank you! I've noted your ${collectedFields}. Is there anything else you'd like to add or should I proceed?`
                );
                return;
            }

            // ============================================
            // 6. ORDER INTENT DETECTION
            // ============================================
            const orderMatch = aiResponse.text.match(/ORDER_REQUEST: (.+)/);
            if (orderMatch) {
                const serviceName = orderMatch[1].trim();
                logger.info({ tenantId, serviceName }, 'AI Detected Order Intent');

                const service = await this.prisma.service.findFirst({
                    where: { tenantId, name: { equals: serviceName, mode: 'insensitive' }, isActive: true }
                });

                if (service) {
                    const order = await this.ordersService.createDraftOrder(tenantId, remoteJid, [{ serviceId: service.id, quantity: 1 }]);

                    const confirmationMsg = `I have received your request for *${service.name}*. A draft order (ID: ${order.id.slice(0, 4)}) has been created and sent for approval.`;
                    await this.sendOutbound(tenantId, remoteJid, confirmationMsg);

                    await this.prisma.auditLog.create({
                        data: { tenantId, eventType: 'AI_ORDER_DRAFT_CREATED', metadata: { orderId: order.id, service: service.name } }
                    });
                    return;
                } else {
                    await this.sendOutbound(tenantId, remoteJid, `I couldn't find a service named "${serviceName}". Could you check the name?`);
                    return;
                }
            }

            // ============================================
            // 7. GUARDRAILS CHECK
            // ============================================
            const validation = Guardrails.validateOutput(aiResponse.text);
            if (!validation.isValid) {
                logger.warn({ tenantId, validation }, 'AI Output Blocked by Guardrails');

                await this.prisma.auditLog.create({
                    data: {
                        tenantId,
                        eventType: 'AI_GUARDRAIL_VIOLATION',
                        metadata: { input: text, output: aiResponse.text, reason: validation.reason },
                        actorUserId: null,
                        ipAddress: 'system'
                    }
                });

                await this.sendOutbound(tenantId, remoteJid, "I apologize, but I cannot process that request right now.");
                return;
            }

            // ============================================
            // 8. SEND NORMAL RESPONSE
            // ============================================
            await this.sendOutbound(tenantId, remoteJid, aiResponse.text);

            await this.prisma.auditLog.create({
                data: {
                    tenantId,
                    eventType: 'AI_RESPONSE_GENERATED',
                    metadata: {
                        input: text,
                        output: aiResponse.text,
                        confidence: aiResponse.confidence,
                        intent: aiResponse.intent
                    },
                    actorUserId: null
                }
            });

        } catch (err) {
            logger.error({ err, tenantId, remoteJid }, 'AI Orchestration Failed');

            // ============================================
            // AI FAILURE FALLBACK: Send safe message to customer
            // ============================================
            try {
                await this.sendOutbound(tenantId, remoteJid,
                    "Thank you for your message. We're experiencing a temporary issue. A team member will respond to you shortly."
                );

                await this.prisma.auditLog.create({
                    data: {
                        tenantId,
                        eventType: 'AI_FAILURE_FALLBACK_SENT',
                        metadata: {
                            error: (err as Error).message,
                            customerJid: remoteJid
                        },
                        actorUserId: null
                    }
                });
            } catch (fallbackErr) {
                logger.error({ fallbackErr, tenantId }, 'Failed to send AI fallback message');
            }
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
