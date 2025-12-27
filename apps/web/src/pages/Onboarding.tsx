import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Check, ChevronRight, Upload, AlertCircle, Loader2, WifiOff, CheckCircle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useWhatsAppStatus, useStartSession } from '../hooks/useWhatsApp';
import { useCreateService } from '../hooks/useServices';

const STEPS = [
    { id: 1, label: 'Create Tenant' },
    { id: 2, label: 'Connect WhatsApp' },
    { id: 3, label: 'Import Services' },
];

export function Onboarding() {
    const navigate = useNavigate();
    const { register, isAuthenticated } = useAuth();

    const [step, setStep] = useState(isAuthenticated ? 2 : 1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Step 1 form
    const [tenantName, setTenantName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    // Step 3 CSV state
    const [csvServices, setCsvServices] = useState<{ name: string; description: string; price: number }[]>([]);
    const [importProgress, setImportProgress] = useState(0);

    // WhatsApp hooks - only enable when on step 2+
    const { data: whatsappStatus, isLoading: loadingStatus } = useWhatsAppStatus(step >= 2 && isAuthenticated);
    const startSession = useStartSession();
    const createService = useCreateService();

    const isConnected = whatsappStatus?.status === 'CONNECTED';
    const hasQR = whatsappStatus?.status === 'QR_READY' && whatsappStatus?.qr;

    // Auto-advance to step 3 when WhatsApp connects
    useEffect(() => {
        if (step === 2 && isConnected) {
            setTimeout(() => setStep(3), 1000);
        }
    }, [isConnected, step]);

    const handleCreateTenant = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!tenantName.trim() || !email.trim() || !password.trim()) {
            setError('All fields are required');
            return;
        }

        if (password.length < 8) {
            setError('Password must be at least 8 characters');
            return;
        }

        setLoading(true);
        try {
            await register({ tenantName, email, password });
            setStep(2);
            // Automatically start WhatsApp session
            startSession.mutate();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to create account. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleStartWhatsApp = () => {
        startSession.mutate();
    };

    const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            const lines = text.split('\n').filter(line => line.trim());

            // Skip header line
            const services = lines.slice(1).map(line => {
                const [name, description, price] = line.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
                return {
                    name: name || '',
                    description: description || '',
                    price: parseFloat(price) || 0
                };
            }).filter(s => s.name && s.price > 0);

            setCsvServices(services);
        };
        reader.readAsText(file);
    };

    const handleImportServices = async () => {
        if (csvServices.length === 0) return;

        setLoading(true);
        setImportProgress(0);

        try {
            for (let i = 0; i < csvServices.length; i++) {
                await createService.mutateAsync(csvServices[i]);
                setImportProgress(((i + 1) / csvServices.length) * 100);
            }
            // Success - go to dashboard
            navigate('/dashboard');
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to import some services');
        } finally {
            setLoading(false);
        }
    };

    const handleFinish = () => {
        navigate('/dashboard');
    };

    return (
        <div className="max-w-2xl mx-auto space-y-8 py-8">
            <div className="text-center">
                <h1 className="text-3xl font-bold text-slate-900">Zero-Touch Onboarding</h1>
                <p className="text-slate-500 mt-2">Get your business running on B2Automate in minutes.</p>
            </div>

            {/* Progress */}
            <div className="flex justify-between relative">
                <div className="absolute top-1/2 left-0 w-full h-1 bg-slate-200 -z-10 rounded-full" />
                <div
                    className="absolute top-1/2 left-0 h-1 bg-primary-600 -z-10 rounded-full transition-all duration-500"
                    style={{ width: `${((step - 1) / 2) * 100}%` }}
                />
                {STEPS.map((s) => (
                    <div key={s.id} className="flex flex-col items-center gap-2 bg-slate-50 px-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors ${step >= s.id ? 'bg-primary-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                            {step > s.id ? <Check className="w-4 h-4" /> : s.id}
                        </div>
                        <span className={`text-xs font-medium ${step >= s.id ? 'text-primary-700' : 'text-slate-400'}`}>{s.label}</span>
                    </div>
                ))}
            </div>

            <AnimatePresence mode="wait">
                <motion.div
                    key={step}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                >
                    {/* Step 1: Create Tenant */}
                    {step === 1 && (
                        <Card>
                            <h2 className="text-xl font-bold mb-4">Create Your Business Account</h2>
                            <form onSubmit={handleCreateTenant} className="space-y-4">
                                {error && (
                                    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                        <span>{error}</span>
                                    </div>
                                )}

                                <Input
                                    label="Business Name"
                                    placeholder="e.g. Acme Pizza"
                                    value={tenantName}
                                    onChange={(e) => setTenantName(e.target.value)}
                                    required
                                />
                                <Input
                                    label="Admin Email"
                                    type="email"
                                    placeholder="admin@acme.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                                <Input
                                    label="Password"
                                    type="password"
                                    placeholder="Minimum 8 characters"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                                <Button type="submit" className="w-full mt-4" isLoading={loading}>
                                    Create Account <ChevronRight className="w-4 h-4 ml-2" />
                                </Button>
                            </form>
                        </Card>
                    )}

                    {/* Step 2: Connect WhatsApp */}
                    {step === 2 && (
                        <Card>
                            <h2 className="text-xl font-bold mb-4">Connect WhatsApp</h2>
                            <div className="flex flex-col items-center p-8 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                                {loadingStatus ? (
                                    <Loader2 className="w-12 h-12 animate-spin text-primary-600" />
                                ) : isConnected ? (
                                    <motion.div
                                        initial={{ scale: 0.8, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        className="text-center"
                                    >
                                        <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <CheckCircle className="w-12 h-12 text-green-600" />
                                        </div>
                                        <p className="text-xl font-bold text-green-700">Connected!</p>
                                        <p className="text-slate-500 mt-2">Your WhatsApp is ready to receive messages.</p>
                                    </motion.div>
                                ) : hasQR ? (
                                    <motion.div
                                        initial={{ scale: 0.8, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        className="text-center"
                                    >
                                        <div className="bg-white p-4 rounded-xl shadow-sm mb-6 inline-block">
                                            <QRCodeSVG
                                                value={whatsappStatus.qr!}
                                                size={192}
                                                level="M"
                                                includeMargin={false}
                                            />
                                        </div>
                                        <p className="text-center text-slate-600 max-w-sm">
                                            Open WhatsApp on your phone, go to <strong>Linked Devices</strong>, and scan this code.
                                        </p>
                                        <div className="flex items-center justify-center gap-2 mt-4 text-sm text-slate-500">
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Waiting for scan...
                                        </div>
                                    </motion.div>
                                ) : (
                                    <div className="text-center">
                                        <div className="w-24 h-24 bg-slate-200 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <WifiOff className="w-12 h-12 text-slate-400" />
                                        </div>
                                        <p className="text-slate-600 mb-4">WhatsApp is not connected.</p>
                                        <Button onClick={handleStartWhatsApp} isLoading={startSession.isPending}>
                                            Generate QR Code
                                        </Button>
                                    </div>
                                )}
                            </div>

                            {isConnected && (
                                <div className="mt-6 flex justify-end">
                                    <Button onClick={() => setStep(3)}>
                                        Continue <ChevronRight className="w-4 h-4 ml-2" />
                                    </Button>
                                </div>
                            )}
                        </Card>
                    )}

                    {/* Step 3: Import Services */}
                    {step === 3 && (
                        <Card>
                            <h2 className="text-xl font-bold mb-4">Import Services</h2>

                            {error && (
                                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                    <span>{error}</span>
                                </div>
                            )}

                            {csvServices.length === 0 ? (
                                <label className="border-2 border-dashed border-slate-300 rounded-xl p-10 text-center hover:bg-slate-50 transition-colors cursor-pointer block">
                                    <input
                                        type="file"
                                        accept=".csv"
                                        className="hidden"
                                        onChange={handleCsvUpload}
                                    />
                                    <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                                    <p className="font-medium text-slate-700">Click to upload CSV</p>
                                    <p className="text-sm text-slate-500 mt-1">Format: name, description, price</p>
                                </label>
                            ) : (
                                <div className="space-y-4">
                                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                        <p className="text-green-700 font-medium">
                                            <Check className="w-4 h-4 inline mr-2" />
                                            {csvServices.length} services ready to import
                                        </p>
                                    </div>

                                    <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y">
                                        {csvServices.slice(0, 5).map((s, i) => (
                                            <div key={i} className="p-3 flex justify-between text-sm">
                                                <span className="text-slate-700">{s.name}</span>
                                                <span className="font-medium text-slate-600">${s.price.toFixed(2)}</span>
                                            </div>
                                        ))}
                                        {csvServices.length > 5 && (
                                            <div className="p-3 text-sm text-slate-500 text-center">
                                                +{csvServices.length - 5} more services
                                            </div>
                                        )}
                                    </div>

                                    {loading && (
                                        <div className="space-y-2">
                                            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-primary-600 transition-all duration-300"
                                                    style={{ width: `${importProgress}%` }}
                                                />
                                            </div>
                                            <p className="text-sm text-slate-500 text-center">
                                                Importing... {Math.round(importProgress)}%
                                            </p>
                                        </div>
                                    )}

                                    <Button
                                        className="w-full"
                                        onClick={handleImportServices}
                                        isLoading={loading}
                                    >
                                        Import All Services
                                    </Button>
                                </div>
                            )}

                            <div className="mt-8 flex justify-between">
                                <Button variant="outline" onClick={handleFinish}>
                                    Skip for now
                                </Button>
                                {csvServices.length === 0 && (
                                    <Button onClick={handleFinish}>
                                        Finish Setup
                                    </Button>
                                )}
                            </div>
                        </Card>
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
