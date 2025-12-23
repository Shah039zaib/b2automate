// import { BaseChatModel } from '@langchain/core/language_models/chat_models';
// import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';

export interface AIProvider {
    generateResponse(
        systemPrompt: string,
        userMessage: string,
        history?: any[], //(AIMessage | HumanMessage | SystemMessage)[],
        metadata?: any
    ): Promise<string>;
}

export interface AIResponse {
    text: string;
    confidence: number;
    toolCalls?: any[];
}
