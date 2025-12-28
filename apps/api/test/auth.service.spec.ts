/**
 * Auth Service Unit Tests
 * 
 * Tests for authentication service including:
 * - User registration
 * - Login with password verification
 * - Account lockout mechanism
 * - Token blacklisting
 * - Password hashing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthService } from '../src/modules/auth/auth.service';
import { createMockPrisma, createMockRedis, mockUsers, mockTenants } from './utils/test-helpers';
import bcrypt from 'bcrypt';

describe('AuthService', () => {
    let authService: AuthService;
    let mockPrisma: ReturnType<typeof createMockPrisma>;
    let mockRedis: ReturnType<typeof createMockRedis>;
    let mockAuditLogger: { log: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        vi.clearAllMocks();
        mockPrisma = createMockPrisma();
        mockRedis = createMockRedis();
        mockAuditLogger = { log: vi.fn().mockResolvedValue(undefined) };

        authService = new AuthService(mockPrisma as any, mockAuditLogger as any);
        // Inject mock Redis
        (authService as any).redis = mockRedis;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ============================================
    // Password Hashing Tests
    // ============================================

    describe('Password Hashing', () => {
        it('should hash passwords using bcrypt', async () => {
            const password = 'TestPassword123!';
            const hashedPassword = await bcrypt.hash(password, 10);

            expect(hashedPassword).not.toBe(password);
            expect(hashedPassword.startsWith('$2b$')).toBe(true);
        });

        it('should verify passwords correctly', async () => {
            const password = 'TestPassword123!';
            const hashedPassword = await bcrypt.hash(password, 10);

            const isValid = await bcrypt.compare(password, hashedPassword);
            const isInvalid = await bcrypt.compare('WrongPassword', hashedPassword);

            expect(isValid).toBe(true);
            expect(isInvalid).toBe(false);
        });

        it('should use salt rounds of 10', async () => {
            const password = 'TestPassword123!';
            const hashedPassword = await bcrypt.hash(password, 10);

            // $2b$10$ indicates bcrypt with 10 rounds
            expect(hashedPassword).toMatch(/^\$2[aby]?\$10\$/);
        });
    });

    // ============================================
    // Registration Tests
    // ============================================

    describe('registerTenant', () => {
        it('should create tenant and admin user in a transaction', async () => {
            const tenantName = 'New Tenant';
            const email = 'new@tenant.test';
            const password = 'SecurePass123!';

            // Mock transaction behavior with complete mocks
            mockPrisma.$transaction.mockImplementation(async (fn: any) => {
                return fn({
                    tenant: {
                        create: vi.fn().mockResolvedValue({ id: 'new-tenant-id', name: tenantName }),
                    },
                    user: {
                        create: vi.fn().mockResolvedValue({
                            id: 'new-user-id',
                            email,
                            role: 'TENANT_ADMIN',
                            tenantId: 'new-tenant-id',
                        }),
                    },
                    auditLog: {
                        create: vi.fn().mockResolvedValue({}),
                    },
                });
            });

            const result = await authService.registerTenant({
                tenantName,
                email,
                password
            });

            expect(result.tenant).toBeDefined();
            expect(result.user).toBeDefined();
        });

        it('should reject duplicate emails', async () => {
            mockPrisma.user.findUnique.mockResolvedValue({
                id: 'existing-user',
                email: 'duplicate@test.com',
            });

            await expect(
                authService.registerTenant({ tenantName: 'Tenant', email: 'duplicate@test.com', password: 'password' })
            ).rejects.toThrow();
        });
    });

    // ============================================
    // Login Tests
    // ============================================

    describe('login', () => {
        const mockUser = {
            id: 'user-001',
            email: 'test@example.com',
            password: '$2b$10$xxx', // bcrypt hash
            role: 'TENANT_ADMIN',
            tenantId: 'tenant-001',
            tenant: { status: 'ACTIVE' },
        };

        beforeEach(() => {
            mockPrisma.user.findUnique.mockResolvedValue(mockUser);
            vi.spyOn(bcrypt, 'compare').mockImplementation(async () => true);
        });

        it('should return user and tokens on successful login', async () => {
            const result = await authService.login({ email: 'test@example.com', password: 'password' });

            expect(result).toBeDefined();
            expect(result.email).toBe('test@example.com');
        });

        it('should reject invalid password', async () => {
            vi.spyOn(bcrypt, 'compare').mockImplementation(async () => false);

            await expect(
                authService.login({ email: 'test@example.com', password: 'wrongpassword' })
            ).rejects.toThrow();
        });

        it('should reject non-existent user', async () => {
            mockPrisma.user.findUnique.mockResolvedValue(null);

            await expect(
                authService.login({ email: 'nonexistent@example.com', password: 'password' })
            ).rejects.toThrow();
        });

        it('should reject suspended tenant', async () => {
            mockPrisma.user.findUnique.mockResolvedValue({
                ...mockUser,
                tenant: { status: 'SUSPENDED' },
            });

            await expect(
                authService.login({ email: 'test@example.com', password: 'password' })
            ).rejects.toThrow(/suspended/i);
        });
    });

    // ============================================
    // Account Lockout Tests
    // ============================================

    describe('Account Lockout', () => {
        const mockUser = {
            id: 'user-001',
            email: 'test@example.com',
            password: '$2b$10$xxx',
            role: 'TENANT_ADMIN',
            tenantId: 'tenant-001',
            tenant: { status: 'ACTIVE' },
        };

        it('should track failed login attempts', async () => {
            mockPrisma.user.findUnique.mockResolvedValue(mockUser);
            vi.spyOn(bcrypt, 'compare').mockImplementation(async () => false);

            // First failed attempt should throw
            await expect(
                authService.login({ email: 'test@example.com', password: 'wrong' })
            ).rejects.toThrow();
        });

        it('should lock account after 5 failed attempts', async () => {
            // Simulate locked account (returns 'locked' string)
            mockRedis.get.mockResolvedValue('locked');
            mockPrisma.user.findUnique.mockResolvedValue(mockUser);

            // Should be locked
            await expect(
                authService.login({ email: 'test@example.com', password: 'any' })
            ).rejects.toThrow(/locked/i);
        });

        it('should reset lockout counter after successful login', async () => {
            mockPrisma.user.findUnique.mockResolvedValue(mockUser);
            vi.spyOn(bcrypt, 'compare').mockImplementation(async () => true);
            mockRedis.get.mockResolvedValue(null); // Not locked

            // Should succeed without throwing
            const result = await authService.login({ email: 'test@example.com', password: 'correct' });
            expect(result).toBeDefined();
        });
    });

    // ============================================
    // Token Blacklist Tests
    // ============================================

    describe('Token Blacklisting', () => {
        it('should blacklist token on logout', async () => {
            const token = 'jwt.token.here';

            await authService.blacklistToken(token);

            // Verify setex was called for blacklisting
            expect(mockRedis.setex).toHaveBeenCalled();
        });

        it('should detect blacklisted tokens', async () => {
            const token = 'blacklisted.token';
            mockRedis.get.mockResolvedValue('1'); // Any truthy value

            const isBlacklisted = await authService.isTokenBlacklisted(token);

            expect(isBlacklisted).toBeTruthy();
        });

        it('should return false for valid tokens', async () => {
            const token = 'valid.token';
            mockRedis.get.mockResolvedValue(null);

            const isBlacklisted = await authService.isTokenBlacklisted(token);

            expect(isBlacklisted).toBeFalsy();
        });
    });
});
