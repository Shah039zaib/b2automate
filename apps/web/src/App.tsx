import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Layout } from './components/layout/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Onboarding } from './pages/Onboarding';
import { Services } from './pages/Services';
import { Orders } from './pages/Orders';
import { Loader2 } from 'lucide-react';

// Create a client
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60, // 1 minute
            retry: 1,
        },
    },
});

// Loading spinner for auth check
function AuthLoading() {
    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
    );
}

// Protected route wrapper
function PrivateRoute({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, isLoading } = useAuth();

    if (isLoading) {
        return <AuthLoading />;
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    return <Layout>{children}</Layout>;
}

// Public route - redirect if already logged in
function PublicRoute({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, isLoading } = useAuth();

    if (isLoading) {
        return <AuthLoading />;
    }

    if (isAuthenticated) {
        return <Navigate to="/dashboard" replace />;
    }

    return <>{children}</>;
}

// App routes wrapped with auth context
function AppRoutes() {
    return (
        <Routes>
            {/* Public routes - accessible without authentication */}
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/onboarding" element={<PublicRoute><Onboarding /></PublicRoute>} />

            {/* Default redirect */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />

            {/* Protected routes - require authentication */}
            <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
            <Route path="/services" element={<PrivateRoute><Services /></PrivateRoute>} />
            <Route path="/orders" element={<PrivateRoute><Orders /></PrivateRoute>} />
        </Routes>
    );
}

export default function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <AuthProvider>
                <Router>
                    <AppRoutes />
                </Router>
            </AuthProvider>
        </QueryClientProvider>
    );
}
