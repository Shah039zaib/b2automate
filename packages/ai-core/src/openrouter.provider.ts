import { ChatOpenAI } from '@langchain/openai';
import { AIProvider, AIResponseWithConfidence } from './provider.interface';
import { logger } from '@b2automate/logger';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

/**
 * OpenRouter Model Registry
 * 
 * OpenRouter is a MODEL GATEWAY supporting 400+ models via single API.
 * This registry provides:
 * - Verified allowlists by cost tier (FREE, LOW_COST, PREMIUM)
 * - Dynamic model selection - any valid OpenRouter model string works
 * - Safe defaults for cost-conscious launches
 * 
 * @see https://openrouter.ai/models (full list)
 * @see https://openrouter.ai/docs (API docs)
 */
export const OPENROUTER_MODEL_REGISTRY = {
    /**
     * FREE TIER - $0 cost (rate limited: 50/day without credits, 1000/day with $10+ credits)
     * Models verified as of Dec 2024 - check openrouter.ai/models for latest
     * 
     * Note: Free models often have ":free" suffix
     */
    FREE: [
        // Google
        'google/gemini-2.0-flash-exp:free',
        'google/gemma-3-4b-it:free',
        // Meta
        'meta-llama/llama-3.2-3b-instruct:free',
        'meta-llama/llama-3.3-70b-instruct:free',
        // Mistral
        'mistralai/mistral-7b-instruct:free',
        'mistralai/mistral-small-3.1-24b-instruct:free',
        // DeepSeek
        'deepseek/deepseek-chat:free',
        'deepseek/deepseek-r1:free',
        // NVIDIA
        'nvidia/llama-3.1-nemotron-70b-instruct:free',
        // Qwen
        'qwen/qwen-2.5-7b-instruct:free',
        'qwen/qwen-2.5-72b-instruct:free',
    ],

    /**
     * LOW COST - Very cheap models (~$0.0001-0.001 per 1K tokens)
     * Good for production with high volume
     */
    LOW_COST: [
        'deepseek/deepseek-chat',
        'deepseek/deepseek-coder',
        'mistralai/mistral-7b-instruct',
        'mistralai/mistral-small-latest',
        'meta-llama/llama-3.1-8b-instruct',
        'meta-llama/llama-3.1-70b-instruct',
        'qwen/qwen-2.5-coder-32b-instruct',
        'anthropic/claude-3-haiku',
    ],

    /**
     * PREMIUM - Higher quality, higher cost
     * Use for complex reasoning or when quality is critical
     */
    PREMIUM: [
        'anthropic/claude-3.5-sonnet',
        'anthropic/claude-3-opus',
        'openai/gpt-4o',
        'openai/gpt-4-turbo',
        'google/gemini-1.5-pro',
        'meta-llama/llama-3.1-405b-instruct',
    ],

    /**
     * RECOMMENDED DEFAULTS by use case
     */
    DEFAULTS: {
        // Best free model for production launch
        FREE_PRODUCTION: 'google/gemini-2.0-flash-exp:free',
        // Best balance of cost and quality
        BALANCED: 'deepseek/deepseek-chat',
        // Best for coding tasks
        CODING: 'deepseek/deepseek-coder',
        // Best quality (expensive)
        QUALITY: 'anthropic/claude-3.5-sonnet',
    }
} as const;

/**
 * Model validation helper
 * - Validates model string format
 * - Optionally restricts to allowlist
 */
export function validateOpenRouterModel(
    model: string,
    options: {
        restrictToAllowlist?: boolean;
        allowlist?: readonly string[];
    } = {}
): { valid: boolean; error?: string } {
    // Basic format validation: provider/model-name
    const modelPattern = /^[a-z0-9-]+\/[a-z0-9.-]+(:free)?$/i;

    if (!model || typeof model !== 'string') {
        return { valid: false, error: 'Model name is required' };
    }

    if (!modelPattern.test(model)) {
        return {
            valid: false,
            error: `Invalid model format: "${model}". Expected: provider/model-name`
        };
    }

    // Check allowlist if restriction is enabled
    if (options.restrictToAllowlist && options.allowlist) {
        const allowed = options.allowlist.includes(model);
        if (!allowed) {
            return {
                valid: false,
                error: `Model "${model}" is not in the approved allowlist`
            };
        }
    }

    return { valid: true };
}

/**
 * Get all allowed models (combined allowlist)
 */
