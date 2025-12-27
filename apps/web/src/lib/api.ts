import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosError } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

// Storage keys
const TOKEN_KEY = 'b2_auth_token';
const REFRESH_TOKEN_KEY = 'b2_refresh_token';

// Token management
export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string): void => localStorage.setItem(TOKEN_KEY, token);
export const removeToken = (): void => localStorage.removeItem(TOKEN_KEY);

export const getRefreshToken = (): string | null => localStorage.getItem(REFRESH_TOKEN_KEY);
export const setRefreshToken = (token: string): void => localStorage.setItem(REFRESH_TOKEN_KEY, token);
export const removeRefreshToken = (): void => localStorage.removeItem(REFRESH_TOKEN_KEY);

// Clear all auth tokens
export const clearTokens = (): void => {
    removeToken();
    removeRefreshToken();
};

// ============================================
// Concurrent Tab Logout Sync
// ============================================
// When token is removed in one tab, logout all tabs
if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
        if (e.key === TOKEN_KEY && !e.newValue) {
            // Token was removed in another tab
            window.location.href = '/login';
        }
    });
}

// Create Axios instance
const api: AxiosInstance = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Flag to prevent multiple refresh attempts
let isRefreshing = false;
let failedQueue: Array<{
    resolve: (value?: unknown) => void;
    reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: Error | null, token: string | null = null) => {
    failedQueue.forEach(prom => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token);
        }
    });
    failedQueue = [];
};

// Request interceptor - add JWT token
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

// Response interceptor - handle 401 with refresh token
api.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

        // If 401 and we have a refresh token and haven't tried yet
        if (
            error.response?.status === 401 &&
            !originalRequest._retry &&
            getRefreshToken() &&
            !originalRequest.url?.includes('/auth/refresh') &&
            !originalRequest.url?.includes('/auth/login')
        ) {
            if (isRefreshing) {
                // Queue this request while refresh is in progress
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                }).then(token => {
                    if (originalRequest.headers) {
                        originalRequest.headers.Authorization = `Bearer ${token}`;
                    }
                    return api(originalRequest);
                }).catch(err => {
                    return Promise.reject(err);
                });
            }

            originalRequest._retry = true;
            isRefreshing = true;

            try {
                const refreshToken = getRefreshToken();
                const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
                    refreshToken
                });

                const { token: newToken, refreshToken: newRefreshToken } = response.data;

                setToken(newToken);
                if (newRefreshToken) {
                    setRefreshToken(newRefreshToken);
                }

                processQueue(null, newToken);

                // Retry original request with new token
                if (originalRequest.headers) {
                    originalRequest.headers.Authorization = `Bearer ${newToken}`;
                }
                return api(originalRequest);

            } catch (refreshError) {
                processQueue(refreshError as Error, null);
                // Refresh failed - logout user
                clearTokens();
                if (window.location.pathname !== '/login') {
                    window.location.href = '/login';
                }
                return Promise.reject(refreshError);
            } finally {
                isRefreshing = false;
            }
        }

        // If 401 and no refresh token, or refresh also failed
        if (error.response?.status === 401) {
            clearTokens();
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
    token: string;
    refreshToken?: string;
}

export interface RegisterRequest {
    email: string;
    password: string;
    tenantName: string;
}

export interface RegisterResponse {
    tenant: { id: string; name: string };
    user: { id: string; email: string; role: string; tenantId: string };
}

export const authApi = {
    login: (data: LoginRequest) =>
        api.post<LoginResponse>('/auth/login', data),

    register: (data: RegisterRequest) =>
        api.post<RegisterResponse>('/auth/register', data),

    refresh: (refreshToken: string) =>
        api.post<LoginResponse>('/auth/refresh', { refreshToken }),
};

// ============================================
// Services API
// ============================================

export interface Service {
    id: string;
    name: string;
    description: string;
    price: string; // Decimal comes as string
    currency: string;
    isActive: boolean;
    tenantId: string;
    createdAt: string;
    updatedAt: string;
}

export interface CreateServiceRequest {
    name: string;
    description: string;
    price: number;
    currency?: string;
}

export const servicesApi = {
    list: () =>
        api.get<Service[]>('/services'),

    create: (data: CreateServiceRequest) =>
        api.post<Service>('/services', data),

    update: (id: string, data: Partial<CreateServiceRequest & { isActive: boolean }>) =>
        api.patch<Service>(`/services/${id}`, data),

    delete: (id: string) =>
        api.delete<{ message: string; service?: Service; softDeleted?: boolean }>(`/services/${id}`),
};

