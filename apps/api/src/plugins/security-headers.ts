/**
 * Security Headers Plugin
 * 
 * Implements all 7 essential security headers for HTTP hardening:
 * 1. Content-Security-Policy (CSP)
 * 2. Strict-Transport-Security (HSTS)
 * 3. X-Frame-Options
 * 4. X-Content-Type-Options
 * 5. Referrer-Policy
 * 6. Permissions-Policy
 * 7. X-XSS-Protection
 * 
 * @module plugins/security-headers
 */

import { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

/**
 * Security headers configuration options
 */
export interface SecurityHeadersOptions {
    /** Enable HSTS header (default: true in production) */
    enableHSTS?: boolean;
    /** HSTS max-age in seconds (default: 31536000 = 1 year) */
    hstsMaxAge?: number;
    /** Include subdomains in HSTS (default: true) */
    hstsIncludeSubDomains?: boolean;
    /** CSP report-only mode (default: false) */
    cspReportOnly?: boolean;
    /** CSP report URI for violations */
    cspReportUri?: string;
    /** Custom CSP directives to merge */
    customCSP?: Partial<CSPDirectives>;
    /** Disable specific headers */
    disableHeaders?: string[];
}

/**
 * CSP directive types
 */
interface CSPDirectives {
    'default-src': string[];
    'script-src': string[];
    'style-src': string[];
    'img-src': string[];
    'font-src': string[];
    'connect-src': string[];
    'frame-ancestors': string[];
    'form-action': string[];
    'base-uri': string[];
    'object-src': string[];
    'upgrade-insecure-requests'?: boolean;
}

/**
 * Default CSP directives - restrictive but functional
 */
const DEFAULT_CSP_DIRECTIVES: CSPDirectives = {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'"], // Needed for some frameworks
    'style-src': ["'self'", "'unsafe-inline'"], // Needed for inline styles
    'img-src': ["'self'", 'data:', 'https:'],
    'font-src': ["'self'", 'https://fonts.gstatic.com'],
    'connect-src': ["'self'", 'https://api.openai.com', 'https://openrouter.ai'],
    'frame-ancestors': ["'none'"],
    'form-action': ["'self'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
    'upgrade-insecure-requests': true,
};

/**
 * Build CSP header string from directives
 */
function buildCSPString(directives: CSPDirectives): string {
    const parts: string[] = [];

    for (const [directive, value] of Object.entries(directives)) {
        if (directive === 'upgrade-insecure-requests') {
            if (value) {
                parts.push('upgrade-insecure-requests');
            }
        } else if (Array.isArray(value) && value.length > 0) {
            parts.push(`${directive} ${value.join(' ')}`);
        }
    }

    return parts.join('; ');
}

/**
 * Security Headers Plugin
 * 
 * Adds comprehensive security headers to all HTTP responses.
 * These headers protect against common web vulnerabilities including:
 * - XSS attacks
 * - Clickjacking
 * - MIME sniffing
 * - Protocol downgrade attacks
 * - Information leakage
 */
const securityHeadersPlugin: FastifyPluginAsync<SecurityHeadersOptions> = async (
    fastify: FastifyInstance,
    options: SecurityHeadersOptions = {}
) => {
    const {
        enableHSTS = process.env.NODE_ENV === 'production',
        hstsMaxAge = 31536000, // 1 year
        hstsIncludeSubDomains = true,
        cspReportOnly = false,
        cspReportUri,
        customCSP = {},
        disableHeaders = [],
    } = options;

    // Merge custom CSP with defaults
    const cspDirectives: CSPDirectives = {
        ...DEFAULT_CSP_DIRECTIVES,
        ...customCSP,
    };

    // Build CSP string
    let cspString = buildCSPString(cspDirectives);
    if (cspReportUri) {
        cspString += `; report-uri ${cspReportUri}`;
    }

    // Header configurations
    const headers: Record<string, string> = {};

    // 1. Content-Security-Policy (CSP)
    // Prevents XSS, injection attacks, and other code execution vulnerabilities
    if (!disableHeaders.includes('csp')) {
        const cspHeaderName = cspReportOnly
            ? 'Content-Security-Policy-Report-Only'
            : 'Content-Security-Policy';
        headers[cspHeaderName] = cspString;
    }

    // 2. Strict-Transport-Security (HSTS)
    // Forces HTTPS connections, prevents protocol downgrade attacks
    if (enableHSTS && !disableHeaders.includes('hsts')) {
        let hstsValue = `max-age=${hstsMaxAge}`;
        if (hstsIncludeSubDomains) {
            hstsValue += '; includeSubDomains';
        }
        headers['Strict-Transport-Security'] = hstsValue;
    }

    // 3. X-Frame-Options
    // Prevents clickjacking by disallowing iframe embedding
    if (!disableHeaders.includes('x-frame-options')) {
        headers['X-Frame-Options'] = 'DENY';
    }

    // 4. X-Content-Type-Options
    // Prevents MIME sniffing attacks
    if (!disableHeaders.includes('x-content-type-options')) {
        headers['X-Content-Type-Options'] = 'nosniff';
    }

    // 5. Referrer-Policy
    // Controls information leaked in Referer header
    if (!disableHeaders.includes('referrer-policy')) {
        headers['Referrer-Policy'] = 'strict-origin-when-cross-origin';
    }

    // 6. Permissions-Policy (formerly Feature-Policy)
    // Restricts browser features and APIs
    if (!disableHeaders.includes('permissions-policy')) {
        headers['Permissions-Policy'] = [
            'accelerometer=()',
            'camera=()',
            'geolocation=()',
            'gyroscope=()',
            'magnetometer=()',
            'microphone=()',
            'payment=(self)',
            'usb=()',
        ].join(', ');
    }

    // 7. X-XSS-Protection (legacy but still useful)
    // Enables browser's XSS filter
    if (!disableHeaders.includes('x-xss-protection')) {
        headers['X-XSS-Protection'] = '1; mode=block';
    }

    // Add hook to set headers on all responses
    fastify.addHook('onSend', async (
        request: FastifyRequest,
        reply: FastifyReply,
        payload: unknown
    ) => {
        // Apply all security headers
        for (const [name, value] of Object.entries(headers)) {
            reply.header(name, value);
        }

        return payload;
    });

    // Log security headers configuration
    fastify.log.info({
        headers: Object.keys(headers),
        hsts: enableHSTS,
        cspReportOnly,
    }, 'Security headers plugin registered');
};

// Export as Fastify plugin
export default fp(securityHeadersPlugin, {
    fastify: '4.x',
    name: 'security-headers',
});

// Named export for direct import
export { securityHeadersPlugin };
