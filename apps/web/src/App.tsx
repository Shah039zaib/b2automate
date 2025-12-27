import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Suspense, lazy } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { GrowthProvider } from './contexts/GrowthContext';
import { Layout } from './components/layout/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Onboarding } from './pages/Onboarding';
import { Services } from './pages/Services';
import { Orders } from './pages/Orders';
import { Landing } from './pages/Landing';
import { Pricing } from './pages/Pricing';
import { CheckoutSuccess } from './pages/CheckoutSuccess';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { Loader2 } from 'lucide-react';

// ============================================
// Code Splitting: Lazy-load heavy pages
// These are admin/analytics pages with larger bundles
// ============================================
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const Team = lazy(() => import('./pages/Team').then(m => ({ default: m.Team })));
const Analytics = lazy(() => import('./pages/Analytics').then(m => ({ default: m.Analytics })));
const Inbox = lazy(() => import('./pages/Inbox').then(m => ({ default: m.Inbox })));
const Billing = lazy(() => import('./pages/Billing').then(m => ({ default: m.Billing })));

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

// SECURITY: Admin-only route - blocks STAFF from Settings, Billing, Team
function AdminRoute({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, isLoading, user } = useAuth();

    if (isLoading) {
        return <AuthLoading />;
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    // STAFF users cannot access admin pages - redirect to dashboard
    if (user?.role === 'STAFF') {
        return <Navigate to="/dashboard" replace />;
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
        <Suspense fallback={<AuthLoading />}>
            <Routes>
                {/* Public pages - no auth required */}
                <Route path="/" element={<Landing />} />
                <Route path="/pricing" element={<Pricing />} />
                <Route path="/checkout/success" element={<CheckoutSuccess />} />

                {/* Auth routes */}
                <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
                <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
                <Route path="/reset-password" element={<PublicRoute><ResetPassword /></PublicRoute>} />
                {/* Onboarding: accessible publicly AND for authenticated users (New Tenant Setup) */}
                <Route path="/onboarding" element={<Onboarding />} />

                {/* Protected routes - require authentication */}
                <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
                <Route path="/services" element={<PrivateRoute><Services /></PrivateRoute>} />
                <Route path="/orders" element={<PrivateRoute><Orders /></PrivateRoute>} />
                {/* Admin-only routes - STAFF users redirected to dashboard */}
                {/* Code-split pages wrapped in Suspense at parent level */}
                <Route path="/settings" element={<AdminRoute><Settings /></AdminRoute>} />
                <Route path="/team" element={<AdminRoute><Team /></AdminRoute>} />
                <Route path="/analytics" element={<PrivateRoute><Analytics /></PrivateRoute>} />
                <Route path="/inbox" element={<PrivateRoute><Inbox /></PrivateRoute>} />
                <Route path="/billing" element={<AdminRoute><Billing /></AdminRoute>} />
            </Routes>
        </Suspense>
    );
}

export default function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <AuthProvider>
                <GrowthProvider>
                    <Router>
                        <AppRoutes />
                    </Router>
                </GrowthProvider>
            </AuthProvider>
        </QueryClientProvider>
    );
}

