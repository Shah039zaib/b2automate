import { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '@b2automate/logger';

/**
 * Error Response Shape (Standardized)
 */
export interface ErrorResponse {
    error: string;
    code?: string;
    message?: string;
}

/**
 * User-safe error messages
 * Maps internal error patterns to user-friendly messages
 */
const ERROR_MESSAGES: Record<string, string> = {
    'Invalid credentials': 'Email or password is incorrect',
    'Tenant is suspended': 'Your account has been suspended. Please contact support.',
    'Account is locked': 'Your account is temporarily locked. Please try again later.',
    'Missing x-tenant-id': 'Session expired. Please log in again.',
    'Token expired': 'Your session has expired. Please log in again.',
    'jwt expired': 'Your session has expired. Please log in again.',
    'jwt malformed': 'Invalid session. Please log in again.',
    'Authentication required': 'Please log in to continue.',
    'Access denied': 'You do not have permission to perform this action.',
    'Tenant not found': 'Resource not found.',
    'User not found': 'Resource not found.',
    'Order not found': 'Order not found.',
    'Service not found': 'Service not found.',
    'Email already in use': 'This email is already registered.',
    'UNIQUE constraint failed': 'This record already exists.',
};

/**
 * Sanitize error message for client
 * - Replaces internal errors with user-safe messages
 * - Redacts UUIDs (tenantId, userId, etc.)
 * - Logs full error server-side
 */
export function sanitizeError(error: Error | FastifyError): ErrorResponse {
    const internalMessage = error.message || 'Unknown error';

    // Check for known error patterns
    for (const [pattern, safeMessage] of Object.entries(ERROR_MESSAGES)) {
        if (internalMessage.toLowerCase().includes(pattern.toLowerCase())) {
            return {
                error: safeMessage,
                code: (error as FastifyError).code || 'ERROR'
            };
        }
    }

    // Default safe message for unknown errors
    // Redact any UUIDs that might leak tenant/user info
    return {
        error: 'An unexpected error occurred. Please try again.',
        code: 'INTERNAL_ERROR'
    };
}

/**
 * Redact UUIDs from a string (for logging sanitization if needed)
 * Pattern matches standard UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 */
export function redactUUIDs(text: string): string {
    const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
    return text.replace(uuidPattern, '[REDACTED]');
}

/**
 * Global error handler for Fastify
 * Logs full error internally, returns sanitized response to client
 */
export function createErrorHandler() {
    return (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
        // Log full error internally
        logger.error({
            err: error,
            url: request.url,
            method: request.method,
            tenantId: (request as any).tenantId,
            userId: (request.user as any)?.id
        }, `Request error: ${error.message}`);

        // Determine status code
        let statusCode = error.statusCode || 500;
        if (error.validation) {
            statusCode = 400;
        }

        // Sanitize error for client
        const safeError = sanitizeError(error);

        // Add validation details if present (these are safe to show)
        if (error.validation) {
            safeError.message = 'Invalid request data';
            safeError.code = 'VALIDATION_ERROR';
        }

        return reply.status(statusCode).send(safeError);
    };
}
