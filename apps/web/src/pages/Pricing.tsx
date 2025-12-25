/**
 * Pricing Page
 * 
 * Fetches plans from API and integrates with Stripe checkout
 */

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '../components/ui/Button';
import { CouponBanner, getStripeCouponId } from '../components/CouponBanner';
import { useAuth } from '../contexts/AuthContext';
import { billingApi, SubscriptionPlan } from '../lib/api';
import {
    MessageSquare,
    CheckCircle,
    ArrowRight,
    Zap,
    AlertCircle
} from 'lucide-react';

// Fallback static plans when API unavailable
const FALLBACK_PLANS = [
    { id: 'free', name: 'Free', priceAmount: 0, aiDailyLimit: 50, aiMonthlyLimit: 1000, aiPlan: 'FREE', aiTier: 'FREE' },
    { id: 'basic', name: 'Basic', priceAmount: 2900, aiDailyLimit: 500, aiMonthlyLimit: 10000, aiPlan: 'PAID_BASIC', aiTier: 'LOW' },
    { id: 'pro', name: 'Pro', priceAmount: 7900, aiDailyLimit: 2000, aiMonthlyLimit: 50000, aiPlan: 'PAID_PRO', aiTier: 'MEDIUM' },
    { id: 'enterprise', name: 'Enterprise', priceAmount: -1, aiDailyLimit: -1, aiMonthlyLimit: -1, aiPlan: 'ENTERPRISE', aiTier: 'HIGH' },
];

const PLAN_FEATURES: Record<string, string[]> = {
    FREE: ['50 AI responses/day', 'Basic AI model', 'WhatsApp integration', '1 team member', 'Email support'],
    PAID_BASIC: ['500 AI responses/day', 'Low-cost AI models', 'WhatsApp integration', '3 team members', 'Priority email support'],
    PAID_PRO: ['2,000 AI responses/day', 'Advanced AI models', 'WhatsApp integration', '10 team members', 'Priority support', 'Analytics dashboard'],
    ENTERPRISE: ['Unlimited AI responses', 'Custom AI models', 'WhatsApp integration', 'Unlimited team members', 'Dedicated support', 'SLA guarantees', 'Custom integrations'],
};

