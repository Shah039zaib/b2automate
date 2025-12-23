import { ChatOpenAI } from '@langchain/openai';
import { AIProvider } from './provider.interface';
import { logger } from '@b2automate/logger';
import { HumanMessage, SystemMessage } from '@langchain/core/messages'; // Keep usage but might need 'any' cast if types fail

export class OpenAIProvider implements AIProvider {
    private model: any;

    constructor(apiKey: string, modelName: string = 'gpt-3.5-turbo') {
        this.model = new ChatOpenAI({
            openAIApiKey: apiKey,
            modelName,
            temperature: 0.3 // Strict, coherent
        });
    }

    async generateResponse(
        systemPrompt: string,
        userMessage: string,
        history: any[] = []
    ): Promise<string> {
        const messages = [
            new SystemMessage(systemPrompt),
            ...history,
            new HumanMessage(userMessage)
        ];

        try {
            const result = await this.model.invoke(messages);
            const text = typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
            return text;
        } catch (error) {
            logger.error({ error }, 'OpenAI Generation Failed');
            throw error;
        }
    }
}
