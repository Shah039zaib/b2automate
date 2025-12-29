import { motion } from 'framer-motion';
import { useState } from 'react';
import { Card, CardHeader, CardStat } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { SkeletonCard } from '../components/ui/Skeleton';
import { MessageCircle, ShoppingCart, TrendingUp, Wifi, WifiOff, Loader2, Copy, Check, Phone, Smartphone } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Link, useNavigate } from 'react-router-dom';
import { useServices } from '../hooks/useServices';
import { useOrders } from '../hooks/useOrders';
import { useWhatsAppStatus, useStartSession, useRequestPairingCode, useQRExpiration, usePairingCodeExpiration } from '../hooks/useWhatsApp';
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
    const [phoneNumber, setPhoneNumber] = useState('');
    const [copied, setCopied] = useState(false);
    const [usePairingMode, setUsePairingMode] = useState(true); // Default to pairing mode

    // Fetch real data
    const { data: services, isLoading: loadingServices } = useServices();
    const { data: orders, isLoading: loadingOrders } = useOrders();
    const { data: whatsappStatus, isLoading: loadingWhatsApp } = useWhatsAppStatus();
    const startSession = useStartSession();
    const requestPairingCode = useRequestPairingCode();

    // Track QR and pairing code expiration
    const qrExpiration = useQRExpiration(whatsappStatus?.qr);
    const pairingExpiration = usePairingCodeExpiration(whatsappStatus?.pairingCode);

    // Auto-refresh QR when expired
    const handleRefreshQR = () => {
        startSession.mutate();
    };

    // Calculate stats
    const totalOrders = orders?.length || 0;
    const activeServices = services?.filter(s => s.isActive).length || 0;
    const pendingOrders = orders?.filter(o => o.status === 'PENDING_APPROVAL').length || 0;

    // Calculate total messages processed (sum of orders as proxy)
    const messagesProcessed = totalOrders * 3; // rough estimate: 3 messages per order

    const isConnected = whatsappStatus?.status === 'CONNECTED';
    const hasQR = whatsappStatus?.status === 'QR_READY' && whatsappStatus?.qr;
    const hasPairingCode = whatsappStatus?.status === 'PAIRING_CODE_READY' && whatsappStatus?.pairingCode;
    const isRequesting = whatsappStatus?.status === 'REQUESTING_PAIRING_CODE' || requestPairingCode.isPending;

    const handleStartSession = () => {
        startSession.mutate();
    };

    const handleRequestPairingCode = () => {
        if (phoneNumber.trim()) {
            requestPairingCode.mutate(phoneNumber.trim());
        }
    };

    const handleCopyCode = () => {
        if (whatsappStatus?.pairingCode) {
            navigator.clipboard.writeText(whatsappStatus.pairingCode);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
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

                            <div className="py-6 text-center">
                                {loadingWhatsApp ? (
                                    <Loader2 className="w-12 h-12 mx-auto animate-spin text-white/60" />
                                ) : hasPairingCode ? (
                                    /* Pairing Code Display */
                                    <div className="space-y-4">
                                        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                                            <p className="text-xs text-primary-200 mb-2">Your Pairing Code</p>
                                            <div className="flex items-center justify-center gap-2">
                                                <span className={`text-3xl font-mono font-bold tracking-widest ${pairingExpiration.isExpired ? 'text-red-300 line-through' : ''}`}>
                                                    {whatsappStatus?.pairingCode}
                                                </span>
                                                {!pairingExpiration.isExpired && (
                                                    <button
                                                        onClick={handleCopyCode}
                                                        className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                                                    >
                                                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        {pairingExpiration.isExpired ? (
                                            <div className="bg-red-500/20 rounded-lg p-3">
                                                <p className="text-sm font-medium text-red-200">Code Expired</p>
                                                <Button
                                                    onClick={() => requestPairingCode.mutate(phoneNumber)}
                                                    className="mt-2 w-full bg-white/20 hover:bg-white/30"
                                                    size="sm"
                                                >
                                                    Generate New Code
                                                </Button>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="text-left text-xs space-y-2 bg-white/5 rounded-lg p-3">
                                                    <p className="font-medium text-primary-100">How to connect:</p>
                                                    <ol className="list-decimal list-inside space-y-1 text-primary-200">
                                                        <li>Open WhatsApp on your phone</li>
                                                        <li>Go to Settings → Linked Devices</li>
                                                        <li>Tap "Link a Device"</li>
                                                        <li>Select "Link with phone number instead"</li>
                                                        <li>Enter the 8-digit code above</li>
                                                    </ol>
                                                </div>
                                                <div className={`flex items-center justify-center gap-2 ${pairingExpiration.shouldRefresh ? 'text-yellow-300' : 'text-primary-200'}`}>
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                    <p className="text-xs font-medium">
                                                        {pairingExpiration.timeRemaining !== null && (
                                                            `Expires in ${Math.floor(pairingExpiration.timeRemaining / 60)}:${String(pairingExpiration.timeRemaining % 60).padStart(2, '0')}`
                                                        )}
                                                    </p>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ) : hasQR ? (
                                    /* QR Code Display */
                                    <div className="space-y-4">
                                        {qrExpiration.isExpired ? (
                                            <div className="bg-red-500/20 rounded-lg p-4">
                                                <p className="text-sm font-medium text-red-200 mb-3">QR Code Expired</p>
                                                <Button
                                                    onClick={handleRefreshQR}
                                                    className="w-full bg-white/20 hover:bg-white/30"
                                                    size="sm"
                                                >
                                                    Generate New QR Code
                                                </Button>
                                            </div>
                                        ) : (
                                            <>
                                                <div className={`bg-white p-3 rounded-lg inline-block ${qrExpiration.shouldRefresh ? 'ring-2 ring-yellow-400 ring-opacity-50' : ''}`}>
                                                    <QRCodeSVG
                                                        value={whatsappStatus.qr!}
                                                        size={144}
                                                        level="M"
                                                        includeMargin={false}
                                                    />
                                                </div>
                                                <p className="text-sm text-primary-100">Scan with WhatsApp</p>
                                                <div className={`flex items-center justify-center gap-2 ${qrExpiration.shouldRefresh ? 'text-yellow-300' : 'text-primary-200'}`}>
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                    <p className="text-xs font-medium">
                                                        {qrExpiration.timeRemaining !== null ? (
                                                            qrExpiration.shouldRefresh ? (
                                                                `Expires in ${qrExpiration.timeRemaining}s - Scan now!`
                                                            ) : (
                                                                `Expires in ${qrExpiration.timeRemaining}s`
                                                            )
                                                        ) : (
                                                            'QR expires in 60 seconds'
                                                        )}
                                                    </p>
                                                </div>
                                                {qrExpiration.shouldRefresh && (
                                                    <Button
                                                        onClick={handleRefreshQR}
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-white hover:bg-white/10"
                                                    >
                                                        Refresh QR Now
                                                    </Button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                ) : isRequesting ? (
                                    /* Loading State */
                                    <div className="space-y-4">
                                        <Loader2 className="w-12 h-12 mx-auto animate-spin text-white/60" />
                                        <p className="text-primary-200">Generating pairing code...</p>
                                    </div>
                                ) : isConnected ? (
                                    /* Connected State */
                                    <>
                                        <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
                                            <Wifi className="w-10 h-10 text-white" />
                                        </div>
                                        <p className="text-2xl font-bold">Connected</p>
                                        <p className="text-primary-200">{whatsappStatus?.status || 'Unknown'}</p>
                                    </>
                                ) : (
                                    /* Disconnected - Show Connection Options */
                                    <div className="space-y-4">
                                        <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto backdrop-blur-sm">
                                            <WifiOff className="w-8 h-8 text-white/60" />
                                        </div>
                                        <p className="text-lg font-semibold">Not Connected</p>

                                        {usePairingMode ? (
                                            /* Pairing Code Input */
                                            <div className="space-y-3">
                                                <div className="relative">
                                                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                                                    <input
                                                        type="tel"
                                                        placeholder="+92 300 1234567"
                                                        value={phoneNumber}
                                                        onChange={(e) => setPhoneNumber(e.target.value)}
                                                        className="w-full bg-white/10 border border-white/20 rounded-lg px-10 py-2.5 text-white placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-white/30"
                                                    />
                                                </div>
                                                <Button
                                                    variant="secondary"
                                                    className="w-full bg-white/10 border-white/20 text-white hover:bg-white/20"
                                                    onClick={handleRequestPairingCode}
                                                    isLoading={requestPairingCode.isPending}
                                                    disabled={!phoneNumber.trim()}
                                                >
                                                    <Smartphone className="w-4 h-4 mr-2" />
                                                    Get Pairing Code
                                                </Button>
                                                <button
                                                    onClick={() => setUsePairingMode(false)}
                                                    className="text-xs text-primary-200 hover:text-white underline"
                                                >
                                                    Use QR Code instead
                                                </button>
                                            </div>
                                        ) : (
                                            /* QR Mode Button */
                                            <div className="space-y-3">
                                                <Button
                                                    variant="secondary"
                                                    className="w-full bg-white/10 border-white/20 text-white hover:bg-white/20"
                                                    onClick={handleStartSession}
                                                    isLoading={startSession.isPending}
                                                >
                                                    Show QR Code
                                                </Button>
                                                <button
                                                    onClick={() => setUsePairingMode(true)}
                                                    className="text-xs text-primary-200 hover:text-white underline"
                                                >
                                                    Use Pairing Code instead (recommended)
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

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