export function Pricing() {
    const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
    const { user, isAuthenticated } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        loadPlans();
    }, []);

    const loadPlans = async () => {
        try {
            setIsLoading(true);
            const response = await billingApi.getPlans();
            setPlans(response.data);
            setError(null);
        } catch (err: any) {
            console.error('Failed to load plans:', err);
            setError('Unable to load plans. Showing default options.');
            // Use fallback plans
            setPlans(FALLBACK_PLANS as any);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubscribe = async (plan: SubscriptionPlan) => {
        if (plan.priceAmount === 0) {
            // Free plan - redirect to signup
            navigate('/onboarding');
            return;
        }

        if (plan.priceAmount === -1) {
            // Enterprise - contact sales
            window.location.href = 'mailto:sales@b2automate.com?subject=Enterprise Plan Inquiry';
            return;
        }

        if (!isAuthenticated) {
            // Need to login first
            navigate('/login?redirect=/pricing');
            return;
        }

        try {
            setCheckoutLoading(plan.id);

            // Get active coupon if any
            const couponId = getStripeCouponId();

            const response = await billingApi.createCheckoutSession(
                plan.id,
                user!.tenantId,
                user!.email,
                couponId || undefined
            );
            // Redirect to Stripe Checkout
            window.location.href = response.data.url;
        } catch (err: any) {
            console.error('Checkout failed:', err);
            setError(err.response?.data?.error || 'Checkout failed. Please try again.');
            setCheckoutLoading(null);
        }
    };

    const formatPrice = (amount: number) => {
        if (amount === -1) return 'Custom';
        if (amount === 0) return 'Free';
        return `$${(amount / 100).toFixed(0)}`;
    };

    const isPlanPopular = (plan: SubscriptionPlan) => {
        return plan.aiPlan === 'PAID_PRO';
    };

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Promotional Banner */}
            <CouponBanner />

            {/* Header */}
            <header className="bg-white border-b border-slate-200">
                <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                            <MessageSquare className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-xl font-semibold text-slate-900">B2Automate</span>
                    </Link>
                    <div className="flex items-center gap-4">
                        {isAuthenticated ? (
                            <Link to="/dashboard">
                                <Button variant="secondary" size="sm">Dashboard</Button>
                            </Link>
                        ) : (
                            <Link to="/login">
                                <Button variant="secondary" size="sm">Log In</Button>
                            </Link>
                        )}
                    </div>
                </div>
            </header>

            {/* Hero */}
            <section className="py-16 bg-white">
                <div className="max-w-6xl mx-auto px-4 text-center">
                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-4xl font-bold text-slate-900 mb-4"
                    >
                        Simple, Transparent Pricing
                    </motion.h1>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="text-xl text-slate-600 mb-8"
                    >
                        Start free, upgrade when you need more power
                    </motion.p>

                    {error && (
                        <div className="inline-flex items-center gap-2 bg-amber-50 text-amber-700 px-4 py-2 rounded-lg text-sm mb-8">
                            <AlertCircle className="w-4 h-4" />
                            {error}
                        </div>
                    )}
                </div>
            </section>

            {/* Pricing Cards */}
            <section className="py-8 pb-20">
                <div className="max-w-6xl mx-auto px-4">
                    {isLoading ? (
                        <div className="flex justify-center py-20">
                            <div className="flex flex-col items-center gap-4">
                                <div className="w-12 h-12 bg-slate-100 rounded-xl animate-pulse" />
                                <div className="h-4 w-32 bg-slate-100 rounded animate-pulse" />
                            </div>
                        </div>
                    ) : (
                        <div className="grid md:grid-cols-4 gap-6">
                            {plans.map((plan, index) => (
                                <motion.div
                                    key={plan.id}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.1 }}
                                    whileHover={{ y: -4, boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)" }}
                                    className={`bg-white rounded-xl shadow-sm p-6 relative ${isPlanPopular(plan)
                                        ? 'border-2 border-primary-600'
                                        : 'border border-slate-200'
                                        }`}
                                >
                                    {isPlanPopular(plan) && (
                                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary-600 text-white text-xs font-medium px-3 py-1 rounded-full flex items-center gap-1">
                                            <Zap className="w-3 h-3" /> Popular
                                        </div>
                                    )}

                                    <h3 className="text-lg font-semibold text-slate-900">{plan.name}</h3>
                                    <p className="text-sm text-slate-500 mb-4">{plan.description || 'Best for growing businesses'}</p>

                                    <div className="mb-6">
                                        <span className="text-3xl font-bold text-slate-900">
                                            {formatPrice(plan.priceAmount)}
                                        </span>
                                        {plan.priceAmount > 0 && (
                                            <span className="text-slate-500">/mo</span>
                                        )}
                                    </div>

                                    <Button
                                        variant={isPlanPopular(plan) ? 'primary' : 'outline'}
                                        className="w-full mb-6"
                                        onClick={() => handleSubscribe(plan)}
                                        isLoading={checkoutLoading === plan.id}
                                        disabled={checkoutLoading !== null}
                                    >
                                        {plan.priceAmount === 0 ? 'Get Started Free' :
                                            plan.priceAmount === -1 ? 'Contact Sales' : 'Subscribe'}
                                        {isPlanPopular(plan) && checkoutLoading !== plan.id && (
                                            <ArrowRight className="w-4 h-4 ml-2" />
                                        )}
                                    </Button>

                                    <ul className="space-y-3">
                                        {(PLAN_FEATURES[plan.aiPlan] || PLAN_FEATURES.FREE).map((feature, i) => (
                                            <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                                                <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-500" />
                                                {feature}
                                            </li>
                                        ))}
                                    </ul>

                                    {/* AI Limits Badge */}
                                    <div className="mt-6 pt-4 border-t border-slate-100">
                                        <div className="text-xs text-slate-500">
                                            <span className="font-medium text-primary-600">{plan.aiTier}</span> AI Tier
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>
            </section>

            {/* Trust Section */}
            <section className="py-12 bg-white">
                <div className="max-w-3xl mx-auto px-4 text-center">
                    <p className="text-slate-600">
                        All plans include 14-day money-back guarantee. No long-term contracts.
                    </p>
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-slate-900 text-white py-12">
                <div className="max-w-6xl mx-auto px-4">
                    <div className="flex flex-col md:flex-row justify-between items-center">
                        <Link to="/" className="flex items-center gap-2 mb-4 md:mb-0">
                            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
                                <MessageSquare className="w-5 h-5 text-slate-900" />
                            </div>
                            <span className="text-lg font-semibold">B2Automate</span>
                        </Link>
                        <div className="flex gap-6 text-slate-400 text-sm">
                            <Link to="/" className="hover:text-white">Home</Link>
                            <Link to="/login" className="hover:text-white">Login</Link>
                        </div>
                    </div>
                    <div className="border-t border-slate-800 mt-8 pt-8 text-center text-slate-500 text-sm">
                        © 2024 B2Automate. All rights reserved.
                    </div>
                </div>
            </footer>
        </div>
    );
}
