/**
 * Test Utilities and Mocks
 * 
 * Provides reusable test helpers for B2Automate API tests.
 */

import { vi } from 'vitest';

// ============================================
// Mock User Data
// ============================================

export const mockUsers = {
    superAdmin: {
        id: 'user-super-admin-001',
        email: 'admin@b2automate.test',
        role: 'SUPER_ADMIN' as const,
        tenantId: 'tenant-001',
    },
    tenantAdmin: {
        id: 'user-tenant-admin-001',
        email: 'tenant@b2automate.test',
        role: 'TENANT_ADMIN' as const,
        tenantId: 'tenant-001',
    },
    staff: {
        id: 'user-staff-001',
        email: 'staff@b2automate.test',
        role: 'STAFF' as const,
        tenantId: 'tenant-001',
    },
    otherTenantAdmin: {
        id: 'user-tenant-admin-002',
        email: 'other@b2automate.test',
        role: 'TENANT_ADMIN' as const,
        tenantId: 'tenant-002',  // Different tenant for isolation tests
    },
};

// ============================================
// Mock Tenant Data
// ============================================

export const mockTenants = {
    primary: {
        id: 'tenant-001',
        name: 'Test Tenant',
        status: 'ACTIVE' as const,
        aiPlan: 'PAID_BASIC' as const,
        aiTier: 'LOW' as const,
        aiDailyLimit: 500,
        aiMonthlyLimit: 10000,
        aiDailyUsage: 0,
        aiMonthlyUsage: 0,
        isAiEnabled: true,
        isWhatsappEnabled: true,
    },
    secondary: {
        id: 'tenant-002',
        name: 'Other Tenant',
        status: 'ACTIVE' as const,
        aiPlan: 'FREE' as const,
        aiTier: 'FREE' as const,
    },
};

// ============================================
// Mock Service Data
// ============================================

export const mockServices = {
    basic: {
        id: 'service-001',
        tenantId: 'tenant-001',
        name: 'Test Service',
        description: 'A test service',
        price: 99.99,
        isActive: true,
    },
    premium: {
        id: 'service-002',
        tenantId: 'tenant-001',
        name: 'Premium Service',
        description: 'A premium test service',
        price: 199.99,
        isActive: true,
    },
    inactive: {
        id: 'service-003',
        tenantId: 'tenant-001',
        name: 'Inactive Service',
        description: 'An inactive service',
        price: 49.99,
        isActive: false,
    },
};

// ============================================
// Mock Order Data
// ============================================

export const mockOrders = {
    draft: {
        id: 'order-001',
        tenantId: 'tenant-001',
        customerJid: '1234567890@s.whatsapp.net',
        status: 'DRAFT' as const,
        totalAmount: 99.99,
    },
    pendingApproval: {
        id: 'order-002',
        tenantId: 'tenant-001',
        customerJid: '1234567890@s.whatsapp.net',
        status: 'PENDING_APPROVAL' as const,
        totalAmount: 199.99,
    },
    approved: {
        id: 'order-003',
        tenantId: 'tenant-001',
        customerJid: '1234567890@s.whatsapp.net',
        status: 'APPROVED' as const,
        totalAmount: 149.99,
        approvedBy: 'user-tenant-admin-001',
    },
};

// ============================================
// Mock Prisma Client
// ============================================

export function createMockPrisma() {
    return {
        $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
        $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
            return fn(createMockPrisma());
        }),
        tenant: {
            findUnique: vi.fn(),
            findFirst: vi.fn(),
            findMany: vi.fn().mockResolvedValue([]),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            count: vi.fn().mockResolvedValue(0),
        },
        user: {
            findUnique: vi.fn(),
            findFirst: vi.fn(),
            findMany: vi.fn().mockResolvedValue([]),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            count: vi.fn().mockResolvedValue(0),
        },
        service: {
            findUnique: vi.fn(),
            findFirst: vi.fn(),
            findMany: vi.fn().mockResolvedValue([]),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            count: vi.fn().mockResolvedValue(0),
        },
        order: {
            findUnique: vi.fn(),
            findFirst: vi.fn(),
            findMany: vi.fn().mockResolvedValue([]),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            count: vi.fn().mockResolvedValue(0),
        },
        orderItem: {
            create: vi.fn(),
            createMany: vi.fn(),
            deleteMany: vi.fn(),
        },
        auditLog: {
            create: vi.fn(),
            findMany: vi.fn().mockResolvedValue([]),
        },
        subscription: {
            findFirst: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
        systemSettings: {
            findUnique: vi.fn(),
            findFirst: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
        growthSettings: {
            findFirst: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
    };
}

// ============================================
// Mock Redis Client
// ============================================

export function createMockRedis() {
    const storage = new Map<string, string>();

    return {
        get: vi.fn().mockImplementation(async (key: string) => storage.get(key) || null),
        set: vi.fn().mockImplementation(async (key: string, value: string) => {
            storage.set(key, value);
            return 'OK';
        }),
        setex: vi.fn().mockImplementation(async (key: string, _ttl: number, value: string) => {
            storage.set(key, value);
            return 'OK';
        }),
        del: vi.fn().mockImplementation(async (key: string) => {
            storage.delete(key);
            return 1;
        }),
        incr: vi.fn().mockImplementation(async (key: string) => {
            const current = parseInt(storage.get(key) || '0', 10);
            storage.set(key, String(current + 1));
            return current + 1;
        }),
        expire: vi.fn().mockResolvedValue(1),
        quit: vi.fn().mockResolvedValue('OK'),
    };
}

// ============================================
// Test Helpers
// ============================================

/**
 * Create a mock JWT token payload
 */
export function createMockJwtPayload(user: typeof mockUsers.superAdmin) {
    return {
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 900, // 15 min
    };
}

/**
 * Generate a fake UUID
 */
export function generateMockId(prefix = 'mock'): string {
    return `${prefix}-${Math.random().toString(36).substring(2, 10)}`;
}

/**
 * Wait for a specified time (useful for async tests)
 */
export function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a mock Fastify request object
 */
export function createMockRequest(options: {
    user?: typeof mockUsers.superAdmin;
    tenantId?: string;
    body?: unknown;
    params?: Record<string, string>;
    query?: Record<string, string>;
}) {
    return {
        user: options.user,
        tenantId: options.tenantId || options.user?.tenantId,
        body: options.body || {},
        params: options.params || {},
        query: options.query || {},
        headers: {},
        ip: '127.0.0.1',
        log: {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
        },
        jwtVerify: vi.fn().mockResolvedValue(options.user ? createMockJwtPayload(options.user) : null),
    };
}

/**
 * Create a mock Fastify reply object
 */
export function createMockReply() {
    const reply = {
        code: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis(),
        status: vi.fn().mockReturnThis(),
        header: vi.fn().mockReturnThis(),
    };
    return reply;
}
