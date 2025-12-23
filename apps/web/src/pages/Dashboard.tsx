import { motion } from 'framer-motion';
import { Card, CardHeader, CardStat } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { SkeletonCard } from '../components/ui/Skeleton';
import { MessageCircle, ShoppingCart, TrendingUp, Users, Wifi, WifiOff, Loader2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useServices } from '../hooks/useServices';
import { useOrders } from '../hooks/useOrders';
import { useWhatsAppStatus, useStartSession } from '../hooks/useWhatsApp';
import { useAuth } from '../contexts/AuthContext';

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1
        }
    }
};

const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
};

export function Dashboard() {
    const navigate = useNavigate();
    const { user } = useAuth();

    // Fetch real data
    const { data: services, isLoading: loadingServices } = useServices();
    const { data: orders, isLoading: loadingOrders } = useOrders();
    const { data: whatsappStatus, isLoading: loadingWhatsApp } = useWhatsAppStatus();
    const startSession = useStartSession();

    // Calculate stats
    const totalOrders = orders?.length || 0;
    const activeServices = services?.filter(s => s.isActive).length || 0;
    const pendingOrders = orders?.filter(o => o.status === 'PENDING_APPROVAL').length || 0;

    // Calculate total messages processed (sum of orders as proxy)
    const messagesProcessed = totalOrders * 3; // rough estimate: 3 messages per order

    const isConnected = whatsappStatus?.status === 'CONNECTED';
    const hasQR = whatsappStatus?.status === 'QR_READY' && whatsappStatus?.qr;

    const handleStartSession = () => {
        startSession.mutate();
    };

    const isLoading = loadingServices || loadingOrders;

    return (
        <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="space-y-6"
        >
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">Dashboard</h2>
                    <p className="text-slate-500">Overview of your business automation.</p>
                </div>
                {user?.role !== 'STAFF' && (
                    <Link to="/onboarding">
                        <Button>New Tenant Setup</Button>
                    </Link>
                )}
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {isLoading ? (
                    <>
                        <SkeletonCard />
                        <SkeletonCard />
                        <SkeletonCard />
                        <SkeletonCard />
                    </>
                ) : (
                    <>
                        <motion.div variants={item}>
                            <Card>
                                <CardStat
                                    label="Total Orders"
                                    value={totalOrders.toLocaleString()}
                                    icon={ShoppingCart}
                                    trend={pendingOrders > 0 ? `${pendingOrders} pending` : undefined}
                                />
                            </Card>
                        </motion.div>
                        <motion.div variants={item}>
                            <Card>
                                <CardStat
                                    label="Active Services"
                                    value={activeServices.toLocaleString()}
                                    icon={TrendingUp}
                                />
                            </Card>
                        </motion.div>
                        <motion.div variants={item}>
                            <Card>
                                <CardStat
                                    label="Messages Processed"
                                    value={messagesProcessed > 1000 ? `${(messagesProcessed / 1000).toFixed(1)}k` : messagesProcessed.toString()}
                                    icon={MessageCircle}
                                />
                            </Card>
                        </motion.div>
                        <motion.div variants={item}>
                            <Card>
                                <CardStat
                                    label="Tenants"
                                    value="1"
                                    icon={Users}
                                />
                            </Card>
                        </motion.div>
                    </>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Recent Activity */}
                <motion.div variants={item} className="lg:col-span-2">
                    <Card className="h-full min-h-[400px]">
                        <CardHeader title="Recent Orders" description="Latest customer orders and their status." />
                        <div className="space-y-4">
                            {loadingOrders ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
                                </div>
                            ) : orders && orders.length > 0 ? (
                                orders.slice(0, 5).map((order) => (
                                    <div key={order.id} className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-lg transition-colors border border-transparent hover:border-slate-100">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-2 h-2 rounded-full ${order.status === 'APPROVED' ? 'bg-green-500' :
                                                    order.status === 'PENDING_APPROVAL' ? 'bg-orange-500' :
                                                        order.status === 'REJECTED' ? 'bg-red-500' :
                                                            'bg-primary-500'
                                                }`} />
                                            <div>
                                                <p className="font-medium text-slate-800">
                                                    Order #{order.id.slice(0, 8)}
                                                </p>
                                                <p className="text-xs text-slate-500">
                                                    {order.items.length} item(s) • {new Date(order.createdAt).toLocaleString()}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-sm font-medium text-slate-600">
                                                ${parseFloat(order.totalAmount).toFixed(2)}
                                            </span>
                                            <p className={`text-xs font-medium ${order.status === 'APPROVED' ? 'text-green-600' :
                                                    order.status === 'PENDING_APPROVAL' ? 'text-orange-600' :
                                                        order.status === 'REJECTED' ? 'text-red-600' :
                                                            'text-slate-500'
                                                }`}>
                                                {order.status.replace('_', ' ')}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-8 text-slate-500">
                                    <ShoppingCart className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                                    <p>No orders yet</p>
                                    <p className="text-sm">Orders will appear here when customers make requests via WhatsApp</p>
                                </div>
                            )}
                        </div>
                        {orders && orders.length > 5 && (
                            <div className="mt-4 text-center">
                                <Button variant="outline" size="sm" onClick={() => navigate('/orders')}>
                                    View All Orders
                                </Button>
                            </div>
                        )}
                    </Card>
                </motion.div>

                {/* WhatsApp Status */}
                <motion.div variants={item}>
                    <Card className="h-full bg-gradient-to-br from-primary-600 to-primary-800 text-white border-none shadow-xl shadow-primary-900/20">
                        <div className="flex flex-col h-full justify-between">
                            <div>
                                <h3 className="text-lg font-bold">WhatsApp Status</h3>
                                <p className="text-primary-100 text-sm mt-1">Connection health check</p>
                            </div>

                            <div className="py-8 text-center">
                                {loadingWhatsApp ? (
                                    <Loader2 className="w-12 h-12 mx-auto animate-spin text-white/60" />
                                ) : hasQR ? (
                                    <div className="space-y-4">
                                        <div className="bg-white p-3 rounded-lg inline-block">
                                            <img
                                                src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(whatsappStatus.qr!)}`}
                                                alt="WhatsApp QR Code"
                                                className="w-36 h-36"
                                            />
                                        </div>
                                        <p className="text-sm text-primary-100">Scan with WhatsApp</p>
                                    </div>
                                ) : (
                                    <>
                                        <div className={`w-20 h-20 ${isConnected ? 'bg-green-500/20' : 'bg-white/20'} rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm`}>
                                            {isConnected ? (
                                                <Wifi className="w-10 h-10 text-white" />
                                            ) : (
                                                <WifiOff className="w-10 h-10 text-white/60" />
                                            )}
                                        </div>
                                        <p className="text-2xl font-bold">
                                            {isConnected ? 'Connected' : 'Disconnected'}
                                        </p>
                                        <p className="text-primary-200">
                                            {whatsappStatus?.status || 'Unknown'}
                                        </p>
                                    </>
                                )}
                            </div>

                            {!isConnected && !hasQR && (
                                <Button
                                    variant="secondary"
                                    className="w-full bg-white/10 border-white/20 text-white hover:bg-white/20"
                                    onClick={handleStartSession}
                                    isLoading={startSession.isPending}
                                >
                                    Connect WhatsApp
                                </Button>
                            )}
                            {isConnected && (
                                <Button
                                    variant="secondary"
                                    className="w-full bg-white/10 border-white/20 text-white hover:bg-white/20"
                                    onClick={() => navigate('/onboarding')}
                                >
                                    Manage Connection
                                </Button>
                            )}
                        </div>
                    </Card>
                </motion.div>
            </div>
        </motion.div>
    );
}
