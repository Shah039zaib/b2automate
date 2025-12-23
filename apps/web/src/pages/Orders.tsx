import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { SkeletonTable } from '../components/ui/Skeleton';
import { Eye, ShoppingCart, Check, X, AlertCircle, Loader2 } from 'lucide-react';
import { useOrders, useApproveOrder, useRejectOrder, OrderStatus } from '../hooks/useOrders';
import { useAuth } from '../contexts/AuthContext';

const STATUS_TABS: { label: string; value: OrderStatus | undefined }[] = [
    { label: 'All', value: undefined },
    { label: 'Pending', value: 'PENDING_APPROVAL' },
    { label: 'Approved', value: 'APPROVED' },
    { label: 'Rejected', value: 'REJECTED' },
];

export function Orders() {
    const [activeStatus, setActiveStatus] = useState<OrderStatus | undefined>(undefined);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

    const { user } = useAuth();
    const { data: orders, isLoading, isError } = useOrders(activeStatus);
    const approveOrder = useApproveOrder();
    const rejectOrder = useRejectOrder();

    // Role check: only TENANT_ADMIN and SUPER_ADMIN can approve/reject
    const canApprove = user?.role === 'TENANT_ADMIN' || user?.role === 'SUPER_ADMIN';

    const showSuccess = (message: string) => {
        setSuccessMessage(message);
        setTimeout(() => setSuccessMessage(null), 3000);
    };

    const handleApprove = async (orderId: string) => {
        setError(null);
        try {
            await approveOrder.mutateAsync(orderId);
            showSuccess('Order approved successfully');
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to approve order');
        }
    };

    const handleReject = async (orderId: string) => {
        setError(null);
        try {
            await rejectOrder.mutateAsync(orderId);
            showSuccess('Order rejected');
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to reject order');
        }
    };

    const isProcessing = approveOrder.isPending || rejectOrder.isPending;

    const getStatusColor = (status: OrderStatus) => {
        switch (status) {
            case 'APPROVED':
            case 'COMPLETED':
                return 'bg-green-100 text-green-700';
            case 'PENDING_APPROVAL':
            case 'DRAFT':
                return 'bg-orange-100 text-orange-700';
            case 'REJECTED':
            case 'CANCELLED':
                return 'bg-red-100 text-red-700';
            default:
                return 'bg-slate-100 text-slate-700';
        }
    };

    return (
        <div className="space-y-6">
            {/* Success Toast */}
            <AnimatePresence>
                {successMessage && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg"
                    >
                        <Check className="w-5 h-5" />
                        <span>{successMessage}</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Error Toast */}
            <AnimatePresence>
                {error && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg"
                    >
                        <AlertCircle className="w-5 h-5" />
                        <span>{error}</span>
                        <button onClick={() => setError(null)} className="ml-2">
                            <X className="w-4 h-4" />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-slate-900">Order Management</h2>
                <div className="flex bg-white rounded-lg p-1 border border-slate-200">
                    {STATUS_TABS.map((tab) => (
                        <button
                            key={tab.label}
                            onClick={() => setActiveStatus(tab.value)}
                            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${activeStatus === tab.value
                                    ? 'bg-primary-100 text-primary-700'
                                    : 'text-slate-500 hover:text-slate-700'
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {isLoading ? (
                <SkeletonTable rows={3} />
            ) : isError ? (
                <Card className="p-8 text-center">
                    <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-400" />
                    <p className="text-slate-600">Failed to load orders. Please try again.</p>
                </Card>
            ) : orders && orders.length > 0 ? (
                <div className="grid gap-4">
                    {orders.map((order, i) => (
                        <motion.div
                            key={order.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                        >
                            <Card className="flex items-center justify-between p-4 hover:shadow-md transition-shadow">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-primary-50 rounded-lg flex items-center justify-center font-bold text-primary-600">
                                        #{order.id.slice(0, 4)}
                                    </div>
                                    <div>
                                        <p className="font-semibold text-slate-900">
                                            {order.items.map(item => item.service.name).join(', ') || 'Order'}
                                        </p>
                                        <p className="text-sm text-slate-500">
                                            {order.customerJid} • {new Date(order.createdAt).toLocaleString()}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-6">
                                    <div className="text-right">
                                        <p className="font-bold text-slate-900">
                                            ${parseFloat(order.totalAmount).toFixed(2)}
                                        </p>
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${getStatusColor(order.status)}`}>
                                            {order.status.replace('_', ' ')}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => setSelectedOrderId(order.id === selectedOrderId ? null : order.id)}
                                        >
                                            <Eye className="w-4 h-4" />
                                        </Button>

                                        {/* Only show approve/reject for admins and only for pending orders */}
                                        {canApprove && order.status === 'PENDING_APPROVAL' && (
                                            <>
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    className="text-red-600 hover:bg-red-50 border-red-200"
                                                    onClick={() => handleReject(order.id)}
                                                    disabled={isProcessing}
                                                >
                                                    {rejectOrder.isPending && rejectOrder.variables === order.id ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        'Reject'
                                                    )}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    className="bg-green-600 hover:bg-green-700"
                                                    onClick={() => handleApprove(order.id)}
                                                    disabled={isProcessing}
                                                >
                                                    {approveOrder.isPending && approveOrder.variables === order.id ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        'Approve'
                                                    )}
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </Card>

                            {/* Order Details Expandable */}
                            <AnimatePresence>
                                {selectedOrderId === order.id && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="overflow-hidden"
                                    >
                                        <div className="bg-slate-50 rounded-b-xl border border-t-0 border-slate-200 p-4 -mt-2">
                                            <h4 className="font-semibold text-slate-700 mb-2">Order Items</h4>
                                            <div className="space-y-2">
                                                {order.items.map((item) => (
                                                    <div key={item.id} className="flex justify-between text-sm">
                                                        <span className="text-slate-600">
                                                            {item.service.name} x {item.quantity}
                                                        </span>
                                                        <span className="font-medium text-slate-800">
                                                            ${(parseFloat(item.price) * item.quantity).toFixed(2)}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="border-t border-slate-200 mt-3 pt-3 flex justify-between">
                                                <span className="font-semibold text-slate-700">Total</span>
                                                <span className="font-bold text-slate-900">
                                                    ${parseFloat(order.totalAmount).toFixed(2)}
                                                </span>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    ))}
                </div>
            ) : (
                <Card>
                    <EmptyState
                        icon={ShoppingCart}
                        title="No orders found"
                        description={
                            activeStatus
                                ? `No ${activeStatus.replace('_', ' ').toLowerCase()} orders at the moment.`
                                : "Orders will appear here when customers make requests via WhatsApp."
                        }
                    />
                </Card>
            )}
        </div>
    );
}
