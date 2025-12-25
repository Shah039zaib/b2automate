import { AIProvider, AIResponseWithConfidence } from './provider.interface';

export class MockAIProvider implements AIProvider {
    async generateResponse(systemPrompt: string, userMessage: string): Promise<string> {
        const response = await this.generateResponseWithConfidence(systemPrompt, userMessage);
        return response.text;
    }

    async generateResponseWithConfidence(
        systemPrompt: string,
        userMessage: string,
        history?: any[],
        metadata?: any
    ): Promise<AIResponseWithConfidence> {
        const lowerMessage = userMessage.toLowerCase();

        // Customer details extraction patterns
        const phonePattern = /(?:phone|mobile|contact|number|call me).*?(\+?\d{10,15})/i;
        const emailPattern = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/i;
        const namePattern = /(?:my name is|i am|this is|call me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i;
        const addressPattern = /(?:address|deliver to|location).*?(.{10,100})/i;

        const extractedData: Record<string, any> = {};
        let intent: AIResponseWithConfidence['intent'] = 'GENERAL';
        let confidence = 85; // Default confidence

        // Extract customer details
        const phoneMatch = userMessage.match(phonePattern);
        const emailMatch = userMessage.match(emailPattern);
        const nameMatch = userMessage.match(namePattern);
        const addressMatch = userMessage.match(addressPattern);

        if (phoneMatch) extractedData.phone = phoneMatch[1];
        if (emailMatch) extractedData.email = emailMatch[1];
        if (nameMatch) extractedData.name = nameMatch[1];
        if (addressMatch) extractedData.address = addressMatch[1].trim();

        // Determine intent and confidence
        if (lowerMessage.includes('price')) {
            return {
                text: "I cannot discuss prices directly. A team member will provide you with pricing details.",
                confidence: 90,
                intent: 'ESCALATE',
                extractedData
            };
        }

        if (lowerMessage.includes('speak to') || lowerMessage.includes('talk to') ||
            lowerMessage.includes('human') || lowerMessage.includes('agent') ||
            lowerMessage.includes('manager') || lowerMessage.includes('help me')) {
            return {
                text: "ESCALATE_TO_HUMAN: Customer requesting human assistance",
                confidence: 95,
                intent: 'ESCALATE',
                extractedData
            };
        }

        if (Object.keys(extractedData).length > 0) {
            intent = 'COLLECT_INFO';
            confidence = 92;
            const collected = Object.entries(extractedData)
                .map(([k, v]) => `${k}: ${v}`)
                .join(', ');
            return {
                text: `CUSTOMER_INFO_COLLECTED: ${collected}`,
                confidence,
                intent,
                extractedData
            };
        }

        if (lowerMessage.includes('order') || lowerMessage.includes('buy') || lowerMessage.includes('purchase')) {
            intent = 'ORDER';
            confidence = 88;
        }

        // Complex or unclear messages get lower confidence
        if (lowerMessage.length > 200 || userMessage.includes('?') && userMessage.split('?').length > 2) {
            confidence = 70; // Multiple questions = lower confidence
        }

        return {
            text: `[MOCK AI] Processed: ${userMessage}`,
            confidence,
            intent,
            extractedData
        };
    }
}

