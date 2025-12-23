export interface TenantContext {
    tenantId: string;
    userId?: string;
    role?: string;
}

export enum UserRole {
    SUPER_ADMIN = 'SUPER_ADMIN',
    TENANT_ADMIN = 'TENANT_ADMIN',
    STAFF = 'STAFF'
}

export enum TenantStatus {
    ACTIVE = 'ACTIVE',
    SUSPENDED = 'SUSPENDED',
    ARCHIVED = 'ARCHIVED'
}

export * from './queues';
