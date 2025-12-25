/**
 * AI Governance Service
 * 
 * Centralized enforcement of AI access rules:
 * - Global and tenant kill switches
 * - Plan-based daily/monthly limits
 * - Tier-based model allowlists
 * - Usage logging and tracking
 * 
 * This is the SINGLE source of truth for AI access decisions.
 */

import { PrismaClient, AiTier, AiPlan } from '@b2automate/database';
import { logger } from '@b2automate/logger';
import { OPENROUTER_MODEL_REGISTRY } from '@b2automate/ai-core';

// ============================================
// TYPES
// ============================================

export interface AiAccessResult {
    allowed: boolean;
    resolvedModel: string;
    tier: AiTier;
    blockReason?: string;
}

export type BlockReason =
    | 'GLOBAL_AI_DISABLED'
    | 'TENANT_AI_DISABLED'
    | 'DAILY_LIMIT_EXCEEDED'
    | 'MONTHLY_LIMIT_EXCEEDED'
    | 'MODEL_NOT_ALLOWED'
    | 'TENANT_NOT_FOUND';

// ============================================
// MODEL TIER MAPPING
// ============================================

/**
 * Get allowed models for a given tier
 * Higher tiers include all models from lower tiers
 */
export function getModelsForTier(tier: AiTier): string[] {
    const FREE = [...OPENROUTER_MODEL_REGISTRY.FREE];
    const LOW_COST = [...OPENROUTER_MODEL_REGISTRY.LOW_COST];
    const PREMIUM = [...OPENROUTER_MODEL_REGISTRY.PREMIUM];

    switch (tier) {
        case 'FREE':
            return FREE;
        case 'LOW':
            return [...FREE, ...LOW_COST];
        case 'MEDIUM':
            return [...FREE, ...LOW_COST, ...PREMIUM];
        case 'HIGH':
            // HIGH tier allows ALL models (no restriction)
            return [];  // Empty means "all allowed"
        default:
            return FREE;
    }
}

/**
 * Get default model for a tier
 */
export function getDefaultModelForTier(tier: AiTier): string {
    switch (tier) {
        case 'FREE':
            return OPENROUTER_MODEL_REGISTRY.DEFAULTS.FREE_PRODUCTION;
        case 'LOW':
            return OPENROUTER_MODEL_REGISTRY.DEFAULTS.BALANCED;
        case 'MEDIUM':
            return OPENROUTER_MODEL_REGISTRY.DEFAULTS.BALANCED;
        case 'HIGH':
            return OPENROUTER_MODEL_REGISTRY.DEFAULTS.QUALITY;
        default:
            return OPENROUTER_MODEL_REGISTRY.DEFAULTS.FREE_PRODUCTION;
    }
}

/**
 * Check if model is allowed for tier
 */
export function isModelAllowedForTier(model: string, tier: AiTier): boolean {
    // HIGH tier allows ALL models
    if (tier === 'HIGH') return true;

    const allowedModels = getModelsForTier(tier);
    return allowedModels.includes(model);
}

// ============================================
// DEFAULT LIMITS BY PLAN
// ============================================

export const DEFAULT_LIMITS: Record<AiPlan, { daily: number; monthly: number; tier: AiTier }> = {
    FREE: { daily: 50, monthly: 1000, tier: 'FREE' },
    PAID_BASIC: { daily: 500, monthly: 10000, tier: 'LOW' },
    PAID_PRO: { daily: 2000, monthly: 50000, tier: 'MEDIUM' },
    ENTERPRISE: { daily: 999999, monthly: 999999, tier: 'HIGH' }
};

// ============================================
// SAFE FALLBACK MESSAGES
// ============================================

export const FALLBACK_MESSAGES: Record<BlockReason, string> = {
    GLOBAL_AI_DISABLED:
        "Thank you for your message. Our automated assistant is currently unavailable. A team member will respond shortly.",
    TENANT_AI_DISABLED:
        "Thank you for your message. Our automated assistant is temporarily offline. A team member will respond shortly.",
    DAILY_LIMIT_EXCEEDED:
        "Thank you for your message. Our automated assistant has reached its capacity for today. A team member will respond shortly.",
    MONTHLY_LIMIT_EXCEEDED:
        "Thank you for your message. Our automated assistant is currently unavailable. A team member will respond shortly.",
    MODEL_NOT_ALLOWED:
        "Thank you for your message. A team member will respond shortly.",
    TENANT_NOT_FOUND:
        "Thank you for your message. A team member will respond shortly."
};

