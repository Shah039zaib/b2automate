import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { jwtDecode } from 'jwt-decode';
import { authApi, getToken, setToken, setRefreshToken, clearTokens, RegisterRequest } from '../lib/api';

// JWT payload structure
interface JwtPayload {
    id: string;
    email: string;
    role: 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'STAFF';
    tenantId: string;
    iat?: number;
    exp?: number;
}

export interface User {
    id: string;
    email: string;
    role: 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'STAFF';
    tenantId: string;
}

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
    register: (data: RegisterRequest) => Promise<void>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Decode token and extract user
function decodeToken(token: string): User | null {
    try {
        const decoded = jwtDecode<JwtPayload>(token);

        // Check expiration
        if (decoded.exp && decoded.exp * 1000 < Date.now()) {
            return null;
        }

        return {
            id: decoded.id,
            email: decoded.email,
            role: decoded.role,
            tenantId: decoded.tenantId,
        };
    } catch {
        return null;
    }
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Check for existing token on mount
    useEffect(() => {
        const token = getToken();
        if (token) {
            const decoded = decodeToken(token);
            if (decoded) {
                setUser(decoded);
            } else {
                // Token expired or invalid
                clearTokens();
            }
        }
        setIsLoading(false);
    }, []);

    const login = useCallback(async (email: string, password: string) => {
        const response = await authApi.login({ email, password });
        const { token, refreshToken } = response.data;

        setToken(token);
        if (refreshToken) {
            setRefreshToken(refreshToken);
        }
        const decoded = decodeToken(token);
        if (decoded) {
            setUser(decoded);
        }
    }, []);

    const register = useCallback(async (data: RegisterRequest) => {
        // Register creates tenant + user, then we login
        await authApi.register(data);
        // After registration, login to get token
        await login(data.email, data.password);
    }, [login]);

    const logout = useCallback(() => {
        clearTokens();
        setUser(null);
        window.location.href = '/login';
    }, []);

    const value: AuthContextType = {
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        logout,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthContextType {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
