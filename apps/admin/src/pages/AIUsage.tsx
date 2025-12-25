import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card } from '../components/ui/Card';
import {
    Brain,
    DollarSign,
    AlertTriangle,
    Shield,
    Loader2,
    RefreshCw,
    Building2,
    CheckCircle,
    XCircle,
    AlertCircle
} from 'lucide-react';
import api from '../lib/api';

// Types
interface UsageOverview {
    totalRequests: number;
    totalBlocked: number;
    totalGuardrailViolations: number;
    estimatedCost: number;
    dateRange: { start: string; end: string };
}

interface TierBreakdown {
    tier: string;
    count: number;
    percentage: number;
}

interface TenantUsage {
    tenantId: string;
    tenantName: string;
    aiPlan: string;
    aiTier: string;
    todayUsage: number;
    dailyLimit: number;
    monthlyUsage: number;
    monthlyLimit: number;
    percentDailyUsed: number;
    percentMonthlyUsed: number;
    status: 'OK' | 'WARNING' | 'BLOCKED';
}

type FilterType = 'today' | '7d' | '30d' | 'all';

export function AIUsage() {
    const [overview, setOverview] = useState<UsageOverview | null>(null);
    const [tierBreakdown, setTierBreakdown] = useState<TierBreakdown[]>([]);
    const [tenants, setTenants] = useState<TenantUsage[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<FilterType>('today');

    useEffect(() => {
        loadData();
    }, [filter]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [overviewRes, tierRes, tenantsRes] = await Promise.all([
                api.get(`/admin/ai-usage/overview?filter=${filter}`),
                api.get(`/admin/ai-usage/by-tier?filter=${filter}`),
                api.get(`/admin/ai-usage/by-tenant?filter=${filter}&limit=50`)
            ]);
            setOverview(overviewRes.data);
            setTierBreakdown(tierRes.data);
            setTenants(tenantsRes.data.tenants);
        } catch (err) {
            console.error('Failed to load AI usage data', err);
        } finally {
            setLoading(false);
        }
    };

    const getTierColor = (tier: string) => {
        switch (tier) {
            case 'FREE': return 'bg-green-500';
            case 'LOW': return 'bg-blue-500';
            case 'MEDIUM': return 'bg-amber-500';
            case 'HIGH': return 'bg-purple-500';
            default: return 'bg-slate-500';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'OK': return <CheckCircle className="w-5 h-5 text-green-500" />;
            case 'WARNING': return <AlertCircle className="w-5 h-5 text-amber-500" />;
            case 'BLOCKED': return <XCircle className="w-5 h-5 text-red-500" />;
            default: return null;
        }
    };

    const getPlanBadge = (plan: string) => {
        const colors: Record<string, string> = {
            FREE: 'bg-slate-100 text-slate-700',
            PAID_BASIC: 'bg-blue-100 text-blue-700',
            PAID_PRO: 'bg-amber-100 text-amber-700',
            ENTERPRISE: 'bg-purple-100 text-purple-700'
        };
        return colors[plan] || 'bg-slate-100 text-slate-700';
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
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">AI Usage Dashboard</h2>
                    <p className="text-sm text-slate-500 mt-1">Monitor AI usage across all tenants</p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Filter Buttons */}
                    <div className="flex bg-slate-100 rounded-lg p-1">
                        {(['today', '7d', '30d', 'all'] as FilterType[]).map((f) => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${filter === f
                                    ? 'bg-white text-primary-600 shadow-sm'
                                    : 'text-slate-600 hover:text-slate-900'
                                    }`}
                            >
                                {f === 'today' ? 'Today' : f === '7d' ? '7 Days' : f === '30d' ? '30 Days' : 'All'}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={loadData}
                        className="p-2 text-slate-600 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                    >
                        <RefreshCw className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}>
                    <Card className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-primary-100 rounded-xl">
                                <Brain className="w-6 h-6 text-primary-600" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500">AI Requests</p>
                                <p className="text-2xl font-bold text-slate-900">{overview?.totalRequests.toLocaleString() || 0}</p>
                            </div>
                        </div>
                    </Card>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                    <Card className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-green-100 rounded-xl">
                                <DollarSign className="w-6 h-6 text-green-600" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500">Estimated Cost</p>
                                <p className="text-2xl font-bold text-slate-900">${overview?.estimatedCost.toFixed(2) || '0.00'}</p>
                            </div>
                        </div>
                    </Card>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                    <Card className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-red-100 rounded-xl">
                                <AlertTriangle className="w-6 h-6 text-red-600" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500">Blocked Requests</p>
                                <p className="text-2xl font-bold text-slate-900">{overview?.totalBlocked || 0}</p>
                            </div>
                        </div>
                    </Card>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                    <Card className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-amber-100 rounded-xl">
                                <Shield className="w-6 h-6 text-amber-600" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500">Guardrail Violations</p>
                                <p className="text-2xl font-bold text-slate-900">{overview?.totalGuardrailViolations || 0}</p>
                            </div>
                        </div>
                    </Card>
                </motion.div>
            </div>

            {/* Tier Distribution & Tenants */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Tier Distribution */}
                <Card className="lg:col-span-1">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">Usage by Tier</h3>
                    <div className="space-y-3">
                        {tierBreakdown.map((tier) => (
                            <div key={tier.tier} className="space-y-1">
                                <div className="flex justify-between text-sm">
                                    <span className="font-medium text-slate-700">{tier.tier}</span>
                                    <span className="text-slate-500">{tier.count} ({tier.percentage}%)</span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-2">
                                    <div
                                        className={`h-2 rounded-full ${getTierColor(tier.tier)}`}
                                        style={{ width: `${tier.percentage}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>

                {/* Per-Tenant Table */}
                <Card className="lg:col-span-2 overflow-hidden">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                        <Building2 className="w-5 h-5" />
                        Tenant Usage
                    </h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-200">
                                    <th className="text-left py-2 px-2 font-medium text-slate-500">Tenant</th>
                                    <th className="text-left py-2 px-2 font-medium text-slate-500">Plan</th>
                                    <th className="text-left py-2 px-2 font-medium text-slate-500">Today</th>
                                    <th className="text-left py-2 px-2 font-medium text-slate-500">Monthly</th>
                                    <th className="text-left py-2 px-2 font-medium text-slate-500">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tenants.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="text-center py-8 text-slate-500">
                                            No tenant usage data yet
                                        </td>
                                    </tr>
                                ) : (
                                    tenants.map((tenant) => (
                                        <tr key={tenant.tenantId} className="border-b border-slate-100 hover:bg-slate-50">
                                            <td className="py-2 px-2">
                                                <span className="font-medium text-slate-900">{tenant.tenantName}</span>
                                            </td>
                                            <td className="py-2 px-2">
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPlanBadge(tenant.aiPlan)}`}>
                                                    {tenant.aiPlan.replace('_', ' ')}
                                                </span>
                                            </td>
                                            <td className="py-2 px-2">
                                                <span className="text-slate-900">{tenant.todayUsage}</span>
                                                <span className="text-slate-400">/{tenant.dailyLimit}</span>
                                            </td>
                                            <td className="py-2 px-2">
                                                <span className="text-slate-900">{tenant.monthlyUsage}</span>
                                                <span className="text-slate-400">/{tenant.monthlyLimit}</span>
                                            </td>
                                            <td className="py-2 px-2">
                                                <div className="flex items-center gap-1">
                                                    {getStatusIcon(tenant.status)}
                                                    <span className={`text-xs font-medium ${tenant.status === 'OK' ? 'text-green-600' :
                                                        tenant.status === 'WARNING' ? 'text-amber-600' :
                                                            'text-red-600'
                                                        }`}>
                                                        {tenant.status}
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>
        </div>
    );
}
