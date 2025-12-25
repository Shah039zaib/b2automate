import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '@b2automate/logger';

type UserRole = 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'STAFF';

/**
 * RBAC Middleware Factory
 * Creates a preHandler that enforces role-based access control
 * 
 * @param allowedRoles - Array of roles that are permitted to access the route
 * @returns Fastify preHandler hook
 * 
 * @example
 * // Only SUPER_ADMIN can access
 * app.get('/admin/tenants', { preHandler: requireRole(['SUPER_ADMIN']) }, handler);
 * 
 * // TENANT_ADMIN and STAFF can access
 * app.get('/services', { preHandler: requireRole(['TENANT_ADMIN', 'STAFF']) }, handler);
 */
export function requireRole(allowedRoles: UserRole[]) {
    return async (req: FastifyRequest, reply: FastifyReply) => {
        const user = req.user as { id: string; role: UserRole; tenantId: string } | undefined;

        if (!user) {
            logger.warn({ url: req.url, ip: req.ip }, 'RBAC: No user in request');
            return reply.status(401).send({ error: 'Authentication required' });
        }

        if (!allowedRoles.includes(user.role)) {
            logger.warn(
                { url: req.url, userId: user.id, role: user.role, allowedRoles },
                'RBAC: Access denied - insufficient permissions'
            );
            return reply.status(403).send({
                error: 'Access denied',
                message: `This action requires one of these roles: ${allowedRoles.join(', ')}`
            });
        }

        logger.debug({ userId: user.id, role: user.role }, 'RBAC: Access granted');
    };
}

/**
 * Shorthand: Require SUPER_ADMIN role
 */
export const requireSuperAdmin = requireRole(['SUPER_ADMIN']);

/**
 * Shorthand: Require TENANT_ADMIN or higher
 */
export const requireTenantAdmin = requireRole(['SUPER_ADMIN', 'TENANT_ADMIN']);

/**
 * Shorthand: Any authenticated user (all roles)
 */
export const requireAnyRole = requireRole(['SUPER_ADMIN', 'TENANT_ADMIN', 'STAFF']);
