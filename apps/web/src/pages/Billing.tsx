/**
 * Billing Page
 * 
 * Tenant billing management - view plan, usage, manage subscription
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { billingApi, TenantBillingInfo } from '../lib/api';
import {
    CreditCard,
    Zap,
    BarChart3,
    ExternalLink,
    AlertCircle,
    CheckCircle,
    ArrowUpRight,
    Clock
} from 'lucide-react';
import { Link } from 'react-router-dom';

export function Billing() {
    const [billingInfo, setBillingInfo] = useState<TenantBillingInfo | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [portalLoading, setPortalLoading] = useState(false);

    useEffect(() => {
        loadBillingInfo();
    }, []);

    const loadBillingInfo = async () => {
        try {
            setIsLoading(true);
            const response = await billingApi.getTenantBilling();
            setBillingInfo(response.data);
            setError(null);
        } catch (err: any) {
            console.error('Failed to load billing info:', err);
            setError('Unable to load billing information');
        } finally {
            setIsLoading(false);
        }
    };

    const openPortal = async () => {
        try {
            setPortalLoading(true);
            const response = await billingApi.createPortalSession();
            window.location.href = response.data.url;
        } catch (err: any) {
            console.error('Portal failed:', err);
            setError(err.response?.data?.error || 'Unable to open billing portal');
            setPortalLoading(false);
        }
    };

    // Calculate days until subscription expires
    const getDaysUntilExpiry = (): number | null => {
        if (!billingInfo?.subscription?.currentPeriodEnd) return null;
        const now = new Date();
        const expiry = new Date(billingInfo.subscription.currentPeriodEnd);
        const diffMs = expiry.getTime() - now.getTime();
        return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    };

    const daysUntilExpiry = getDaysUntilExpiry();
    const showExpiryWarning = daysUntilExpiry !== null && daysUntilExpiry <= 7 && daysUntilExpiry > 0;
    const isPastDue = billingInfo?.subscription?.status === 'PAST_DUE';

    const getUsagePercentage = (used: number, limit: number) => {
        if (limit <= 0) return 0;
        return Math.min(100, Math.round((used / limit) * 100));
    };

    const getUsageColor = (percentage: number) => {
        if (percentage >= 90) return 'bg-red-500';
        if (percentage >= 70) return 'bg-amber-500';
        return 'bg-green-500';
    };

    // Skeleton loader
    if (isLoading) {
        return (
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
                        <div className="h-4 w-64 bg-slate-100 rounded animate-pulse mt-2" />
                    </div>
                </div>
                <div className="grid md:grid-cols-2 gap-6">
                    <div className="bg-white rounded-xl border border-slate-200 p-6 h-48 animate-pulse" />
                    <div className="bg-white rounded-xl border border-slate-200 p-6 h-48 animate-pulse" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Billing</h1>
                    <p className="text-slate-600 mt-1">Manage your subscription and usage</p>
                </div>
                {billingInfo?.subscription && (
                    <Button onClick={openPortal} isLoading={portalLoading}>
                        Manage Subscription
                        <ExternalLink className="w-4 h-4 ml-2" />
                    </Button>
                )}
            </div>

            {error && (
                <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" />
                    {error}
                </div>
            )}

            {/* PAST_DUE Warning Banner */}
            {isPastDue && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                    <div>
                        <p className="font-medium">Payment Past Due</p>
                        <p className="text-sm text-amber-700">Your last payment failed. Please update your payment method to avoid service interruption.</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={openPortal} className="ml-auto flex-shrink-0">
                        Update Payment
                    </Button>
                </div>
            )}

            {/* Expiry Warning Banner (7 days or less) */}
            {showExpiryWarning && !isPastDue && (
                <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg flex items-center gap-3">
                    <Clock className="w-5 h-5 text-blue-600 flex-shrink-0" />
                    <div>
                        <p className="font-medium">Subscription Expiring Soon</p>
                        <p className="text-sm text-blue-700">
                            Your subscription expires in {daysUntilExpiry} day{daysUntilExpiry === 1 ? '' : 's'}.
                            {billingInfo?.subscription?.cancelAtPeriodEnd && ' Auto-renewal is disabled.'}
                        </p>
                    </div>
                </div>
            )}

            <div className="grid md:grid-cols-2 gap-6">
                {/* Current Plan */}
                <Card>
                    <div className="flex items-start justify-between mb-4">
                        <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
                            <CreditCard className="w-6 h-6 text-primary-600" />
                        </div>
                        {/* Dynamic subscription status badge */}
                        {billingInfo?.subscription?.status === 'ACTIVE' && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-1 rounded-full">
                                <CheckCircle className="w-3 h-3" /> Active
                            </span>
                        )}
                        {billingInfo?.subscription?.status === 'PAST_DUE' && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
                                <AlertCircle className="w-3 h-3" /> Past Due
                            </span>
                        )}
                        {billingInfo?.subscription?.status === 'CANCELED' && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 px-2 py-1 rounded-full">
                                <AlertCircle className="w-3 h-3" /> Canceled
                            </span>
                        )}
                    </div>

                    <h3 className="text-lg font-semibold text-slate-900 mb-1">
                        {billingInfo?.subscription?.plan?.name || 'Free Plan'}
                    </h3>
                    <p className="text-sm text-slate-500 mb-4">
                        {billingInfo?.subscription
                            ? `Renews ${new Date(billingInfo.subscription.currentPeriodEnd).toLocaleDateString()}`
                            : 'No active subscription'}
                    </p>

                    <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Zap className="w-4 h-4 text-primary-600" />
                        <span>AI Tier: <span className="font-medium text-slate-900">{billingInfo?.aiTier || 'FREE'}</span></span>
                    </div>

                    {!billingInfo?.subscription && (
                        <Link to="/pricing" className="block mt-4">
                            <Button variant="outline" className="w-full">
                                Upgrade Plan
                                <ArrowUpRight className="w-4 h-4 ml-2" />
                            </Button>
                        </Link>
                    )}
                </Card>

                {/* Usage */}
                <Card>
                    <div className="flex items-start justify-between mb-4">
                        <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                            <BarChart3 className="w-6 h-6 text-green-600" />
                        </div>
                    </div>

                    <h3 className="text-lg font-semibold text-slate-900 mb-4">AI Usage</h3>

                    {/* Daily Usage */}
                    <div className="mb-4">
                        <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-slate-600">Daily</span>
                            <span className="font-medium text-slate-900">
                                {billingInfo?.aiDailyUsage || 0} / {billingInfo?.aiDailyLimit || 50}
                            </span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${getUsagePercentage(billingInfo?.aiDailyUsage || 0, billingInfo?.aiDailyLimit || 50)}%` }}
                                transition={{ duration: 0.5 }}
                                className={`h-full rounded-full ${getUsageColor(getUsagePercentage(billingInfo?.aiDailyUsage || 0, billingInfo?.aiDailyLimit || 50))}`}
                            />
                        </div>
                    </div>

                    {/* Monthly Usage */}
                    <div>
                        <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-slate-600">Monthly</span>
                            <span className="font-medium text-slate-900">
                                {billingInfo?.aiMonthlyUsage || 0} / {billingInfo?.aiMonthlyLimit || 1000}
                            </span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${getUsagePercentage(billingInfo?.aiMonthlyUsage || 0, billingInfo?.aiMonthlyLimit || 1000)}%` }}
                                transition={{ duration: 0.5, delay: 0.1 }}
                                className={`h-full rounded-full ${getUsageColor(getUsagePercentage(billingInfo?.aiMonthlyUsage || 0, billingInfo?.aiMonthlyLimit || 1000))}`}
                            />
                        </div>
                    </div>

                    <p className="text-xs text-slate-500 mt-4">
                        Usage resets daily at midnight UTC
                    </p>
                </Card>
            </div>

            {/* Upgrade CTA for free users */}
            {!billingInfo?.subscription && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-xl p-6 text-white"
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-semibold mb-1">Upgrade to Pro</h3>
                            <p className="text-primary-100 text-sm">
                                Get 2,000 AI responses/day and access to advanced models
                            </p>
                        </div>
                        <Link to="/pricing">
                            <Button variant="secondary">
                                View Plans
                            </Button>
                        </Link>
                    </div>
                </motion.div>
            )}

            {/* Manual Payment History - simple inline component */}
            <PaymentHistory />
        </div>
    );
}

