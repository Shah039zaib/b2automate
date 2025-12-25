import { PrismaClient, UserRole, TenantStatus } from '@b2automate/database';
import { AuditLogger } from '../../services/audit-logger';
import { logger } from '@b2automate/logger';
import bcrypt from 'bcrypt';
import Redis from 'ioredis';

// Password hashing with bcrypt (10 salt rounds for security)
const SALT_ROUNDS = 10;

// Account Lockout Configuration
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_SECONDS = 900; // 15 minutes

const hashPassword = async (password: string): Promise<string> => {
    return bcrypt.hash(password, SALT_ROUNDS);
};

const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
    return bcrypt.compare(password, hash);
};

export class AuthService {
    private redis: Redis | null = null;

    constructor(
        private prisma: PrismaClient,
        private auditLogger: AuditLogger
    ) {
        // Initialize Redis for lockout tracking
        try {
            this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
        } catch (err) {
            logger.warn('Redis not available for account lockout - feature disabled');
        }
    }

    /**
     * Check if account is locked
     */
    private async isAccountLocked(email: string): Promise<boolean> {
        if (!this.redis) return false;
        const lockKey = `auth:lockout:${email}`;
        const locked = await this.redis.get(lockKey);
        return locked === 'locked';
    }

    /**
     * Get failed login attempts count
     */
    private async getFailedAttempts(email: string): Promise<number> {
        if (!this.redis) return 0;
        const key = `auth:failed:${email}`;
        const count = await this.redis.get(key);
        return count ? parseInt(count, 10) : 0;
    }

    /**
     * Increment failed login attempts
     */
    private async incrementFailedAttempts(email: string): Promise<number> {
        if (!this.redis) return 0;
        const key = `auth:failed:${email}`;
        const count = await this.redis.incr(key);
        await this.redis.expire(key, LOCKOUT_DURATION_SECONDS);

        // Lock account if threshold exceeded
        if (count >= MAX_FAILED_ATTEMPTS) {
            const lockKey = `auth:lockout:${email}`;
            await this.redis.setex(lockKey, LOCKOUT_DURATION_SECONDS, 'locked');
            logger.warn({ email }, `Account locked after ${count} failed attempts`);
        }

        return count;
    }

    /**
     * Reset failed login attempts on successful login
     */
    private async resetFailedAttempts(email: string): Promise<void> {
        if (!this.redis) return;
        const key = `auth:failed:${email}`;
        const lockKey = `auth:lockout:${email}`;
        await this.redis.del(key, lockKey);
    }

    // ============================================
    // TOKEN BLACKLIST (Logout Revocation)
    // ============================================

    /**
     * Add token to blacklist (called on logout)
     * TTL matches remaining token validity (max 15 minutes for access tokens)
     */
    async blacklistToken(token: string, ttlSeconds: number = 900): Promise<void> {
        if (!this.redis) {
            logger.warn('Redis unavailable - token blacklist disabled');
            return;
        }
        try {
            // Use hash of token as key to avoid storing raw token
            const crypto = await import('crypto');
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            const key = `auth:blacklist:${tokenHash}`;
            await this.redis.setex(key, ttlSeconds, '1');
            logger.debug({ tokenHash: tokenHash.slice(0, 8) }, 'Token blacklisted');
        } catch (err) {
            logger.error({ err }, 'Failed to blacklist token');
        }
    }

    /**
     * Check if token is blacklisted (called on every authenticated request)
     * Fail-safe: returns false if Redis unavailable (allows request but logs warning)
     */
    async isTokenBlacklisted(token: string): Promise<boolean> {
        if (!this.redis) {
            return false; // Fail-safe: allow if Redis unavailable
        }
        try {
            const crypto = await import('crypto');
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            const key = `auth:blacklist:${tokenHash}`;
            const result = await this.redis.get(key);
            return result === '1';
        } catch (err) {
            logger.warn({ err }, 'Redis error checking blacklist - allowing request');
            return false; // Fail-safe
        }
    }

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
                    passwordHash: await hashPassword(params.password),
                    role: UserRole.TENANT_ADMIN,
                    tenantId: tenant.id
                }
            });

            // 3. Audit Log
            await tx.auditLog.create({
                data: {
                    tenantId: tenant.id,
                    actorUserId: user.id,
                    eventType: 'TENANT_CREATED',
                    metadata: { name: params.tenantName },
                    ipAddress: 'system'
                }
            });

            logger.info({ tenantId: tenant.id, userId: user.id }, 'Tenant created successfully');
            return { tenant, user };
        });
    }

    async login(params: { email: string; password: string }) {
        // Check if account is locked
        if (await this.isAccountLocked(params.email)) {
            logger.warn({ email: params.email }, 'Login attempt on locked account');
            throw new Error('Account is locked. Please try again later.');
        }

        const user = await this.prisma.user.findUnique({
            where: { email: params.email },
            include: { tenant: true }
        });

        if (!user || !(await verifyPassword(params.password, user.passwordHash))) {
            // Increment failed attempts
            const attempts = await this.incrementFailedAttempts(params.email);
            const remaining = MAX_FAILED_ATTEMPTS - attempts;

            if (remaining > 0) {
                logger.info({ email: params.email, attempts, remaining }, 'Failed login attempt');
            }

            throw new Error('Invalid credentials');
        }

        // Reset failed attempts on successful login
        await this.resetFailedAttempts(params.email);

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
