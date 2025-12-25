/**
 * Growth Settings Page
 * 
 * Super Admin controls for Analytics, Pixel, and Coupon Banner
 */

import { useState, useEffect } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { growthApi, GrowthSettings, UpdateGrowthSettingsRequest } from '../lib/api';
import {
    BarChart3,
    Megaphone,
    Tag,
    Check,
    AlertCircle,
    ExternalLink
} from 'lucide-react';

export function Growth() {
    const [settings, setSettings] = useState<GrowthSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Form state
    const [form, setForm] = useState<UpdateGrowthSettingsRequest>({});

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            setLoading(true);
            const res = await growthApi.getSettings();
            setSettings(res.data);
            setForm(res.data);
            setError(null);
        } catch (err: any) {
            console.error('Failed to load growth settings:', err);
            // Use defaults if API not ready
            const defaults: GrowthSettings = {
                gaEnabled: false,
                gaMeasurementId: '',
                fbPixelEnabled: false,
                fbPixelId: '',
                couponEnabled: false,
                couponCode: '',
                couponDiscountType: 'percentage',
                couponDiscountValue: 0,
                couponMessage: '',
                couponExpiry: null,
                couponStripeCouponId: '',
                updatedAt: new Date().toISOString()
            };
            setSettings(defaults);
            setForm(defaults);
        } finally {
            setLoading(false);
        }
    };

    const showSuccess = (msg: string) => {
        setSuccess(msg);
        setTimeout(() => setSuccess(null), 3000);
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            setError(null);
            const res = await growthApi.updateSettings(form);
            setSettings(res.data);
            showSuccess('Settings saved successfully');
        } catch (err: any) {
            console.error('Save failed:', err);
            setError(err.response?.data?.error || 'Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    const handleToggle = (key: keyof UpdateGrowthSettingsRequest) => {
        setForm(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleChange = (key: keyof UpdateGrowthSettingsRequest, value: any) => {
        setForm(prev => ({ ...prev, [key]: value }));
    };

    // Skeleton loader
    if (loading) {
        return (
            <div className="space-y-6">
                <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
                {[1, 2, 3].map(i => (
                    <div key={i} className="h-48 bg-white rounded-xl border border-slate-200 animate-pulse" />
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Success Toast */}
            {success && (
                <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg">
                    <Check className="w-5 h-5" />
                    <span>{success}</span>
                </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Growth & Marketing</h1>
                    <p className="text-slate-600 mt-1">Configure analytics, tracking, and promotional features</p>
                </div>
                <Button onClick={handleSave} isLoading={saving}>
                    Save Changes
                </Button>
            </div>

            {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
                    <AlertCircle className="w-4 h-4" />
                    <span>{error}</span>
                </div>
            )}

            {/* Google Analytics */}
            <Card>
                <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                            <BarChart3 className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-slate-900">Google Analytics (GA4)</h3>
                            <p className="text-sm text-slate-500">Track user behavior and conversions</p>
                        </div>
                    </div>
                    <button
                        onClick={() => handleToggle('gaEnabled')}
                        className={`relative w-12 h-6 rounded-full transition-colors ${form.gaEnabled ? 'bg-green-500' : 'bg-slate-300'
                            }`}
                    >
                        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${form.gaEnabled ? 'left-7' : 'left-1'
                            }`} />
                    </button>
                </div>

                {form.gaEnabled && (
                    <div className="space-y-4 pt-4 border-t border-slate-100">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Measurement ID
                            </label>
                            <input
                                type="text"
                                value={form.gaMeasurementId || ''}
                                onChange={e => handleChange('gaMeasurementId', e.target.value)}
                                placeholder="G-XXXXXXXXXX"
                                className="w-full max-w-sm px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono text-sm"
                            />
                            <p className="text-xs text-slate-500 mt-1">
                                Find this in your GA4 property settings
                            </p>
                        </div>
                        <a
                            href="https://analytics.google.com/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
                        >
                            Open Google Analytics <ExternalLink className="w-3 h-3" />
                        </a>
                    </div>
                )}
            </Card>

            {/* Facebook Pixel */}
            <Card>
                <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                            <Megaphone className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-slate-900">Facebook / Meta Pixel</h3>
                            <p className="text-sm text-slate-500">Track conversions for Meta Ads</p>
                        </div>
                    </div>
                    <button
                        onClick={() => handleToggle('fbPixelEnabled')}
                        className={`relative w-12 h-6 rounded-full transition-colors ${form.fbPixelEnabled ? 'bg-green-500' : 'bg-slate-300'
                            }`}
                    >
                        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${form.fbPixelEnabled ? 'left-7' : 'left-1'
                            }`} />
                    </button>
                </div>

                {form.fbPixelEnabled && (
                    <div className="space-y-4 pt-4 border-t border-slate-100">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Pixel ID
                            </label>
                            <input
                                type="text"
                                value={form.fbPixelId || ''}
                                onChange={e => handleChange('fbPixelId', e.target.value)}
                                placeholder="123456789012345"
                                className="w-full max-w-sm px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono text-sm"
                            />
                            <p className="text-xs text-slate-500 mt-1">
                                Find this in Meta Events Manager
                            </p>
                        </div>
                        <a
                            href="https://business.facebook.com/events_manager"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
                        >
                            Open Meta Events Manager <ExternalLink className="w-3 h-3" />
                        </a>
                    </div>
                )}
            </Card>

            {/* Coupon Banner */}
            <Card>
                <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                            <Tag className="w-5 h-5 text-amber-600" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-slate-900">Promotional Banner</h3>
                            <p className="text-sm text-slate-500">Display discount offers on public pages</p>
                        </div>
                    </div>
                    <button
                        onClick={() => handleToggle('couponEnabled')}
                        className={`relative w-12 h-6 rounded-full transition-colors ${form.couponEnabled ? 'bg-green-500' : 'bg-slate-300'
                            }`}
                    >
                        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${form.couponEnabled ? 'left-7' : 'left-1'
                            }`} />
                    </button>
                </div>

                {form.couponEnabled && (
                    <div className="space-y-4 pt-4 border-t border-slate-100">
                        <div className="grid md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Coupon Code
                                </label>
                                <input
                                    type="text"
                                    value={form.couponCode || ''}
                                    onChange={e => handleChange('couponCode', e.target.value.toUpperCase())}
                                    placeholder="WINTER25"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono uppercase"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Stripe Coupon ID
                                </label>
                                <input
                                    type="text"
                                    value={form.couponStripeCouponId || ''}
                                    onChange={e => handleChange('couponStripeCouponId', e.target.value)}
                                    placeholder="promo_xxx or WINTER25"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono text-sm"
                                />
                                <p className="text-xs text-slate-500 mt-1">
                                    Must match coupon in Stripe Dashboard
                                </p>
                            </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Discount Type
                                </label>
                                <select
                                    value={form.couponDiscountType || 'percentage'}
                                    onChange={e => handleChange('couponDiscountType', e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                >
                                    <option value="percentage">Percentage (%)</option>
                                    <option value="fixed">Fixed Amount ($)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Discount Value
                                </label>
                                <input
                                    type="number"
                                    value={form.couponDiscountValue || 0}
                                    onChange={e => handleChange('couponDiscountValue', parseInt(e.target.value))}
                                    min={0}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Banner Message
                            </label>
                            <input
                                type="text"
                                value={form.couponMessage || ''}
                                onChange={e => handleChange('couponMessage', e.target.value)}
                                placeholder="🎉 Get 25% off with code WINTER25!"
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Expiry Date (Optional)
                            </label>
                            <input
                                type="date"
                                value={form.couponExpiry?.split('T')[0] || ''}
                                onChange={e => handleChange('couponExpiry', e.target.value ? new Date(e.target.value).toISOString() : null)}
                                className="w-full max-w-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            />
                        </div>

                        {/* Preview */}
                        <div className="mt-4">
                            <p className="text-sm font-medium text-slate-700 mb-2">Preview:</p>
                            <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white text-center py-2 px-4 rounded-lg text-sm">
                                {form.couponMessage || '🎉 Get 25% off with code WINTER25!'}
                            </div>
                        </div>
                    </div>
                )}
            </Card>

            {/* Last Updated */}
            {settings && (
                <p className="text-sm text-slate-400 text-center">
                    Last updated: {new Date(settings.updatedAt).toLocaleString()}
                </p>
            )}
        </div>
    );
}
