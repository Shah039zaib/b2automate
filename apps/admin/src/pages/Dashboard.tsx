import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card } from '../components/ui/Card';
import { Building2, Users, ShoppingCart, Package, TrendingUp, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { adminApi, GlobalStats } from '../lib/api';
import { Link } from 'react-router-dom';

export function Dashboard() {
    const [stats, setStats] = useState<GlobalStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadStats();

        // Real-time updates: Poll every 30 seconds
        const interval = setInterval(() => {
            loadStats(true); // silent refresh
        }, 30000);

        return () => clearInterval(interval);
    }, []);

    const loadStats = async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const res = await adminApi.getStats();
            setStats(res.data);
        } catch (err) {
            console.error('Failed to load stats', err);
        } finally {
            if (!silent) setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-slate-900">System Overview</h2>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}>
                    <Card className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-primary-100 rounded-xl">
                                <Building2 className="w-6 h-6 text-primary-600" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500">Total Tenants</p>
                                <p className="text-2xl font-bold text-slate-900">{stats?.tenants.total || 0}</p>
                            </div>
                        </div>
                    </Card>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                    <Card className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-green-100 rounded-xl">
                                <Users className="w-6 h-6 text-green-600" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500">Total Users</p>
                                <p className="text-2xl font-bold text-slate-900">{stats?.users || 0}</p>
                            </div>
                        </div>
                    </Card>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                    <Card className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-blue-100 rounded-xl">
                                <ShoppingCart className="w-6 h-6 text-blue-600" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500">Total Orders</p>
                                <p className="text-2xl font-bold text-slate-900">{stats?.orders.total || 0}</p>
                            </div>
                        </div>
                    </Card>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                    <Card className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-amber-100 rounded-xl">
                                <Package className="w-6 h-6 text-amber-600" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500">Total Services</p>
                                <p className="text-2xl font-bold text-slate-900">{stats?.services || 0}</p>
                            </div>
                        </div>
                    </Card>
                </motion.div>
            </div>

            {/* Tenant Status */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">Tenant Status</h3>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                            <div className="flex items-center gap-2">
                                <CheckCircle className="w-5 h-5 text-green-600" />
                                <span className="font-medium text-green-700">Active</span>
                            </div>
                            <span className="text-2xl font-bold text-green-700">{stats?.tenants.active || 0}</span>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5 text-red-600" />
                                <span className="font-medium text-red-700">Suspended</span>
                            </div>
                            <span className="text-2xl font-bold text-red-700">{stats?.tenants.suspended || 0}</span>
                        </div>
                    </div>
                    <Link
                        to="/tenants"
                        className="mt-4 inline-flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium text-sm"
                    >
                        <TrendingUp className="w-4 h-4" />
                        View All Tenants
                    </Link>
                </Card>

                <Card>
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">Order Status</h3>
                    <div className="space-y-3">
                        {stats?.orders.byStatus && Object.entries(stats.orders.byStatus).map(([status, count]) => (
                            <div key={status} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                                <span className="text-sm text-slate-600">{status.replace('_', ' ')}</span>
                                <span className="font-semibold text-slate-900">{count}</span>
                            </div>
                        ))}
                        {(!stats?.orders.byStatus || Object.keys(stats.orders.byStatus).length === 0) && (
                            <p className="text-sm text-slate-500 text-center py-4">No orders yet</p>
                        )}
                    </div>
                </Card>
            </div>
        </div>
    );
}
