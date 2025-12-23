import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Storage keys
const TOKEN_KEY = 'b2_auth_token';

// Token management
export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string): void => localStorage.setItem(TOKEN_KEY, token);
export const removeToken = (): void => localStorage.removeItem(TOKEN_KEY);

// Create Axios instance
const api: AxiosInstance = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

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

// Response interceptor - handle 401
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            removeToken();
            // Redirect to login if not already there
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

export default api;
