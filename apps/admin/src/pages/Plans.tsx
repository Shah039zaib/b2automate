/**
 * Plans Management Page
 * 
 * Super Admin interface for managing subscription plans
 */

import { useState, useEffect } from 'react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { planApi, SubscriptionPlan, CreatePlanRequest, UpdatePlanRequest } from '../lib/api';
import {
    Plus,
    Edit2,
    Trash2,
    CheckCircle,
    XCircle,
    AlertCircle,
    Zap,
    DollarSign
} from 'lucide-react';

const AI_PLANS = ['FREE', 'PAID_BASIC', 'PAID_PRO', 'ENTERPRISE'] as const;
const AI_TIERS = ['FREE', 'LOW', 'MEDIUM', 'HIGH'] as const;

export function Plans() {
    const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Form state
    const [formData, setFormData] = useState<CreatePlanRequest>({
        name: '',
        description: '',
        stripeProductId: '',
        stripePriceId: '',
        aiPlan: 'FREE',
        aiTier: 'FREE',
        aiDailyLimit: 50,
        aiMonthlyLimit: 1000,
        priceAmount: 0,
        priceCurrency: 'usd',
        priceInterval: 'month',
        displayOrder: 0
    });

    useEffect(() => {
        loadPlans();
    }, []);

    const loadPlans = async () => {
        try {
            setIsLoading(true);
            const response = await planApi.list();
            setPlans(response.data.plans || []);
            setError(null);
        } catch (err: any) {
            console.error('Failed to load plans:', err);
            setError('Failed to load plans');
        } finally {
            setIsLoading(false);
        }
    };

    const resetForm = () => {
        setFormData({
            name: '',
            description: '',
            stripeProductId: '',
            stripePriceId: '',
            aiPlan: 'FREE',
            aiTier: 'FREE',
            aiDailyLimit: 50,
            aiMonthlyLimit: 1000,
            priceAmount: 0,
            priceCurrency: 'usd',
            priceInterval: 'month',
            displayOrder: 0
        });
        setEditingPlan(null);
        setIsCreating(false);
    };

    const openCreateModal = () => {
        resetForm();
        setIsCreating(true);
    };

    const openEditModal = (plan: SubscriptionPlan) => {
        setFormData({
            name: plan.name,
            description: plan.description || '',
            stripeProductId: plan.stripeProductId,
            stripePriceId: plan.stripePriceId,
            aiPlan: plan.aiPlan,
            aiTier: plan.aiTier,
            aiDailyLimit: plan.aiDailyLimit,
            aiMonthlyLimit: plan.aiMonthlyLimit,
            priceAmount: plan.priceAmount,
            priceCurrency: plan.priceCurrency,
            priceInterval: plan.priceInterval,
            displayOrder: plan.displayOrder
        });
        setEditingPlan(plan);
        setIsCreating(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setIsSaving(true);
            if (editingPlan) {
                await planApi.update(editingPlan.id, formData as UpdatePlanRequest);
            } else {
                await planApi.create(formData);
            }
            resetForm();
            loadPlans();
        } catch (err: any) {
            console.error('Save failed:', err);
            setError(err.response?.data?.error || 'Failed to save plan');
        } finally {
            setIsSaving(false);
        }
    };

    const togglePlanActive = async (plan: SubscriptionPlan) => {
        try {
            await planApi.update(plan.id, { isActive: !plan.isActive });
            loadPlans();
        } catch (err: any) {
            console.error('Toggle failed:', err);
            setError(err.response?.data?.error || 'Failed to toggle plan');
        }
    };

    const deletePlan = async (plan: SubscriptionPlan) => {
        if (!confirm(`Are you sure you want to disable "${plan.name}"?`)) return;
        try {
            await planApi.delete(plan.id);
            loadPlans();
        } catch (err: any) {
            console.error('Delete failed:', err);
            setError(err.response?.data?.error || 'Failed to delete plan');
        }
    };

    const formatPrice = (amount: number, currency: string) => {
        if (amount === 0) return 'Free';
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency.toUpperCase()
        }).format(amount / 100);
    };

    // Skeleton loader
    if (isLoading) {
        return (
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
                    <div className="h-10 w-32 bg-slate-200 rounded animate-pulse" />
                </div>
                <div className="grid gap-4">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-24 bg-white rounded-xl border border-slate-200 animate-pulse" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Subscription Plans</h1>
                    <p className="text-slate-600 mt-1">Manage pricing and AI tier mappings</p>
                </div>
                <Button onClick={openCreateModal}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Plan
                </Button>
            </div>

            {error && (
                <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" />
                    {error}
                    <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">×</button>
                </div>
            )}

            {/* Plans Table */}
            <Card className="overflow-hidden p-0">
                <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-6 py-3">Plan</th>
                            <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-6 py-3">Price</th>
                            <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-6 py-3">AI Tier</th>
                            <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-6 py-3">Limits</th>
                            <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-6 py-3">Status</th>
                            <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-6 py-3">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {plans.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                                    No plans configured. Click "Add Plan" to create one.
                                </td>
                            </tr>
                        ) : (
                            plans.map(plan => (
                                <tr key={plan.id} className="hover:bg-slate-50">
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-slate-900">{plan.name}</div>
                                        <div className="text-xs text-slate-500 font-mono truncate max-w-[200px]">
                                            {plan.stripePriceId}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-1">
                                            <DollarSign className="w-4 h-4 text-slate-400" />
                                            <span className="font-medium text-slate-900">
                                                {formatPrice(plan.priceAmount, plan.priceCurrency)}
                                            </span>
                                            <span className="text-slate-500">/{plan.priceInterval}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <Zap className="w-4 h-4 text-primary-600" />
                                            <span className="text-slate-700">{plan.aiTier}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-sm text-slate-600">
                                            {plan.aiDailyLimit}/day • {plan.aiMonthlyLimit}/mo
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <button
                                            onClick={() => togglePlanActive(plan)}
                                            className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${plan.isActive
                                                ? 'bg-green-100 text-green-700'
                                                : 'bg-slate-100 text-slate-600'
                                                }`}
                                        >
                                            {plan.isActive ? (
                                                <><CheckCircle className="w-3 h-3" /> Active</>
                                            ) : (
                                                <><XCircle className="w-3 h-3" /> Disabled</>
                                            )}
                                        </button>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => openEditModal(plan)}
                                                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => deletePlan(plan)}
                                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </Card>

            {/* Create/Edit Modal */}
            {isCreating && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-slate-200">
                            <h2 className="text-lg font-semibold text-slate-900">
                                {editingPlan ? 'Edit Plan' : 'Create Plan'}
                            </h2>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                        required
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                                    <input
                                        type="text"
                                        value={formData.description || ''}
                                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Stripe Product ID</label>
                                    <input
                                        type="text"
                                        value={formData.stripeProductId}
                                        onChange={e => setFormData({ ...formData, stripeProductId: e.target.value })}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono text-sm"
                                        placeholder="prod_xxx"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Stripe Price ID</label>
                                    <input
                                        type="text"
                                        value={formData.stripePriceId}
                                        onChange={e => setFormData({ ...formData, stripePriceId: e.target.value })}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono text-sm"
                                        placeholder="price_xxx"
                                        required
                                        disabled={!!editingPlan}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">AI Plan</label>
                                    <select
                                        value={formData.aiPlan}
                                        onChange={e => setFormData({ ...formData, aiPlan: e.target.value as any })}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                    >
                                        {AI_PLANS.map(p => <option key={p} value={p}>{p}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">AI Tier</label>
                                    <select
                                        value={formData.aiTier}
                                        onChange={e => setFormData({ ...formData, aiTier: e.target.value as any })}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                    >
                                        {AI_TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Daily Limit</label>
                                    <input
                                        type="number"
                                        value={formData.aiDailyLimit}
                                        onChange={e => setFormData({ ...formData, aiDailyLimit: parseInt(e.target.value) })}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                        min={0}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Monthly Limit</label>
                                    <input
                                        type="number"
                                        value={formData.aiMonthlyLimit}
                                        onChange={e => setFormData({ ...formData, aiMonthlyLimit: parseInt(e.target.value) })}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                        min={0}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Price (cents)</label>
                                    <input
                                        type="number"
                                        value={formData.priceAmount}
                                        onChange={e => setFormData({ ...formData, priceAmount: parseInt(e.target.value) })}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                        min={0}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Interval</label>
                                    <select
                                        value={formData.priceInterval}
                                        onChange={e => setFormData({ ...formData, priceInterval: e.target.value })}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                    >
                                        <option value="month">Monthly</option>
                                        <option value="year">Yearly</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                                <Button type="button" variant="ghost" onClick={resetForm}>Cancel</Button>
                                <Button type="submit" isLoading={isSaving}>
                                    {editingPlan ? 'Save Changes' : 'Create Plan'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
