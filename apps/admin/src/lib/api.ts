import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const TOKEN_KEY = 'b2_admin_token';

export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string): void => localStorage.setItem(TOKEN_KEY, token);
export const removeToken = (): void => localStorage.removeItem(TOKEN_KEY);

const api: AxiosInstance = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

api.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
        const token = getToken();
        if (token && config.headers) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            removeToken();
            if (window.location.pathname !== '/login') {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

// ============================================
// Auth API
// ============================================

export interface LoginRequest {
    email: string;
    password: string;
}

export interface LoginResponse {
    accessToken: string;
    refreshToken: string;
}

export const authApi = {
    login: (data: LoginRequest) =>
        api.post<LoginResponse>('/auth/login', data),
};

// ============================================
// Admin API
// ============================================

export interface Tenant {
    id: string;
    name: string;
    status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
    isAiEnabled: boolean;
    isWhatsappEnabled: boolean;
    businessPhone?: string;
    businessAddress?: string;
    businessDescription?: string;
    createdAt: string;
    updatedAt: string;
    _count?: {
        users: number;
        services: number;
        orders: number;
    };
    users?: Array<{ id: string; email: string; role: string; createdAt: string }>;
}

export interface TenantListResponse {
    tenants: Tenant[];
    total: number;
    limit: number;
    offset: number;
}

export interface GlobalStats {
    tenants: { total: number; active: number; suspended: number };
    users: number;
    orders: { total: number; byStatus: Record<string, number> };
    services: number;
}

export interface AuditLog {
    id: string;
    tenantId: string;
    actorUserId: string | null;
    eventType: string;
    metadata: Record<string, unknown> | null;
    ipAddress: string | null;
    timestamp: string;
    tenant?: { name: string };
    actor?: { email: string };
}

export interface AuditLogResponse {
    logs: AuditLog[];
    total: number;
    limit: number;
    offset: number;
}

export const adminApi = {
    // Tenants
    listTenants: (params?: { status?: string; search?: string; limit?: number; offset?: number }) =>
        api.get<TenantListResponse>('/admin/tenants', { params }),

    getTenant: (id: string) =>
        api.get<Tenant>(`/admin/tenants/${id}`),

    createTenant: (data: { name: string; status?: string }) =>
        api.post<Tenant>('/admin/tenants', data),

    updateTenant: (id: string, data: Partial<Tenant>) =>
        api.patch<Tenant>(`/admin/tenants/${id}`, data),

    activateTenant: (id: string) =>
        api.post<Tenant>(`/admin/tenants/${id}/activate`),

    suspendTenant: (id: string) =>
        api.post<Tenant>(`/admin/tenants/${id}/suspend`),

    archiveTenant: (id: string) =>
        api.post<{ message: string; tenant: Tenant }>(`/admin/tenants/${id}/archive`),

    deleteTenant: (id: string) =>
        api.delete(`/admin/tenants/${id}?confirm=DELETE_PERMANENTLY`),

    // Stats
    getStats: () =>
        api.get<GlobalStats>('/admin/stats'),

    // Audit logs
    getAuditLogs: (params?: { tenantId?: string; eventType?: string; limit?: number; offset?: number }) =>
        api.get<AuditLogResponse>('/admin/audit-logs', { params }),
};

// ============================================
// Subscription Plan API (Super Admin)
// ============================================

export interface SubscriptionPlan {
    id: string;
    name: string;
    description: string | null;
    stripeProductId: string;
    stripePriceId: string;
    aiPlan: 'FREE' | 'PAID_BASIC' | 'PAID_PRO' | 'ENTERPRISE';
    aiTier: 'FREE' | 'LOW' | 'MEDIUM' | 'HIGH';
    aiDailyLimit: number;
    aiMonthlyLimit: number;
    priceAmount: number;
    priceCurrency: string;
    priceInterval: string;
    isActive: boolean;
    displayOrder: number;
    createdAt: string;
    updatedAt: string;
}

export interface CreatePlanRequest {
    name: string;
    description?: string;
    stripeProductId: string;
    stripePriceId: string;
    aiPlan: 'FREE' | 'PAID_BASIC' | 'PAID_PRO' | 'ENTERPRISE';
    aiTier: 'FREE' | 'LOW' | 'MEDIUM' | 'HIGH';
    aiDailyLimit: number;
    aiMonthlyLimit: number;
    priceAmount: number;
    priceCurrency?: string;
    priceInterval?: string;
    displayOrder?: number;
}

export interface UpdatePlanRequest {
    name?: string;
    description?: string;
    aiPlan?: 'FREE' | 'PAID_BASIC' | 'PAID_PRO' | 'ENTERPRISE';
    aiTier?: 'FREE' | 'LOW' | 'MEDIUM' | 'HIGH';
    aiDailyLimit?: number;
    aiMonthlyLimit?: number;
    priceAmount?: number;
    priceCurrency?: string;
    priceInterval?: string;
    displayOrder?: number;
    isActive?: boolean;
}

export const planApi = {
    list: () =>
        api.get<{ plans: SubscriptionPlan[] }>('/admin/plans'),

    get: (id: string) =>
        api.get<SubscriptionPlan>(`/admin/plans/${id}`),

    create: (data: CreatePlanRequest) =>
        api.post<SubscriptionPlan>('/admin/plans', data),

    update: (id: string, data: UpdatePlanRequest) =>
        api.patch<SubscriptionPlan>(`/admin/plans/${id}`, data),

    delete: (id: string) =>
        api.delete(`/admin/plans/${id}`),
};

// ============================================
// Growth Settings API (Super Admin)
// ============================================

export interface GrowthSettings {
    // Google Analytics
    gaEnabled: boolean;
    gaMeasurementId: string;

    // Facebook/Meta Pixel
    fbPixelEnabled: boolean;
    fbPixelId: string;

    // Coupon Banner
    couponEnabled: boolean;
    couponCode: string;
    couponDiscountType: 'percentage' | 'fixed';
    couponDiscountValue: number;
    couponMessage: string;
    couponExpiry: string | null;
    couponStripeCouponId: string;

    updatedAt: string;
}

export interface UpdateGrowthSettingsRequest {
    gaEnabled?: boolean;
    gaMeasurementId?: string;
    fbPixelEnabled?: boolean;
    fbPixelId?: string;
    couponEnabled?: boolean;
    couponCode?: string;
    couponDiscountType?: 'percentage' | 'fixed';
    couponDiscountValue?: number;
    couponMessage?: string;
    couponExpiry?: string | null;
    couponStripeCouponId?: string;
}

export const growthApi = {
    getSettings: () =>
        api.get<GrowthSettings>('/admin/growth/settings'),

    updateSettings: (data: UpdateGrowthSettingsRequest) =>
        api.patch<GrowthSettings>('/admin/growth/settings', data),
};

// ============================================
// Manual Payments API (Super Admin)
// ============================================

export interface ManualPayment {
    id: string;
    tenant: { id: string; name: string };
    plan: { id: string; name: string };
    method: 'EASYPAISA' | 'JAZZCASH' | 'BANK_TRANSFER';
    senderName: string;
    senderNumber: string | null;
    reference: string | null;
    screenshotUrl: string;
    originalPrice: number;
    finalPrice: number;
    couponCode: string | null;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    reviewedBy: string | null;
    reviewerNote: string | null;
    reviewedAt: string | null;
    createdAt: string;
}

export interface ManualPaymentsListResponse {
    payments: ManualPayment[];
    total: number;
}

export const manualPaymentsApi = {
    list: (status?: string) =>
        api.get<ManualPaymentsListResponse>('/admin/manual-payments', {
            params: { status }
        }),

    approve: (id: string, note?: string) =>
        api.patch(`/admin/manual-payments/${id}/approve`, { note }),

    reject: (id: string, note?: string) =>
        api.patch(`/admin/manual-payments/${id}/reject`, { note }),

    get: (id: string) =>
        api.get<ManualPayment>(`/admin/manual-payments/${id}`),
};

export default api;



