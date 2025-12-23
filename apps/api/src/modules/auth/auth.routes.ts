import { FastifyInstance } from 'fastify';
import { AuthService } from './auth.service';
import { PrismaClient } from '@b2automate/database';
import { AuditLogger } from '../../services/audit-logger';
import z from 'zod';

const prisma = new PrismaClient();
const auditLogger = new AuditLogger(prisma);
const authService = new AuthService(prisma, auditLogger);

export async function authRoutes(app: FastifyInstance) {

    app.post('/register', {
        schema: {
            body: z.object({
                email: z.string().email(),
                password: z.string().min(8),
                tenantName: z.string().min(2)
            })
        }
    }, async (req, reply) => {
        const { email, password, tenantName } = req.body as any;
        try {
            const result = await authService.registerTenant({ email, password, tenantName });
            return reply.code(201).send(result);
        } catch (err) {
            req.log.error(err);
            return reply.code(400).send({ error: 'Registration failed' });
        }
    });

    app.post('/login', {
        schema: {
            body: z.object({
                email: z.string().email(),
                password: z.string()
            })
        }
    }, async (req, reply) => {
        const { email, password } = req.body as any;
        try {
            const user = await authService.login({ email, password });
            const token = app.jwt.sign(user);

            // Audit Log Login Success
            await auditLogger.log({
                tenantId: user.tenantId,
                actorUserId: user.id,
                eventType: 'LOGIN_SUCCESS',
                ipAddress: req.ip
            });

            return { token };
        } catch (err) {
            // Audit Log Login Failure (if we could identify tenant)
            return reply.code(401).send({ error: 'Invalid credentials' });
        }
    });
}