// Inline Payment History Component
function PaymentHistory() {
    const [payments, setPayments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadPayments();
    }, []);

    const loadPayments = async () => {
        try {
            const { manualPaymentApi } = await import('../lib/api');
            const response = await manualPaymentApi.getMyPayments();
            setPayments(response.data || []);
        } catch (err) {
            // Silently fail - not critical
            console.error('Failed to load payment history:', err);
        } finally {
            setLoading(false);
        }
    };

    if (loading || payments.length === 0) return null;

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'APPROVED':
                return <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-1 rounded-full">Approved</span>;
            case 'REJECTED':
                return <span className="text-xs font-medium text-red-700 bg-red-100 px-2 py-1 rounded-full">Rejected</span>;
            default:
                return <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-1 rounded-full">Pending Review</span>;
        }
    };

    return (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Manual Payment History</h3>
            <div className="space-y-3">
                {payments.slice(0, 5).map((p) => (
                    <div key={p.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                        <div>
                            <p className="text-sm font-medium text-slate-700">{p.planName}</p>
                            <p className="text-xs text-slate-500">
                                {p.method} • {new Date(p.createdAt).toLocaleDateString()}
                            </p>
                        </div>
                        <div className="text-right">
                            {getStatusBadge(p.status)}
                            {p.rejectionReason && (
                                <p className="text-xs text-red-600 mt-1">{p.rejectionReason}</p>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
