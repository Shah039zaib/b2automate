import { ReactNode, useState } from 'react';
import { motion } from 'framer-motion';
import {
    LayoutDashboard,
    Building2,
    FileText,
    LogOut,
    Menu,
    X,
    Shield,
    Settings,
    CreditCard,
    Megaphone,
    Banknote
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { clsx } from 'clsx';
import { useAuth } from '../../contexts/AuthContext';

interface LayoutProps {
    children: ReactNode;
}

const NAV_ITEMS = [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
    { label: 'Tenants', icon: Building2, path: '/tenants' },
    { label: 'Plans', icon: CreditCard, path: '/plans' },
    { label: 'Growth', icon: Megaphone, path: '/growth' },
    { label: 'Manual Payments', icon: Banknote, path: '/manual-payments' },
    { label: 'Audit Logs', icon: FileText, path: '/audit-logs' },
    { label: 'Settings', icon: Settings, path: '/settings' },
];

export function Layout({ children }: LayoutProps) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const location = useLocation();
    const { user, logout } = useAuth();

    return (
        <div className="min-h-screen bg-slate-50 flex">
            {/* Sidebar */}
            <motion.aside
                initial={false}
                animate={{ width: isSidebarOpen ? 240 : 80 }}
                className="bg-slate-900 text-white flex-shrink-0 flex flex-col"
            >
                <div className="p-6 flex items-center gap-3">
                    <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Shield className="w-5 h-5 text-white" />
                    </div>
                    {isSidebarOpen && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                        >
                            <span className="font-bold text-lg">B2Automate</span>
                            <span className="block text-xs text-primary-400">Super Admin</span>
                        </motion.div>
                    )}
                </div>

                <nav className="flex-1 px-4 py-6 space-y-2">
                    {NAV_ITEMS.map((item) => {
                        const isActive = location.pathname.startsWith(item.path);
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={clsx(
                                    "flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                                    isActive
                                        ? "bg-primary-600 text-white shadow-lg"
                                        : "text-slate-400 hover:bg-slate-800 hover:text-white"
                                )}
                            >
                                <item.icon className="w-5 h-5 flex-shrink-0" />
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
                        );
                    })}
                </nav>

                {/* User info and logout */}
                <div className="p-4 border-t border-slate-800">
                    {isSidebarOpen && user && (
                        <div className="px-4 py-2 mb-2">
                            <p className="text-sm font-medium text-white truncate">{user.email}</p>
                            <p className="text-xs text-primary-400">{user.role.replace('_', ' ')}</p>
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
            <main className="flex-1 min-w-0 overflow-y-auto h-screen">
                <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-8 sticky top-0 z-10">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                            className="p-2 hover:bg-slate-100 rounded-lg"
                        >
                            {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                        </button>
                        <h1 className="text-xl font-semibold text-slate-800">
                            {NAV_ITEMS.find(i => location.pathname.startsWith(i.path))?.label || 'Admin'}
                        </h1>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-primary-50 text-primary-700 rounded-full text-sm font-medium">
                        <Shield className="w-4 h-4" />
                        Super Admin
                    </div>
                </header>
                <div className="p-8 max-w-7xl mx-auto">
                    {children}
                </div>
            </main>
        </div>
    );
}
