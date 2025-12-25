import { useState, useEffect } from 'react';
import { Card } from '../components/ui/Card';
import { BarChart3, TrendingUp, Package, Users, DollarSign, ShoppingCart, Loader2, AlertCircle } from 'lucide-react';
import api from '../lib/api';

interface AnalyticsData {
    summary: {
        totalOrders: number;
        pendingOrders: number;
        approvedOrders: number;
        totalRevenue: number;
        activeServices: number;
        totalUsers: number;
    };
    ordersByDate: Array<{ date: string; count: number }>;
    recentOrders: Array<{ id: string; status: string; totalAmount: string; createdAt: string }>;
}

export function Analytics() {
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [days, setDays] = useState(30);

    useEffect(() => {
        loadAnalytics();
    }, [days]);

    const loadAnalytics = async () => {
        setLoading(true);
        try {
            const res = await api.get<AnalyticsData>(`/tenant/analytics?days=${days}`);
            setData(res.data);
        } catch (err) {
            setError('Failed to load analytics');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            </div>
        );
    }

    if (error || !data) {
        return (
            <Card className="p-8 text-center">
                <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-400" />
                <p className="text-slate-600">{error || 'No data available'}</p>
            </Card>
        );
    }

    const maxCount = Math.max(...data.ordersByDate.map(d => d.count), 1);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-slate-900">Analytics</h2>
                <select
                    value={days}
                    onChange={(e) => setDays(Number(e.target.value))}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                    <option value={7}>Last 7 days</option>
                    <option value={30}>Last 30 days</option>
                    <option value={90}>Last 90 days</option>
                </select>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-lg">
                            <ShoppingCart className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-500">Total Orders</p>
                            <p className="text-2xl font-bold text-slate-900">{data.summary.totalOrders}</p>
                        </div>
                    </div>
                </Card>
                <Card className="p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-100 rounded-lg">
                            <DollarSign className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-500">Total Revenue</p>
                            <p className="text-2xl font-bold text-slate-900">${Number(data.summary.totalRevenue).toFixed(2)}</p>
                        </div>
                    </div>
                </Card>
                <Card className="p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 rounded-lg">
                            <Package className="w-5 h-5 text-purple-600" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-500">Active Services</p>
                            <p className="text-2xl font-bold text-slate-900">{data.summary.activeServices}</p>
                        </div>
                    </div>
                </Card>
                <Card className="p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-100 rounded-lg">
                            <Users className="w-5 h-5 text-amber-600" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-500">Team Members</p>
                            <p className="text-2xl font-bold text-slate-900">{data.summary.totalUsers}</p>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Orders Chart */}
            <Card className="p-6">
                <div className="flex items-center gap-2 mb-4">
                    <BarChart3 className="w-5 h-5 text-slate-500" />
                    <h3 className="text-lg font-semibold text-slate-900">Orders Over Time</h3>
                </div>
                <div className="h-48 flex items-end gap-1">
                    {data.ordersByDate.map((item, index) => {
                        const height = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
                        return (
                            <div
                                key={index}
                                className="flex-1 group relative"
                            >
                                <div
                                    className="bg-primary-500 rounded-t hover:bg-primary-600 transition-colors"
                                    style={{ height: `${Math.max(height, 2)}%` }}
                                />
                                <div className="opacity-0 group-hover:opacity-100 absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-white text-xs rounded whitespace-nowrap z-10">
                                    {item.date}: {item.count} orders
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div className="flex justify-between mt-2 text-xs text-slate-400">
                    <span>{data.ordersByDate[0]?.date || ''}</span>
                    <span>{data.ordersByDate[data.ordersByDate.length - 1]?.date || ''}</span>
                </div>
            </Card>

            {/* Order Status Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="p-6">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">Order Status</h3>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-600">Pending Approval</span>
                            <span className="font-semibold text-amber-600">{data.summary.pendingOrders}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-600">Approved</span>
                            <span className="font-semibold text-green-600">{data.summary.approvedOrders}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-600">Total</span>
                            <span className="font-semibold text-slate-900">{data.summary.totalOrders}</span>
                        </div>
                    </div>
                </Card>

                <Card className="p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <TrendingUp className="w-5 h-5 text-slate-500" />
                        <h3 className="text-lg font-semibold text-slate-900">Recent Orders</h3>
                    </div>
                    {data.recentOrders.length > 0 ? (
                        <div className="space-y-2">
                            {data.recentOrders.slice(0, 5).map(order => (
                                <div key={order.id} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                                    <span className="text-sm text-slate-600">
                                        {new Date(order.createdAt).toLocaleDateString()}
                                    </span>
                                    <span className={`text-xs px-2 py-1 rounded-full ${order.status === 'APPROVED' ? 'bg-green-100 text-green-700' :
                                        order.status === 'PENDING_APPROVAL' ? 'bg-amber-100 text-amber-700' :
                                            'bg-slate-100 text-slate-600'
                                        }`}>
                                        {order.status.replace('_', ' ')}
                                    </span>
                                    <span className="font-medium text-slate-900">
                                        ${Number(order.totalAmount).toFixed(2)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-slate-500 text-center py-4">No recent orders</p>
                    )}
                </Card>
            </div>

            {/* AI Usage Trends Chart */}
            <AiUsageTrends />
        </div>
    );
}

/**
 * AI Usage Trends Chart Component
 * Displays AI request counts over last 7 or 30 days
 */
function AiUsageTrends() {
    const [aiData, setAiData] = useState<{ date: string; count: number }[]>([]);
    const [aiLoading, setAiLoading] = useState(true);
    const [aiDays, setAiDays] = useState(7);

    useEffect(() => {
        loadAiUsage();
    }, [aiDays]);

    const loadAiUsage = async () => {
        setAiLoading(true);
        try {
            // Try to load AI usage data from billing endpoint
            const res = await api.get<any>('/tenant/ai-usage', { params: { days: aiDays } });
            if (res.data?.usage) {
                setAiData(res.data.usage);
            } else {
                // Generate placeholder data if endpoint doesn't exist yet
                const placeholder = Array.from({ length: aiDays }, (_, i) => {
                    const date = new Date();
                    date.setDate(date.getDate() - (aiDays - i - 1));
                    return {
                        date: date.toISOString().split('T')[0],
                        count: 0
                    };
                });
                setAiData(placeholder);
            }
        } catch (err) {
            // Silently fail - generate empty chart
            const placeholder = Array.from({ length: aiDays }, (_, i) => {
                const date = new Date();
                date.setDate(date.getDate() - (aiDays - i - 1));
                return {
                    date: date.toISOString().split('T')[0],
                    count: 0
                };
            });
            setAiData(placeholder);
        } finally {
            setAiLoading(false);
        }
    };

    const maxCount = Math.max(...aiData.map(d => d.count), 1);

    if (aiLoading) {
        return (
            <Card className="p-6">
                <div className="h-48 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
                </div>
            </Card>
        );
    }

    return (
        <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-purple-500" />
                    <h3 className="text-lg font-semibold text-slate-900">AI Usage Trends</h3>
                </div>
                <select
                    value={aiDays}
                    onChange={(e) => setAiDays(Number(e.target.value))}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                    <option value={7}>Last 7 days</option>
                    <option value={30}>Last 30 days</option>
                </select>
            </div>
            <div className="h-36 flex items-end gap-1">
                {aiData.map((item, index) => {
                    const height = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
                    return (
                        <div
                            key={index}
                            className="flex-1 group relative"
                        >
                            <div
                                className="bg-purple-500 rounded-t hover:bg-purple-600 transition-colors"
                                style={{ height: `${Math.max(height, 2)}%` }}
                            />
                            <div className="opacity-0 group-hover:opacity-100 absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-white text-xs rounded whitespace-nowrap z-10">
                                {item.date}: {item.count} AI requests
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="flex justify-between mt-2 text-xs text-slate-400">
                <span>{aiData[0]?.date || ''}</span>
                <span>{aiData[aiData.length - 1]?.date || ''}</span>
            </div>
            <p className="text-xs text-slate-500 mt-3 text-center">
                {aiData.reduce((sum, d) => sum + d.count, 0)} total AI requests in last {aiDays} days
            </p>
        </Card>
    );
}