// ============================================
// AI GOVERNANCE SERVICE
// ============================================

export class AiGovernanceService {
    constructor(private prisma: PrismaClient) { }

    /**
     * Check AI access and resolve the model to use
     * 
     * @param tenantId - The tenant making the request
     * @param requestedModel - The model requested (optional, uses tenant default if not specified)
     * @returns AiAccessResult with allowed status and resolved model
     */
    async checkAiAccessAndResolveModel(
        tenantId: string,
        requestedModel?: string
    ): Promise<AiAccessResult> {
        // ============================================
        // 1. GLOBAL KILL SWITCH
        // ============================================
        const systemSettings = await this.prisma.systemSettings.findUnique({
            where: { id: 'system' }
        });

        if (systemSettings && !systemSettings.globalAiEnabled) {
            logger.warn({ tenantId }, 'AI blocked by global kill switch');
            await this.logUsage(tenantId, requestedModel || 'none', 'FREE', true, 'GLOBAL_AI_DISABLED');
            return {
                allowed: false,
                resolvedModel: '',
                tier: 'FREE',
                blockReason: 'GLOBAL_AI_DISABLED'
            };
        }

        // ============================================
        // 2. FETCH TENANT
        // ============================================
        const tenant = await this.prisma.tenant.findUnique({
            where: { id: tenantId }
        });

        if (!tenant) {
            logger.error({ tenantId }, 'Tenant not found for AI access check');
            return {
                allowed: false,
                resolvedModel: '',
                tier: 'FREE',
                blockReason: 'TENANT_NOT_FOUND'
            };
        }

        // ============================================
        // 3. TENANT AI KILL SWITCH
        // ============================================
        if (!tenant.isAiEnabled) {
            logger.warn({ tenantId }, 'AI blocked by tenant kill switch');
            await this.logUsage(tenantId, requestedModel || 'none', tenant.aiTier, true, 'TENANT_AI_DISABLED');
            return {
                allowed: false,
                resolvedModel: '',
                tier: tenant.aiTier,
                blockReason: 'TENANT_AI_DISABLED'
            };
        }

        // ============================================
        // 4. DAILY LIMIT CHECK
        // ============================================
        // Check if we need to reset daily counter (simple daily boundary check)
        const now = new Date();
        const resetAt = new Date(tenant.aiUsageResetAt);
        const daysSinceReset = Math.floor((now.getTime() - resetAt.getTime()) / (24 * 60 * 60 * 1000));

        let currentDailyUsage = tenant.aiDailyUsage;
        let currentMonthlyUsage = tenant.aiMonthlyUsage;

        // If more than 1 day since reset, counters should be considered reset
        if (daysSinceReset >= 1) {
            currentDailyUsage = 0;
            // If more than 30 days, reset monthly too
            if (daysSinceReset >= 30) {
                currentMonthlyUsage = 0;
            }
        }

        if (currentDailyUsage >= tenant.aiDailyLimit) {
            logger.warn({ tenantId, usage: currentDailyUsage, limit: tenant.aiDailyLimit }, 'Daily AI limit exceeded');
            await this.logUsage(tenantId, requestedModel || 'none', tenant.aiTier, true, 'DAILY_LIMIT_EXCEEDED');
            return {
                allowed: false,
                resolvedModel: '',
                tier: tenant.aiTier,
                blockReason: 'DAILY_LIMIT_EXCEEDED'
            };
        }

        // ============================================
        // 5. MONTHLY LIMIT CHECK
        // ============================================
        if (currentMonthlyUsage >= tenant.aiMonthlyLimit) {
            logger.warn({ tenantId, usage: currentMonthlyUsage, limit: tenant.aiMonthlyLimit }, 'Monthly AI limit exceeded');
            await this.logUsage(tenantId, requestedModel || 'none', tenant.aiTier, true, 'MONTHLY_LIMIT_EXCEEDED');
            return {
                allowed: false,
                resolvedModel: '',
                tier: tenant.aiTier,
                blockReason: 'MONTHLY_LIMIT_EXCEEDED'
            };
        }

        // ============================================
        // 6. MODEL TIER VALIDATION
        // ============================================
        // Determine which model to use
        let modelToUse = requestedModel || tenant.aiCustomModel || getDefaultModelForTier(tenant.aiTier);

        // ENTERPRISE can use custom model
        if (tenant.aiPlan === 'ENTERPRISE' && tenant.aiCustomModel) {
            modelToUse = tenant.aiCustomModel;
        }

        // Check if model is allowed for tenant's tier
        if (!isModelAllowedForTier(modelToUse, tenant.aiTier)) {
            logger.warn({ tenantId, model: modelToUse, tier: tenant.aiTier }, 'Model not allowed for tier, using fallback');

            // Fallback to tier default
            modelToUse = getDefaultModelForTier(tenant.aiTier);

            // Log the model override (not a block, just a fallback)
            await this.logUsage(tenantId, modelToUse, tenant.aiTier, false, undefined);
        }

        // ============================================
        // 7. INCREMENT COUNTERS (ATOMIC)
        // ============================================
        await this.prisma.tenant.update({
            where: { id: tenantId },
            data: {
                aiDailyUsage: { increment: 1 },
                aiMonthlyUsage: { increment: 1 },
                // Reset counters if needed
                ...(daysSinceReset >= 1 && {
                    aiDailyUsage: 1,
                    aiUsageResetAt: now
                }),
                ...(daysSinceReset >= 30 && {
                    aiMonthlyUsage: 1
                })
            }
        });

        // ============================================
        // 8. LOG SUCCESSFUL ACCESS
        // ============================================
        await this.logUsage(tenantId, modelToUse, tenant.aiTier, false, undefined);

        logger.info({
            tenantId,
            model: modelToUse,
            tier: tenant.aiTier,
            plan: tenant.aiPlan
        }, 'AI access granted');

        return {
            allowed: true,
            resolvedModel: modelToUse,
            tier: tenant.aiTier
        };
    }