export function getAllAllowedModels(): string[] {
    return [
        ...OPENROUTER_MODEL_REGISTRY.FREE,
        ...OPENROUTER_MODEL_REGISTRY.LOW_COST,
        ...OPENROUTER_MODEL_REGISTRY.PREMIUM,
    ];
}

/**
 * OpenRouter AI Provider
 * 
 * A flexible, cost-aware AI provider that:
 * - Accepts ANY valid OpenRouter model string
 * - Validates model format for safety
 * - Provides cost-tier recommendations
 * - Uses OpenAI-compatible API via LangChain
 * 
 * @example
 * // Use default free model
 * new OpenRouterProvider(apiKey)
 * 
 * // Use specific model
 * new OpenRouterProvider(apiKey, 'anthropic/claude-3.5-sonnet')
 * 
 * // Use with validation
 * new OpenRouterProvider(apiKey, model, { validateModel: true })
 */
export class OpenRouterProvider implements AIProvider {
    private model: any;
    private modelName: string;

    constructor(
        apiKey: string,
        modelName: string = OPENROUTER_MODEL_REGISTRY.DEFAULTS.FREE_PRODUCTION,
        options: {
            validateModel?: boolean;
            restrictToAllowlist?: boolean;
            temperature?: number;
            appName?: string;
            siteUrl?: string;
        } = {}
    ) {
        const {
            validateModel = true,
            restrictToAllowlist = false,
            temperature = 0.3,
            appName = 'B2Automate WhatsApp AI',
            siteUrl = 'https://b2automate.com',
        } = options;

        // Validate model if enabled
        if (validateModel) {
            const validation = validateOpenRouterModel(modelName, {
                restrictToAllowlist,
                allowlist: restrictToAllowlist ? getAllAllowedModels() : undefined,
            });

            if (!validation.valid) {
                logger.warn({ modelName, error: validation.error }, 'Invalid model, using default');
                modelName = OPENROUTER_MODEL_REGISTRY.DEFAULTS.FREE_PRODUCTION;
            }
        }

        this.modelName = modelName;

        // OpenRouter uses OpenAI-compatible endpoint
        this.model = new ChatOpenAI({
            openAIApiKey: apiKey,
            modelName,
            temperature,
            configuration: {
                baseURL: 'https://openrouter.ai/api/v1',
                defaultHeaders: {
                    'HTTP-Referer': siteUrl,
                    'X-Title': appName,
                }
            }
        });

        logger.info({
            model: modelName,
            tier: this.getModelTier(modelName)
        }, 'OpenRouter provider initialized');
    }

    /**
     * Get cost tier for a model
     */
    private getModelTier(model: string): 'FREE' | 'LOW_COST' | 'PREMIUM' | 'CUSTOM' {
        if (OPENROUTER_MODEL_REGISTRY.FREE.includes(model as any)) return 'FREE';
        if (OPENROUTER_MODEL_REGISTRY.LOW_COST.includes(model as any)) return 'LOW_COST';
        if (OPENROUTER_MODEL_REGISTRY.PREMIUM.includes(model as any)) return 'PREMIUM';
        return 'CUSTOM';
    }

    /**
     * Get current model name
     */
    getModelName(): string {
        return this.modelName;
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
            const text = typeof result.content === 'string'
                ? result.content
                : JSON.stringify(result.content);

            logger.debug({
                model: this.modelName,
                tier: this.getModelTier(this.modelName)
            }, 'OpenRouter response generated');

            return text;
        } catch (error) {
            logger.error({
                error,
                model: this.modelName
            }, 'OpenRouter generation failed');
            throw error;
        }
    }

    async generateResponseWithConfidence(
        systemPrompt: string,
        userMessage: string,
        history: any[] = []
    ): Promise<AIResponseWithConfidence> {
        const text = await this.generateResponse(systemPrompt, userMessage, history);

        // Parse intent from response if available
        let intent: AIResponseWithConfidence['intent'] = 'GENERAL';
        if (text.includes('ORDER_REQUEST:')) {
            intent = 'ORDER';
        } else if (text.includes('ESCALATE_TO_HUMAN')) {
            intent = 'ESCALATE';
        }

        return {
            text,
            confidence: 85,
            intent
        };
    }
}

// Legacy export for backward compatibility
export const OPENROUTER_MODELS = {
    FREE_TIER: OPENROUTER_MODEL_REGISTRY.FREE,
    LOW_COST: OPENROUTER_MODEL_REGISTRY.LOW_COST,
    DEFAULT: OPENROUTER_MODEL_REGISTRY.DEFAULTS.FREE_PRODUCTION,
} as const;
