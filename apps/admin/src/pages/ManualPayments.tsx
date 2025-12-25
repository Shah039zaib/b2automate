/**
 * Manual Payments Admin Page
 * 
 * Super Admin can view, approve, or reject pending payments
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { manualPaymentsApi, ManualPayment } from '../lib/api';
import {
    CreditCard,
    Check,
    X,
    AlertCircle,
    ExternalLink,
    Phone,
    Building2,
    Clock,
    CheckCircle,
    XCircle
} from 'lucide-react';

type StatusFilter = 'all' | 'PENDING' | 'APPROVED' | 'REJECTED';

const METHOD_ICONS: Record<string, typeof Phone> = {
    EASYPAISA: Phone,
    JAZZCASH: Phone,
    BANK_TRANSFER: Building2
};

const METHOD_COLORS: Record<string, string> = {
    EASYPAISA: 'bg-green-500',
    JAZZCASH: 'bg-red-500',
    BANK_TRANSFER: 'bg-blue-500'
};

const STATUS_BADGES: Record<string, { bg: string; text: string; icon: typeof Clock }> = {
    PENDING: { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: Clock },
    APPROVED: { bg: 'bg-green-100', text: 'text-green-800', icon: CheckCircle },
    REJECTED: { bg: 'bg-red-100', text: 'text-red-800', icon: XCircle }
};

export function ManualPayments() {
    const [payments, setPayments] = useState<ManualPayment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<StatusFilter>('PENDING');
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [confirmAction, setConfirmAction] = useState<{
        id: string;
        action: 'approve' | 'reject';
    } | null>(null);
    const [rejectNote, setRejectNote] = useState('');

    useEffect(() => {
        loadPayments();
    }, [filter]);

    const loadPayments = async () => {
        try {
            setIsLoading(true);
            setError(null);
            const status = filter === 'all' ? undefined : filter;
            const response = await manualPaymentsApi.list(status);
            setPayments(response.data.payments);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to load payments');
        } finally {
            setIsLoading(false);
        }
    };

    const handleApprove = async (id: string) => {
        try {
            setActionLoading(id);
            await manualPaymentsApi.approve(id);
            setConfirmAction(null);
            loadPayments();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to approve payment');
        } finally {
            setActionLoading(null);
        }
    };

    const handleReject = async (id: string) => {
        try {
            setActionLoading(id);
            await manualPaymentsApi.reject(id, rejectNote);
            setConfirmAction(null);
            setRejectNote('');
            loadPayments();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to reject payment');
        } finally {
            setActionLoading(null);
        }
    };

    const formatPrice = (cents: number) => {
        return `$${(cents / 100).toFixed(2)}`;
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                        <CreditCard className="w-5 h-5 text-primary-600" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold text-slate-900">Manual Payments</h1>
                        <p className="text-slate-500 text-sm">EasyPaisa, JazzCash & Bank Transfer</p>
                    </div>
                </div>
            </div>

            {/* Filter Tabs */}
            <Card className="p-2">
                <div className="flex gap-2">
                    {(['PENDING', 'APPROVED', 'REJECTED', 'all'] as StatusFilter[]).map((status) => (
                        <button
                            key={status}
                            onClick={() => setFilter(status)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === status
                                    ? 'bg-primary-600 text-white'
                                    : 'text-slate-600 hover:bg-slate-100'
                                }`}
                        >
                            {status === 'all' ? 'All' : status.charAt(0) + status.slice(1).toLowerCase()}
                        </button>
                    ))}
                </div>
            </Card>

            {error && (
                <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                    <AlertCircle className="w-5 h-5" />
                    <span>{error}</span>
                </div>
            )}

            {/* Loading State */}
            {isLoading && (
                <Card className="p-8 text-center">
                    <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full mx-auto mb-4" />
                    <p className="text-slate-500">Loading payments...</p>
                </Card>
            )}

            {/* Empty State */}
            {!isLoading && payments.length === 0 && (
                <Card className="p-8 text-center">
                    <CreditCard className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500">No {filter !== 'all' ? filter.toLowerCase() : ''} payments found</p>
                </Card>
            )}

            {/* Payments Table */}
            {!isLoading && payments.length > 0 && (
                <Card className="overflow-hidden">
                    <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Tenant</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Plan</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Method</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Amount</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Screenshot</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Date</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-200">
                            {payments.map((payment) => {
                                const MethodIcon = METHOD_ICONS[payment.method];
                                const methodColor = METHOD_COLORS[payment.method];
                                const statusBadge = STATUS_BADGES[payment.status];
                                const StatusIcon = statusBadge.icon;

                                return (
                                    <motion.tr
                                        key={payment.id}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="hover:bg-slate-50"
                                    >
                                        <td className="px-4 py-3">
                                            <p className="font-medium text-slate-900">{payment.tenant.name}</p>
                                            <p className="text-xs text-slate-500">{payment.senderName}</p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="text-slate-900">{payment.plan.name}</p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-6 h-6 ${methodColor} rounded-full flex items-center justify-center`}>
                                                    <MethodIcon className="w-3 h-3 text-white" />
                                                </div>
                                                <span className="text-sm text-slate-600">{payment.method.replace('_', ' ')}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="font-medium text-slate-900">{formatPrice(payment.finalPrice)}</p>
                                            {payment.couponCode && (
                                                <p className="text-xs text-green-600">-{formatPrice(payment.originalPrice - payment.finalPrice)}</p>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusBadge.bg} ${statusBadge.text}`}>
                                                <StatusIcon className="w-3 h-3" />
                                                {payment.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <a
                                                href={payment.screenshotUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-800 text-sm"
                                            >
                                                View <ExternalLink className="w-3 h-3" />
                                            </a>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-500">
                                            {formatDate(payment.createdAt)}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            {payment.status === 'PENDING' && (
                                                <div className="flex items-center justify-end gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant="primary"
                                                        onClick={() => setConfirmAction({ id: payment.id, action: 'approve' })}
                                                        disabled={actionLoading === payment.id}
                                                    >
                                                        <Check className="w-3 h-3 mr-1" />
                                                        Approve
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="secondary"
                                                        onClick={() => setConfirmAction({ id: payment.id, action: 'reject' })}
                                                        disabled={actionLoading === payment.id}
                                                    >
                                                        <X className="w-3 h-3 mr-1" />
                                                        Reject
                                                    </Button>
                                                </div>
                                            )}
                                            {payment.status !== 'PENDING' && payment.reviewerNote && (
                                                <p className="text-xs text-slate-500 italic">"{payment.reviewerNote}"</p>
                                            )}
                                        </td>
                                    </motion.tr>
                                );
                            })}
                        </tbody>
                    </table>
                </Card>
            )}

            {/* Confirmation Modal */}
            <AnimatePresence>
                {confirmAction && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
                        onClick={() => setConfirmAction(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h3 className="text-lg font-semibold text-slate-900 mb-4">
                                {confirmAction.action === 'approve' ? 'Approve Payment?' : 'Reject Payment?'}
                            </h3>
                            <p className="text-slate-600 mb-4">
                                {confirmAction.action === 'approve'
                                    ? 'This will activate the subscription for this tenant.'
                                    : 'This will reject the payment. The tenant will need to resubmit.'}
                            </p>

                            {confirmAction.action === 'reject' && (
                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        Rejection Reason (optional)
                                    </label>
                                    <textarea
                                        value={rejectNote}
                                        onChange={(e) => setRejectNote(e.target.value)}
                                        placeholder="e.g., Screenshot unclear, wrong amount..."
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                                        rows={2}
                                    />
                                </div>
                            )}

                            <div className="flex gap-3 justify-end">
                                <Button
                                    variant="secondary"
                                    onClick={() => {
                                        setConfirmAction(null);
                                        setRejectNote('');
                                    }}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    variant={confirmAction.action === 'approve' ? 'primary' : 'primary'}
                                    onClick={() => {
                                        if (confirmAction.action === 'approve') {
                                            handleApprove(confirmAction.id);
                                        } else {
                                            handleReject(confirmAction.id);
                                        }
                                    }}
                                    isLoading={actionLoading === confirmAction.id}
                                >
                                    {confirmAction.action === 'approve' ? 'Approve' : 'Reject'}
                                </Button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
