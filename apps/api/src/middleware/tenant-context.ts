import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '@b2automate/logger';
import '@fastify/jwt';

declare module '@fastify/jwt' {
    interface FastifyJWT {
        user: {
            id: string;
            role: string;
            tenantId: string;
        };
    }
}

declare module 'fastify' {
    interface FastifyRequest {
        tenantId: string;
    }
}

export const tenantContextMiddleware = async (req: FastifyRequest, reply: FastifyReply) => {
    // 1. If user is authenticated via JWT, tenantId comes from there
    if (req.user) {
        req.tenantId = req.user.tenantId;
        return;
    }

    // 2. If public endpoint (e.g. login) or system webhook, check headers
    // BUT: We generally want strict auth. 
    // For open endpoints, we might not have a tenantId yet.
    // However, the rule "No query may execute without tenant context" applies to DATA ACCESS.
    // We will enforcement at the Repository/Service layer that requires tenantId.

    const headerTenantId = req.headers['x-tenant-id'];

    if (headerTenantId && typeof headerTenantId === 'string') {
        req.tenantId = headerTenantId;
    } else {
        // For protected routes, this will be caught by Auth guard.
        // For public routes, we might proceed without tenantId, but DB access must fail if it's missing.
        logger.debug({ url: req.url }, 'Request missing tenant context in headers');
    }
};

export const requireTenantId = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.tenantId) {
        logger.warn({ ip: req.ip, url: req.url }, 'Blocked request missing tenant_id');
        return reply.status(400).send({ error: 'Missing x-tenant-id header or auth context' });
    }
};
