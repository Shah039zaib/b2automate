import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card } from '../components/ui/Card';
import { Settings as SettingsIcon, Power, Bot, Loader2, Check, AlertCircle } from 'lucide-react';
import api from '../lib/api';

interface SystemSettings {
    globalAiEnabled: boolean;
    globalWhatsappEnabled: boolean;
    defaultAiProvider: string;
    maxTenantsAllowed: number;
    maxMessagesPerHour: number;
    updatedAt: string;
}

interface UsageStats {
    overview: {
        totalMessages: number;
        messagesLast24h: number;
        aiResponses: number;
        manualResponses: number;
        aiPercentage: number;
    };
    conversationsByStatus: Record<string, number>;
}

export function Settings() {
    const [settings, setSettings] = useState<SystemSettings | null>(null);
    const [usage, setUsage] = useState<UsageStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const [settingsRes, usageRes] = await Promise.all([
                api.get<SystemSettings>('/system/settings'),
                api.get<UsageStats>('/system/usage')
            ]);
            setSettings(settingsRes.data);
            setUsage(usageRes.data);
        } catch (err) {
            setError('Failed to load settings');
        } finally {
            setLoading(false);
        }
    };

    const showSuccess = (msg: string) => {
        setSuccess(msg);
        setTimeout(() => setSuccess(null), 3000);
    };

    const handleToggle = async (key: keyof SystemSettings) => {
        if (!settings) return;
        setSaving(true);
        try {
            const res = await api.patch<SystemSettings>('/system/settings', {
                [key]: !settings[key]
            });
            setSettings(res.data);
            showSuccess('Settings updated');
        } catch (err) {
            setError('Failed to update settings');
        } finally {
            setSaving(false);
        }
    };

    const handleProviderChange = async (provider: string) => {
        setSaving(true);
        try {
            const res = await api.patch<SystemSettings>('/system/settings', {
                defaultAiProvider: provider
            });
            setSettings(res.data);
            showSuccess('AI provider updated');
        } catch (err) {
            setError('Failed to update provider');
        } finally {
            setSaving(false);
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

            <div className="flex items-center gap-3">
                <SettingsIcon className="w-6 h-6 text-primary-600" />
                <h2 className="text-2xl font-bold text-slate-900">System Settings</h2>
            </div>

            {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
                    <AlertCircle className="w-4 h-4" />
                    <span>{error}</span>
                </div>
            )}

            {/* Global Kill Switches */}
            <Card>
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Global Kill Switches</h3>
                <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                        <div className="flex items-center gap-3">
                            <Bot className="w-5 h-5 text-primary-600" />
                            <div>
                                <p className="font-medium text-slate-900">AI Auto-Responses</p>
                                <p className="text-sm text-slate-500">Enable/disable AI for ALL tenants</p>
                            </div>
                        </div>
                        <button
                            onClick={() => handleToggle('globalAiEnabled')}
                            disabled={saving}
                            className={`relative w-12 h-6 rounded-full transition-colors ${settings?.globalAiEnabled ? 'bg-green-500' : 'bg-slate-300'
                                }`}
                        >
                            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${settings?.globalAiEnabled ? 'left-7' : 'left-1'
                                }`} />
                        </button>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                        <div className="flex items-center gap-3">
                            <Power className="w-5 h-5 text-green-600" />
                            <div>
                                <p className="font-medium text-slate-900">WhatsApp Integration</p>
                                <p className="text-sm text-slate-500">Enable/disable WhatsApp for ALL tenants</p>
                            </div>
                        </div>
                        <button
                            onClick={() => handleToggle('globalWhatsappEnabled')}
                            disabled={saving}
                            className={`relative w-12 h-6 rounded-full transition-colors ${settings?.globalWhatsappEnabled ? 'bg-green-500' : 'bg-slate-300'
                                }`}
                        >
                            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${settings?.globalWhatsappEnabled ? 'left-7' : 'left-1'
                                }`} />
                        </button>
                    </div>
                </div>
            </Card>

            {/* AI Provider */}
            <Card>
                <h3 className="text-lg font-semibold text-slate-900 mb-4">AI Configuration</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Default AI Provider</label>
                        <select
                            value={settings?.defaultAiProvider || 'mock'}
                            onChange={(e) => handleProviderChange(e.target.value)}
                            disabled={saving}
                            className="w-full max-w-xs px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                        >
                            <option value="mock">Mock Provider (Testing)</option>
                            <option value="openai">OpenAI (Production)</option>
                        </select>
                    </div>
                </div>
            </Card>

            {/* Usage Stats */}
            {usage && (
                <Card>
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">Usage Statistics</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-4 bg-slate-50 rounded-lg text-center">
                            <p className="text-2xl font-bold text-slate-900">{usage.overview.totalMessages}</p>
                            <p className="text-sm text-slate-500">Total Messages</p>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-lg text-center">
                            <p className="text-2xl font-bold text-slate-900">{usage.overview.messagesLast24h}</p>
                            <p className="text-sm text-slate-500">Last 24h</p>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-lg text-center">
                            <p className="text-2xl font-bold text-green-600">{usage.overview.aiResponses}</p>
                            <p className="text-sm text-slate-500">AI Responses</p>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-lg text-center">
                            <p className="text-2xl font-bold text-blue-600">{usage.overview.aiPercentage}%</p>
                            <p className="text-sm text-slate-500">AI Usage</p>
                        </div>
                    </div>
                </Card>
            )}

            {/* Last Updated */}
            {settings && (
                <p className="text-sm text-slate-400 text-center">
                    Last updated: {new Date(settings.updatedAt).toLocaleString()}
                </p>
            )}
        </div>
    );
}
