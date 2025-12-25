import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Clock, Bot, Building2, Save, Check, AlertCircle, Loader2 } from 'lucide-react';
import api from '../lib/api';

interface TenantSettings {
    id: string;
    name: string;
    businessPhone: string | null;
    businessAddress: string | null;
    businessDescription: string | null;
    isAiEnabled: boolean;
    isWhatsappEnabled: boolean;
}

interface WorkingHour {
    dayOfWeek: number;
    openTime: string;
    closeTime: string;
    isClosed: boolean;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function Settings() {
    const [activeTab, setActiveTab] = useState<'profile' | 'hours' | 'ai'>('profile');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Profile state
    const [_settings, setSettings] = useState<TenantSettings | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        businessPhone: '',
        businessAddress: '',
        businessDescription: ''
    });

    // Working hours state
    const [workingHours, setWorkingHours] = useState<WorkingHour[]>([]);

    // AI state
    const [isAiEnabled, setIsAiEnabled] = useState(true);

    useEffect(() => {
        loadSettings();
        loadWorkingHours();
    }, []);

    const loadSettings = async () => {
        try {
            const res = await api.get<TenantSettings>('/tenant/settings');
            setSettings(res.data);
            setFormData({
                name: res.data.name || '',
                businessPhone: res.data.businessPhone || '',
                businessAddress: res.data.businessAddress || '',
                businessDescription: res.data.businessDescription || ''
            });
            setIsAiEnabled(res.data.isAiEnabled);
        } catch (err) {
            setError('Failed to load settings');
        } finally {
            setLoading(false);
        }
    };

    const loadWorkingHours = async () => {
        try {
            const res = await api.get<WorkingHour[]>('/tenant/working-hours');
            setWorkingHours(res.data);
        } catch (err) {
            // Use defaults
            setWorkingHours(DAYS.map((_, i) => ({
                dayOfWeek: i,
                openTime: '09:00',
                closeTime: '18:00',
                isClosed: i === 0 || i === 6
            })));
        }
    };

    const showSuccess = (msg: string) => {
        setSuccess(msg);
        setTimeout(() => setSuccess(null), 3000);
    };

    const saveProfile = async () => {
        setSaving(true);
        setError(null);
        try {
            await api.patch('/tenant/settings', formData);
            showSuccess('Profile saved successfully');
        } catch (err) {
            setError('Failed to save profile');
        } finally {
            setSaving(false);
        }
    };

    const saveWorkingHours = async () => {
        setSaving(true);
        setError(null);
        try {
            await api.put('/tenant/working-hours', workingHours);
            showSuccess('Working hours saved successfully');
        } catch (err) {
            setError('Failed to save working hours');
        } finally {
            setSaving(false);
        }
    };

    const toggleAi = async () => {
        setSaving(true);
        setError(null);
        try {
            const newValue = !isAiEnabled;
            await api.patch('/tenant/settings', { isAiEnabled: newValue });
            setIsAiEnabled(newValue);
            showSuccess(`AI ${newValue ? 'enabled' : 'disabled'} successfully`);
        } catch (err) {
            setError('Failed to update AI settings');
        } finally {
            setSaving(false);
        }
    };

    const updateWorkingHour = (dayOfWeek: number, field: keyof WorkingHour, value: any) => {
        setWorkingHours(prev => prev.map(h =>
            h.dayOfWeek === dayOfWeek ? { ...h, [field]: value } : h
        ));
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
            {/* Success Toast */}
            {success && (
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg"
                >
                    <Check className="w-5 h-5" />
                    <span>{success}</span>
                </motion.div>
            )}

            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-slate-900">Settings</h2>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
                <button
                    onClick={() => setActiveTab('profile')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'profile' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                        }`}
                >
                    <Building2 className="w-4 h-4" />
                    Business Profile
                </button>
                <button
                    onClick={() => setActiveTab('hours')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'hours' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                        }`}
                >
                    <Clock className="w-4 h-4" />
                    Working Hours
                </button>
                <button
                    onClick={() => setActiveTab('ai')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'ai' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                        }`}
                >
                    <Bot className="w-4 h-4" />
                    AI Settings
                </button>
            </div>

            {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    <span>{error}</span>
                </div>
            )}

            {/* Profile Tab */}
            {activeTab === 'profile' && (
                <Card className="p-6">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">Business Profile</h3>
                    <div className="space-y-4 max-w-xl">
                        <Input
                            label="Business Name"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder="Your Business Name"
                        />
                        <Input
                            label="Phone Number"
                            value={formData.businessPhone}
                            onChange={(e) => setFormData({ ...formData, businessPhone: e.target.value })}
                            placeholder="+1234567890"
                        />
                        <Input
                            label="Address"
                            value={formData.businessAddress}
                            onChange={(e) => setFormData({ ...formData, businessAddress: e.target.value })}
                            placeholder="123 Business Street, City"
                        />
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                            <textarea
                                className="flex w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all shadow-sm resize-none"
                                rows={3}
                                value={formData.businessDescription}
                                onChange={(e) => setFormData({ ...formData, businessDescription: e.target.value })}
                                placeholder="Describe your business..."
                            />
                        </div>
                        <Button onClick={saveProfile} isLoading={saving}>
                            <Save className="w-4 h-4 mr-2" />
                            Save Profile
                        </Button>
                    </div>
                </Card>
            )}

            {/* Working Hours Tab */}
            {activeTab === 'hours' && (
                <Card className="p-6">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">Working Hours</h3>
                    <div className="space-y-3">
                        {workingHours.map((hour) => (
                            <div key={hour.dayOfWeek} className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg">
                                <div className="w-28 font-medium text-slate-700">{DAYS[hour.dayOfWeek]}</div>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={!hour.isClosed}
                                        onChange={(e) => updateWorkingHour(hour.dayOfWeek, 'isClosed', !e.target.checked)}
                                        className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                                    />
                                    <span className="text-sm text-slate-600">Open</span>
                                </label>
                                {!hour.isClosed && (
                                    <>
                                        <input
                                            type="time"
                                            value={hour.openTime}
                                            onChange={(e) => updateWorkingHour(hour.dayOfWeek, 'openTime', e.target.value)}
                                            className="px-2 py-1 border border-slate-300 rounded text-sm focus:ring-primary-500 focus:border-primary-500"
                                        />
                                        <span className="text-slate-400">to</span>
                                        <input
                                            type="time"
                                            value={hour.closeTime}
                                            onChange={(e) => updateWorkingHour(hour.dayOfWeek, 'closeTime', e.target.value)}
                                            className="px-2 py-1 border border-slate-300 rounded text-sm focus:ring-primary-500 focus:border-primary-500"
                                        />
                                    </>
                                )}
                                {hour.isClosed && (
                                    <span className="text-sm text-slate-400 italic">Closed</span>
                                )}
                            </div>
                        ))}
                    </div>
                    <div className="mt-4">
                        <Button onClick={saveWorkingHours} isLoading={saving}>
                            <Save className="w-4 h-4 mr-2" />
                            Save Working Hours
                        </Button>
                    </div>
                </Card>
            )}

            {/* AI Settings Tab */}
            {activeTab === 'ai' && (
                <Card className="p-6">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">AI Settings</h3>
                    <div className="space-y-6">
                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                            <div>
                                <h4 className="font-medium text-slate-900">AI Auto-Response</h4>
                                <p className="text-sm text-slate-500 mt-1">
                                    Enable AI to automatically respond to WhatsApp messages
                                </p>
                            </div>
                            <button
                                onClick={toggleAi}
                                disabled={saving}
                                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${isAiEnabled ? 'bg-primary-600' : 'bg-slate-200'
                                    }`}
                            >
                                <span
                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isAiEnabled ? 'translate-x-5' : 'translate-x-0'
                                        }`}
                                />
                            </button>
                        </div>

                        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                            <h4 className="font-medium text-amber-800">⚠️ Important</h4>
                            <p className="text-sm text-amber-700 mt-1">
                                When AI is disabled, customers will not receive automatic responses.
                                You or your team must manually respond to all messages.
                            </p>
                        </div>
                    </div>
                </Card>
            )}
        </div>
    );
}