// ============================================
// Orders API
// ============================================

export type OrderStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED';

export interface OrderItem {
    id: string;
    serviceId: string;
    quantity: number;
    price: string;
    service: Service;
}

export interface Order {
    id: string;
    tenantId: string;
    customerJid: string;
    status: OrderStatus;
    totalAmount: string;
    currency: string;
    items: OrderItem[];
    createdAt: string;
    updatedAt: string;
}

export const ordersApi = {
    list: (status?: OrderStatus) =>
        api.get<Order[]>('/orders', { params: status ? { status } : {} }),

    approve: (id: string) =>
        api.post<Order>(`/orders/${id}/approve`),

    reject: (id: string) =>
        api.post<Order>(`/orders/${id}/reject`),
};

// ============================================
// WhatsApp API
// ============================================

export interface WhatsAppStatus {
    status: string;
    qr: string | null;
}

export const whatsappApi = {
    getStatus: () =>
        api.get<WhatsAppStatus>('/whatsapp/session/status'),

    startSession: () =>
        api.post<{ status: string }>('/whatsapp/session/start'),

    stopSession: () =>
        api.post<{ status: string }>('/whatsapp/session/stop'),
};

// ============================================
// Billing API
// ============================================

export interface SubscriptionPlan {
    id: string;
    name: string;
    description: string | null;
    priceAmount: number;
    priceCurrency: string;
    priceInterval: string;
    aiPlan: 'FREE' | 'PAID_BASIC' | 'PAID_PRO' | 'ENTERPRISE';
    aiTier: 'FREE' | 'LOW' | 'MEDIUM' | 'HIGH';
    aiDailyLimit: number;
    aiMonthlyLimit: number;
}

export interface Subscription {
    id: string;
    planId: string;
    status: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
    plan: SubscriptionPlan;
}

export interface TenantBillingInfo {
    subscription: Subscription | null;
    aiPlan: string;
    aiTier: string;
    aiDailyLimit: number;
    aiMonthlyLimit: number;
    aiDailyUsage: number;
    aiMonthlyUsage: number;
}

export const billingApi = {
    // Get active plans (public)
    getPlans: () =>
        api.get<SubscriptionPlan[]>('/checkout/plans'),

    // Create checkout session
    createCheckoutSession: (planId: string, tenantId: string, email: string, couponId?: string) =>
        api.post<{ url: string }>('/checkout/session', { planId, tenantId, email, couponId }),

    // Create customer portal session (authenticated)
    createPortalSession: () =>
        api.post<{ url: string }>('/checkout/portal'),

    // Get tenant billing info
    getTenantBilling: () =>
        api.get<TenantBillingInfo>('/tenant/billing'),
};

// ============================================
// Growth Settings API (Public)
// ============================================

export interface PublicGrowthSettings {
    gaEnabled: boolean;
    gaMeasurementId: string;
    fbPixelEnabled: boolean;
    fbPixelId: string;
    couponEnabled: boolean;
    couponCode: string;
    couponDiscountType: 'percentage' | 'fixed';
    couponDiscountValue: number;
    couponMessage: string;
    couponExpiry: string | null;
    couponStripeCouponId: string;
}

export const growthApi = {
    // Get public growth settings (no auth required)
    getSettings: () =>
        api.get<PublicGrowthSettings>('/growth/settings'),
};

// ============================================
// Manual Payment API
// ============================================

export interface ManualPaymentSubmission {
    planId: string;
    method: 'EASYPAISA' | 'JAZZCASH' | 'BANK_TRANSFER';
    senderName: string;
    senderNumber?: string;
    reference?: string;
    screenshotUrl: string;
    couponCode?: string;
}

export interface ManualPaymentResponse {
    id: string;
    status: string;
    planName: string;
    originalPrice: number;
    finalPrice: number;
    couponApplied: string | null;
    message: string;
}

export interface ManualPaymentStatus {
    id: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    planName: string;
    method: string;
    amount: number;
    createdAt: string;
    reviewedAt: string | null;
    rejectionReason: string | null;
}

export const manualPaymentApi = {
    // Submit manual payment
    submit: (data: ManualPaymentSubmission) =>
        api.post<ManualPaymentResponse>('/checkout/manual', data),

    // Get my manual payment history (authenticated)
    getMyPayments: () =>
        api.get<ManualPaymentStatus[]>('/tenant/manual-payments'),
};

export default api;