    /**
     * Log AI usage to AiUsageLog table
     */
    private async logUsage(
        tenantId: string,
        model: string,
        tier: AiTier,
        wasBlocked: boolean,
        blockReason?: string
    ): Promise<void> {
        try {
            await this.prisma.aiUsageLog.create({
                data: {
                    tenantId,
                    model,
                    tier,
                    wasBlocked,
                    blockReason
                }
            });
        } catch (error) {
            // Don't fail the main request if logging fails
            logger.error({ error, tenantId }, 'Failed to log AI usage');
        }
    }

    /**
     * Get fallback message for a block reason
     */
    getFallbackMessage(blockReason: BlockReason): string {
        return FALLBACK_MESSAGES[blockReason] || FALLBACK_MESSAGES.GLOBAL_AI_DISABLED;
    }

    /**
     * Get AI usage stats for a tenant
     */
    async getTenantUsageStats(tenantId: string): Promise<{
        dailyUsage: number;
        dailyLimit: number;
        monthlyUsage: number;
        monthlyLimit: number;
        plan: AiPlan;
        tier: AiTier;
    } | null> {
        const tenant = await this.prisma.tenant.findUnique({
            where: { id: tenantId },
            select: {
                aiDailyUsage: true,
                aiDailyLimit: true,
                aiMonthlyUsage: true,
                aiMonthlyLimit: true,
                aiPlan: true,
                aiTier: true
            }
        });

        if (!tenant) return null;

        return {
            dailyUsage: tenant.aiDailyUsage,
            dailyLimit: tenant.aiDailyLimit,
            monthlyUsage: tenant.aiMonthlyUsage,
            monthlyLimit: tenant.aiMonthlyLimit,
            plan: tenant.aiPlan,
            tier: tenant.aiTier
        };
    }
}
