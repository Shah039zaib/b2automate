import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { jwtDecode } from 'jwt-decode';
import { authApi, getToken, setToken, removeToken } from '../lib/api';

interface User {
    id: string;
    email: string;
    role: 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'STAFF';
    tenantId: string | null;
}

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const token = getToken();
        if (token) {
            try {
                const decoded = jwtDecode<User & { exp: number }>(token);
                // Check expiration
                if (decoded.exp * 1000 > Date.now()) {
                    // Verify it's a SUPER_ADMIN
                    if (decoded.role === 'SUPER_ADMIN') {
                        setUser({
                            id: decoded.id,
                            email: decoded.email,
                            role: decoded.role,
                            tenantId: decoded.tenantId || null
                        });
                    } else {
                        // Not a super admin - clear token
                        removeToken();
                    }
                } else {
                    removeToken();
                }
            } catch {
                removeToken();
            }
        }
        setIsLoading(false);
    }, []);

    const login = async (email: string, password: string) => {
        const response = await authApi.login({ email, password });
        const token = response.data.accessToken;

        // Decode and verify role
        const decoded = jwtDecode<User & { exp: number }>(token);
        if (decoded.role !== 'SUPER_ADMIN') {
            throw new Error('Access denied. Super Admin role required.');
        }

        setToken(token);
        setUser({
            id: decoded.id,
            email: decoded.email,
            role: decoded.role,
            tenantId: decoded.tenantId || null
        });
    };

    const logout = () => {
        removeToken();
        setUser(null);
        window.location.href = '/login';
    };

    return (
        <AuthContext.Provider value={{
            user,
            isAuthenticated: !!user,
            isLoading,
            login,
            logout
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
