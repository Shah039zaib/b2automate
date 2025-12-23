import { describe, it, expect, vi } from 'vitest';
import { tenantContextMiddleware } from '../src/middleware/tenant-context';

// Mock FastRequest/Reply
const mockRequest = (headers: any = {}, user: any = null) => ({
    headers,
    user,
    tenantId: undefined,
    log: {
        debug: vi.fn(),
        warn: vi.fn()
    }
} as any);

const mockReply = () => ({
    status: vi.fn().mockReturnThis(),
    send: vi.fn()
} as any);

describe('Tenant Isolation Middleware', () => {
    it('should extract tenantId from JWT user', async () => {
        const req = mockRequest({}, { tenantId: 'tenant-123' });
        await tenantContextMiddleware(req, mockReply());
        expect(req.tenantId).toBe('tenant-123');
    });

    it('should extract tenantId from headers if no JWT (public route context)', async () => {
        const req = mockRequest({ 'x-tenant-id': 'tenant-header' });
        await tenantContextMiddleware(req, mockReply());
        expect(req.tenantId).toBe('tenant-header');
    });

    it('should prefer JWT tenantId over header (Impersonation prevention)', async () => {
        // If I have a valid token for Tenant A, but send header for Tenant B, I MUST stay as Tenant A
        const req = mockRequest({ 'x-tenant-id': 'tenant-B' }, { tenantId: 'tenant-A' });
        await tenantContextMiddleware(req, mockReply());
        expect(req.tenantId).toBe('tenant-A');
    });
});
