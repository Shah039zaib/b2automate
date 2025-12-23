import { PrismaClient, UserRole, TenantStatus } from '@b2automate/database';
import { AuditLogger } from '../../services/audit-logger';
import { logger } from '@b2automate/logger';

// Mocking password hashing for Phase 1 skeleton (would use bcrypt/argon2)
const hashPassword = (p: string) => `hashed_${p}`;
const verifyPassword = (p: string, h: string) => h === `hashed_${p}`;

export class AuthService {
    constructor(
        private prisma: PrismaClient,
        private auditLogger: AuditLogger
    ) { }

    async registerTenant(params: { email: string; password: string; tenantName: string }) {
        // Transactional consistency: Create Tenant + Admin User
        return this.prisma.$transaction(async (tx) => {
            // 1. Create Tenant
            const tenant = await tx.tenant.create({
                data: {
                    name: params.tenantName,
                    status: TenantStatus.ACTIVE
                }
            });

            // 2. Create Admin User
            const user = await tx.user.create({
                data: {
                    email: params.email,
                    passwordHash: hashPassword(params.password),
                    role: UserRole.TENANT_ADMIN,
                    tenantId: tenant.id
                }
            });

            // 3. Audit Log (This is the FIRST action, so we use the new tenantId)
            // Note: We can't use 'this.auditLogger' directly inside simple transaction if it depends on outside context, 
            // but here we just need to write to the DB.
            // For simplicity in Phase 1, we write directly or assume auditLogger uses the same client/tx.
            // Ideally audit logs are separate to avoid rollback on failure, BUT valid business require successful creation.

            await tx.auditLog.create({
                data: {
                    tenantId: tenant.id,
                    actorUserId: user.id,
                    eventType: 'TENANT_CREATED',
                    metadata: { name: params.tenantName },
                    ipAddress: 'system' // Should pass from controller
                }
            });

            logger.info({ tenantId: tenant.id, userId: user.id }, 'Tenant created successfully');
            return { tenant, user };
        });
    }

    async login(params: { email: string; password: string }) {
        const user = await this.prisma.user.findUnique({
            where: { email: params.email },
            include: { tenant: true }
        });

        if (!user || !verifyPassword(params.password, user.passwordHash)) {
            // TODO: Audit failed login (needs tenant context if known, or system level)
            throw new Error('Invalid credentials');
        }

        if (user.tenant.status !== TenantStatus.ACTIVE) {
            throw new Error('Tenant is suspended');
        }

        // Return payload for JWT
        return {
            id: user.id,
            email: user.email,
            role: user.role,
            tenantId: user.tenantId
        };
    }
}
