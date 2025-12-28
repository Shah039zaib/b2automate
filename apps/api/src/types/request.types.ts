/**
 * Shared TypeScript types for API route handlers
 * Eliminates `any` types by providing proper interfaces
 */

// ============================================
// Authentication & User Types
// ============================================

export interface AuthenticatedUser {
    id: string;
    email: string;
    role: 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'STAFF';
    tenantId: string;
}

// ============================================
// Common Request Types
// ============================================

export interface IdParams {
    id: string;
}

export interface PaginationQuery {
    limit?: string;
    offset?: string;
}

// ============================================
// Admin Route Types
// ============================================

export interface TenantListQuery extends PaginationQuery {
    status?: string;
    search?: string;
}

export interface TenantCreateBody {
    name: string;
    status?: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
}

export interface TenantUpdateBody {
    name?: string;
    status?: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
    isAiEnabled?: boolean;
    isWhatsappEnabled?: boolean;
}

export interface AiSettingsBody {
    aiPlan: 'FREE' | 'PAID_BASIC' | 'PAID_PRO' | 'ENTERPRISE';
    aiTier: 'FREE' | 'LOW' | 'MEDIUM' | 'HIGH';
    aiDailyLimit: number;
    aiMonthlyLimit: number;
    aiCustomModel?: string | null;
}

export interface AuditLogQuery extends PaginationQuery {
    tenantId?: string;
    eventType?: string;
}

export interface DeleteConfirmQuery {
    confirm?: string;
}

// ============================================
// Stripe Webhook Types
// ============================================

export interface StripeEventMetadata {
    tenantId?: string;
    planId?: string;
}

// ============================================
// Conversation Route Types
// ============================================

export interface ConversationListQuery extends PaginationQuery {
    status?: string;
}

// ============================================
// Scheduled Message Types
// ============================================

export interface ScheduledMessageQuery extends PaginationQuery {
    status?: string;
}

// ============================================
// Error Type Guard
// ============================================

export interface ErrorWithMessage {
    message?: string;
    code?: string;
    name?: string;
}

export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    const err = error as ErrorWithMessage;
    return err?.message || 'An unexpected error occurred';
}

// ============================================
// Prisma Where Clause Types
// ============================================

export interface TenantWhereClause {
    status?: string;
    name?: { contains: string; mode: 'insensitive' };
}

export interface AuditLogWhereClause {
    tenantId?: string;
    eventType?: string;
}

export interface ConversationWhereClause {
    tenantId: string;
    status?: string;
}

export interface ScheduledMessageWhereClause {
    tenantId: string;
    status?: string;
}
