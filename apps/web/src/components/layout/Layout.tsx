import { ReactNode, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    LayoutDashboard,
    MessageSquare,
    ShoppingBag,
    LogOut,
    Menu,
    X,
    Box,
    Settings,
    Users,
    BarChart3,
    Inbox,
    CreditCard
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { clsx } from 'clsx';
import { useAuth } from '../../contexts/AuthContext';

interface LayoutProps {
    children: ReactNode;
}

// Pages that require TENANT_ADMIN or higher (hidden from STAFF)
const ADMIN_ONLY_PATHS = ['/settings', '/billing', '/team'];

const NAV_ITEMS = [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
    { label: 'Services', icon: Box, path: '/services' },
    { label: 'Orders', icon: ShoppingBag, path: '/orders' },
    { label: 'Inbox', icon: Inbox, path: '/inbox' },
    { label: 'Analytics', icon: BarChart3, path: '/analytics' },
    { label: 'Team', icon: Users, path: '/team' },
    { label: 'Billing', icon: CreditCard, path: '/billing' },
    { label: 'Settings', icon: Settings, path: '/settings' },
];

export function Layout({ children }: LayoutProps) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const location = useLocation();
    const { user, logout } = useAuth();

    // Get user initials from email
    const userInitials = user?.email
        ? user.email.split('@')[0].slice(0, 2).toUpperCase()
        : 'U';

    // SECURITY: Filter nav items based on role - STAFF cannot see admin pages
    const filteredNavItems = user?.role === 'STAFF'
        ? NAV_ITEMS.filter(item => !ADMIN_ONLY_PATHS.includes(item.path))
        : NAV_ITEMS;

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
            {/* Mobile Header */}
            <div className="md:hidden bg-slate-900 text-white p-4 flex items-center justify-between sticky top-0 z-30">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
                        <MessageSquare className="w-5 h-5 text-white" />
                    </div>
                    <span className="font-bold">B2Automate</span>
                </div>
                <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-slate-800 rounded-lg">
                    {isSidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                </button>
            </div>

            {/* Sidebar */}
            <motion.aside
                initial={false}
                animate={{ width: isSidebarOpen ? 240 : 80 }}
                className="bg-slate-900 text-white flex-shrink-0 relative overflow-hidden hidden md:flex flex-col z-20"
            >
                <div className="p-6 flex items-center gap-3">
                    <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center flex-shrink-0">
                        <MessageSquare className="w-5 h-5 text-white" />
                    </div>
                    {isSidebarOpen && (
                        <motion.span
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="font-bold text-lg tracking-tight"
                        >
                            B2Automate
                        </motion.span>
                    )}
                </div>

                <nav className="flex-1 px-4 py-6 space-y-2">
                    {filteredNavItems.map((item) => {
                        const isActive = location.pathname.startsWith(item.path);
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={clsx(
                                    "flex items-center gap-3 px-4 py-3 rounded-xl transition-all group",
                                    isActive ? "bg-primary-600 text-white shadow-lg shadow-primary-900/20" : "text-slate-400 hover:bg-slate-800 hover:text-white"
                                )}
                            >
                                <item.icon className={clsx("w-5 h-5 flex-shrink-0", isActive && "text-white")} />
                                {isSidebarOpen && (
                                    <motion.span
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="font-medium whitespace-nowrap"
                                    >
                                        {item.label}
                                    </motion.span>
                                )}
                            </Link>
                        )
                    })}
                </nav>

                {/* User info and logout */}
                <div className="p-4 border-t border-slate-800">
                    {isSidebarOpen && user && (
                        <div className="px-4 py-2 mb-2">
                            <p className="text-sm font-medium text-white truncate">{user.email}</p>
                            <p className="text-xs text-slate-400">{user.role.replace('_', ' ')}</p>
                        </div>
                    )}
                    <button
                        onClick={logout}
                        className="flex items-center gap-3 px-4 py-2 w-full text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                    >
                        <LogOut className="w-5 h-5" />
                        {isSidebarOpen && <span>Sign Out</span>}
                    </button>
                </div>
            </motion.aside>

            {/* Main Content */}
            <main className="flex-1 min-w-0 overflow-y-auto h-screen relative">
                {/* Mobile Sidebar Overlay */}
                <AnimatePresence>
                    {isSidebarOpen && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="md:hidden absolute inset-0 bg-black/50 z-10"
                            onClick={() => setIsSidebarOpen(false)}
                        >
                            <motion.div
                                initial={{ x: -280 }}
                                animate={{ x: 0 }}
                                exit={{ x: -280 }}
                                className="absolute left-0 top-0 bottom-0 w-64 bg-slate-900 p-4 h-full"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <nav className="space-y-2 mt-12">
                                    {filteredNavItems.map((item) => (
                                        <Link key={item.path} to={item.path} onClick={() => setIsSidebarOpen(false)} className="flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-white">
                                            <item.icon className="w-5 h-5" />
                                            <span>{item.label}</span>
                                        </Link>
                                    ))}
                                </nav>
                                <button
                                    onClick={logout}
                                    className="flex items-center gap-3 px-4 py-2 mt-4 w-full text-slate-400 hover:text-white"
                                >
                                    <LogOut className="w-5 h-5" />
                                    <span>Sign Out</span>
                                </button>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <header className="hidden md:flex bg-white border-b border-slate-200 h-16 items-center justify-between px-8 sticky top-0 z-10 opacity-95 backdrop-blur-sm">
                    <h1 className="text-xl font-semibold text-slate-800">
                        {NAV_ITEMS.find(i => location.pathname.startsWith(i.path))?.label || 'Portal'}
                    </h1>
                    <div className="flex items-center gap-4">
                        <div className="text-right hidden sm:block">
                            <p className="text-sm font-medium text-slate-700">{user?.email}</p>
                            <p className="text-xs text-slate-500">{user?.role.replace('_', ' ')}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold border border-primary-200">
                            {userInitials}
                        </div>
                    </div>
                </header>
                <div className="p-8 max-w-7xl mx-auto space-y-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
