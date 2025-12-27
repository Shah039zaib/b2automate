/**
 * Landing Page
 * 
 * Brand-aligned with existing admin UI:
 * - Primary: purple-600 (#9333ea)
 * - Font: Inter
 * - Card: bg-white rounded-xl shadow-sm border-slate-200
 * - Button: rounded-lg with hover states
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { billingApi, SubscriptionPlan } from '../lib/api';
import { motion } from 'framer-motion';
import { Button } from '../components/ui/Button';
import { CouponBanner } from '../components/CouponBanner';
import {
    MessageSquare,
    Brain,
    Shield,
    CheckCircle,
    ArrowRight
} from 'lucide-react';

export function Landing() {
    const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadPlans = async () => {
            try {
                const response = await billingApi.getPlans();
                setPlans(response.data);
            } catch (err) {
                console.error('Failed to load plans', err);
                // Fallback to empty or specific logic if needed
            } finally {
                setIsLoading(false);
            }
        };
        loadPlans();
    }, []);

    const getPlanFeatures = (aiPlan: string) => {
        const features: Record<string, string[]> = {
            FREE: ['50 AI responses/day', 'Basic AI model', 'WhatsApp integration', '1 team member', 'Email support'],
            PAID_BASIC: ['500 AI responses/day', 'Low-cost AI models', 'WhatsApp integration', '3 team members', 'Priority email support'],
            PAID_PRO: ['2,000 AI responses/day', 'Advanced AI models', 'WhatsApp integration', '10 team members', 'Priority support', 'Analytics dashboard'],
            ENTERPRISE: ['Unlimited AI responses', 'Custom AI models', 'WhatsApp integration', 'Unlimited team members', 'Dedicated support', 'SLA guarantees', 'Custom integrations'],
        };
        return features[aiPlan] || features['FREE'];
    };

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Promotional Banner */}
            <CouponBanner />

            {/* Header */}
            <header className="bg-white border-b border-slate-200">
                <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                            <MessageSquare className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-xl font-semibold text-slate-900">B2Automate</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <Link to="/pricing" className="text-slate-600 hover:text-slate-900 font-medium">
                            Pricing
                        </Link>
                        <Link to="/login">
                            <Button variant="secondary" size="sm">Log In</Button>
                        </Link>
                        <Link to="/register">
                            <Button size="sm">Get Started</Button>
                        </Link>
                    </div>
                </div>
            </header>

            {/* Hero Section */}
            <section className="py-20 bg-white">
                <div className="max-w-6xl mx-auto px-4 text-center">
                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-4xl md:text-5xl font-bold text-slate-900 mb-6"
                    >
                        WhatsApp AI for Your Business
                    </motion.h1>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="text-xl text-slate-600 mb-8 max-w-2xl mx-auto"
                    >
                        Automate customer conversations on WhatsApp with intelligent AI.
                        Handle inquiries, take orders, and grow your business 24/7.
                    </motion.p>
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="flex gap-4 justify-center"
                    >
                        <Link to="/register">
                            <Button size="lg">
                                Start Free
                                <ArrowRight className="w-5 h-5 ml-2" />
                            </Button>
                        </Link>
                        <Link to="/login">
                            <Button variant="secondary" size="lg">Log In</Button>
                        </Link>
                    </motion.div>
                </div>
            </section>

            {/* Features Section */}
            <section className="py-16">
                <div className="max-w-6xl mx-auto px-4">
                    <h2 className="text-2xl font-bold text-slate-900 text-center mb-12">
                        Everything You Need
                    </h2>
                    <div className="grid md:grid-cols-3 gap-6">
                        {/* Feature Card 1 */}
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                            <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mb-4">
                                <Brain className="w-6 h-6 text-primary-600" />
                            </div>
                            <h3 className="text-lg font-semibold text-slate-900 mb-2">AI-Powered Responses</h3>
                            <p className="text-slate-600">
                                Smart AI understands context and responds naturally to customer questions.
                            </p>
                        </div>

                        {/* Feature Card 2 */}
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                                <MessageSquare className="w-6 h-6 text-green-600" />
                            </div>
                            <h3 className="text-lg font-semibold text-slate-900 mb-2">WhatsApp Integration</h3>
                            <p className="text-slate-600">
                                Connect your WhatsApp Business account in minutes. No coding required.
                            </p>
                        </div>

                        {/* Feature Card 3 */}
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                                <Shield className="w-6 h-6 text-blue-600" />
                            </div>
                            <h3 className="text-lg font-semibold text-slate-900 mb-2">Enterprise Security</h3>
                            <p className="text-slate-600">
                                Your data is encrypted and protected. AI guardrails prevent unwanted responses.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* How It Works */}
            <section className="py-16 bg-white">
                <div className="max-w-6xl mx-auto px-4">
                    <h2 className="text-2xl font-bold text-slate-900 text-center mb-12">
                        How It Works
                    </h2>
                    <div className="grid md:grid-cols-3 gap-8">
                        <div className="text-center">
                            <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center text-white font-bold mx-auto mb-4">1</div>
                            <h3 className="font-semibold text-slate-900 mb-2">Connect WhatsApp</h3>
                            <p className="text-slate-600">Scan QR code to link your WhatsApp Business account.</p>
                        </div>
                        <div className="text-center">
                            <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center text-white font-bold mx-auto mb-4">2</div>
                            <h3 className="font-semibold text-slate-900 mb-2">Configure AI</h3>
                            <p className="text-slate-600">Add your services, hours, and business info.</p>
                        </div>
                        <div className="text-center">
                            <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center text-white font-bold mx-auto mb-4">3</div>
                            <h3 className="font-semibold text-slate-900 mb-2">Go Live</h3>
                            <p className="text-slate-600">AI handles customer messages automatically.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Pricing Teaser */}
            <section className="py-16">
                <div className="max-w-6xl mx-auto px-4 text-center">
                    <h2 className="text-2xl font-bold text-slate-900 mb-4">
                        Simple, Transparent Pricing
                    </h2>
                    <p className="text-slate-600 mb-8">
                        Start free. Upgrade when you're ready.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 max-w-6xl mx-auto">
                        {isLoading ? (
                            Array(3).fill(0).map((_, i) => (
                                <div key={i} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 animate-pulse h-96"></div>
                            ))
                        ) : (
                            plans.map((plan) => (
                                <div key={plan.id} className={`bg-white rounded-xl shadow-sm p-6 relative flex flex-col ${plan.aiPlan === 'PAID_PRO' ? 'border-2 border-primary-600' : 'border border-slate-200'}`}>
                                    {plan.aiPlan === 'PAID_PRO' && (
                                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary-600 text-white text-xs font-medium px-3 py-1 rounded-full">
                                            Popular
                                        </div>
                                    )}
                                    <h3 className="font-semibold text-slate-900 mb-2">{plan.name}</h3>

                                    <div className="mb-4">
                                        {plan.priceAmount === -1 ? (
                                            <div className="text-3xl font-bold text-slate-900">Custom</div>
                                        ) : plan.priceAmount === 0 ? (
                                            <div className="text-3xl font-bold text-slate-900">Free</div>
                                        ) : (
                                            <div className="flex items-baseline gap-1">
                                                <span className="text-3xl font-bold text-slate-900">${(plan.priceAmount / 100).toFixed(0)}</span>
                                                <span className="text-sm font-normal text-slate-500">/mo</span>
                                            </div>
                                        )}
                                    </div>

                                    <ul className="space-y-2 text-left text-sm text-slate-600 mb-6 flex-grow">
                                        {getPlanFeatures(plan.aiPlan).map((feature, i) => (
                                            <li key={i} className="flex items-start gap-2">
                                                <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                                                <span>{feature}</span>
                                            </li>
                                        ))}
                                    </ul>

                                    <Link to="/register" className="mt-auto">
                                        <Button
                                            variant={plan.aiPlan === 'PAID_PRO' ? 'default' : 'outline'}
                                            className="w-full"
                                        >
                                            {plan.priceAmount === -1 ? 'Contact Sales' : (plan.priceAmount === 0 ? 'Get Started' : 'Subscribe')}
                                        </Button>
                                    </Link>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-slate-900 text-white py-12">
                <div className="max-w-6xl mx-auto px-4">
                    <div className="flex flex-col md:flex-row justify-between items-center">
                        <div className="flex items-center gap-2 mb-4 md:mb-0">
                            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
                                <MessageSquare className="w-5 h-5 text-slate-900" />
                            </div>
                            <span className="text-lg font-semibold">B2Automate</span>
                        </div>
                        <div className="flex gap-6 text-slate-400 text-sm">
                            <Link to="/pricing" className="hover:text-white">Pricing</Link>
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
