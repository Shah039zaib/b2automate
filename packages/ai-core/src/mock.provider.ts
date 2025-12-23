import { AIProvider } from './provider.interface';

export class MockAIProvider implements AIProvider {
    async generateResponse(systemPrompt: string, userMessage: string): Promise<string> {
        if (userMessage.includes('price')) {
            return "I cannot discuss prices directly.";
        }
        return `[MOCK AI] Processed: ${userMessage}`;
    }
}
