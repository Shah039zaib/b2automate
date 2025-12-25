/**
 * Message Templates Routes
 * 
 * PHASE 6B: CRUD for reusable message templates with variable support.
 * 
 * ACCESS CONTROL:
 * - TENANT_ADMIN: Full CRUD
 * - STAFF: Read only
 * 
 * NOTE: Run `npx prisma migrate dev` after schema changes
 */

import { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma';
import { requireTenantId } from '../../middleware/tenant-context';
import { requireTenantAdmin } from '../../middleware/rbac';
import { AuditLogger } from '../../services/audit-logger';
import z from 'zod';

const auditLogger = new AuditLogger(prisma);

// Cast for models added in Phase 6B (safe after migration)
const db = prisma as any;

// Regex to extract {{variable}} placeholders
const VARIABLE_REGEX = /\{\{(\w+)\}\}/g;

/**
 * Extract variable names from template content
 */
function extractVariables(content: string): string[] {
    const matches = content.matchAll(VARIABLE_REGEX);
    const variables = new Set<string>();
    for (const match of matches) {
        variables.add(match[1]);
    }
    return Array.from(variables);
}

/**
 * Render template with provided variables
 */
export function renderTemplate(content: string, variables: Record<string, string>): string {
    return content.replace(VARIABLE_REGEX, (match, varName) => {
        return variables[varName] ?? match; // Keep placeholder if variable not provided
    });
}

export async function templateRoutes(app: FastifyInstance) {
    // All routes require authentication and tenant context
    app.addHook('preHandler', app.authenticate);
    app.addHook('preHandler', requireTenantId);

    // ============================================
    // CREATE Template (Admin only)
    // ============================================

    /**
     * POST /templates
     * Create a new message template
     */
    app.post('/', {
        preHandler: [requireTenantAdmin],
        schema: {
            body: z.object({
                name: z.string().min(1).max(100),
                content: z.string().min(1).max(4096)
            })
        }
    }, async (req, reply) => {
        const tenantId = req.tenantId!;
        const userId = (req.user as any).id;
        const { name, content } = req.body as any;

        // Check for duplicate name
        const existing = await db.messageTemplate.findFirst({
            where: { tenantId, name }
        });
        if (existing) {
            return reply.code(400).send({ error: 'Template with this name already exists' });
        }

        // Extract variables from content
        const variables = extractVariables(content);

        const template = await db.messageTemplate.create({
            data: {
                tenantId,
                name,
                content,
                variables,
                createdBy: userId
            }
        });

        await auditLogger.log({
            tenantId,
            actorUserId: userId,
            eventType: 'TEMPLATE_CREATED',
            metadata: { id: template.id, name, variableCount: variables.length },
            ipAddress: req.ip
        });

        return reply.code(201).send(template);
    });

    // ============================================
    // LIST Templates
    // ============================================

    /**
     * GET /templates
     * List all templates for tenant
     */
    app.get('/', async (req, reply) => {
        const tenantId = req.tenantId!;

        const templates = await db.messageTemplate.findMany({
            where: { tenantId },
            orderBy: { name: 'asc' },
            select: {
                id: true,
                name: true,
                content: true,
                variables: true,
                createdAt: true,
                updatedAt: true
            }
        });

        return { templates };
    });

    // ============================================
    // GET Single Template
    // ============================================

    app.get('/:id', {
        schema: {
            params: z.object({ id: z.string().uuid() })
        }
    }, async (req, reply) => {
        const tenantId = req.tenantId!;
        const { id } = req.params as { id: string };

        const template = await db.messageTemplate.findFirst({
            where: { id, tenantId }
        });

        if (!template) {
            return reply.code(404).send({ error: 'Template not found' });
        }

        return template;
    });

    // ============================================
    // UPDATE Template (Admin only)
    // ============================================

    /**
     * PATCH /templates/:id
     * Update template content or name
     */
    app.patch('/:id', {
        preHandler: [requireTenantAdmin],
        schema: {
            params: z.object({ id: z.string().uuid() }),
            body: z.object({
                name: z.string().min(1).max(100).optional(),
                content: z.string().min(1).max(4096).optional()
            })
        }
    }, async (req, reply) => {
        const tenantId = req.tenantId!;
        const userId = (req.user as any).id;
        const { id } = req.params as { id: string };
        const { name, content } = req.body as any;

        const existing = await db.messageTemplate.findFirst({
            where: { id, tenantId }
        });

        if (!existing) {
            return reply.code(404).send({ error: 'Template not found' });
        }

        // If name changed, check for duplicate
        if (name && name !== existing.name) {
            const duplicate = await db.messageTemplate.findFirst({
                where: { tenantId, name, id: { not: id } }
            });
            if (duplicate) {
                return reply.code(400).send({ error: 'Template with this name already exists' });
            }
        }

        // Re-extract variables if content changed
        const updates: any = {};
        if (name) updates.name = name;
        if (content) {
            updates.content = content;
            updates.variables = extractVariables(content);
        }

        const template = await db.messageTemplate.update({
            where: { id },
            data: updates
        });

        await auditLogger.log({
            tenantId,
            actorUserId: userId,
            eventType: 'TEMPLATE_UPDATED',
            metadata: { id, updates: Object.keys(updates) },
            ipAddress: req.ip
        });

        return template;
    });

    // ============================================
    // DELETE Template (Admin only)
    // ============================================

    /**
     * DELETE /templates/:id
     * Delete a template (soft or hard)
     */
    app.delete('/:id', {
        preHandler: [requireTenantAdmin],
        schema: {
            params: z.object({ id: z.string().uuid() })
        }
    }, async (req, reply) => {
        const tenantId = req.tenantId!;
        const userId = (req.user as any).id;
        const { id } = req.params as { id: string };

        const existing = await db.messageTemplate.findFirst({
            where: { id, tenantId }
        });

        if (!existing) {
            return reply.code(404).send({ error: 'Template not found' });
        }

        // Check if template is used by pending scheduled messages
        const inUse = await db.scheduledMessage.count({
            where: { templateId: id, status: 'PENDING' }
        });

        if (inUse > 0) {
            return reply.code(400).send({
                error: `Cannot delete: template is used by ${inUse} pending scheduled message(s)`
            });
        }

        await db.messageTemplate.delete({ where: { id } });

        await auditLogger.log({
            tenantId,
            actorUserId: userId,
            eventType: 'TEMPLATE_DELETED',
            metadata: { id, name: existing.name },
            ipAddress: req.ip
        });

        return { success: true };
    });

    // ============================================
    // PREVIEW Template (with variables)
    // ============================================

    /**
     * POST /templates/:id/preview
     * Render template with provided variables
     */
    app.post('/:id/preview', {
        schema: {
            params: z.object({ id: z.string().uuid() }),
            body: z.object({
                variables: z.record(z.string())
            })
        }
    }, async (req, reply) => {
        const tenantId = req.tenantId!;
        const { id } = req.params as { id: string };
        const { variables } = req.body as { variables: Record<string, string> };

        const template = await db.messageTemplate.findFirst({
            where: { id, tenantId }
        });

        if (!template) {
            return reply.code(404).send({ error: 'Template not found' });
        }

        const rendered = renderTemplate(template.content, variables);

        return {
            original: template.content,
            rendered,
            requiredVariables: template.variables,
            providedVariables: Object.keys(variables)
        };
    });
}
