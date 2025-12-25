// import { BaseChatModel } from '@langchain/core/language_models/chat_models';
// import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';

export interface AIResponseWithConfidence {
    text: string;
    confidence: number;  // 0-100 percentage
    intent?: 'ORDER' | 'FAQ' | 'COLLECT_INFO' | 'ESCALATE' | 'GENERAL';
    extractedData?: Record<string, any>;
}

export interface AIProvider {
    generateResponse(
        systemPrompt: string,
        userMessage: string,
        history?: any[], //(AIMessage | HumanMessage | SystemMessage)[],
        metadata?: any
    ): Promise<string>;

    // New method with confidence
    generateResponseWithConfidence?(
        systemPrompt: string,
        userMessage: string,
        history?: any[],
        metadata?: any
    ): Promise<AIResponseWithConfidence>;
}

export interface AIResponse {
    text: string;
    confidence: number;
    toolCalls?: any[];
}

