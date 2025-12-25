/**
 * Checkout Success Page
 * 
 * Displayed after successful Stripe checkout
 */

import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '../components/ui/Button';
import {
    CheckCircle,
    ArrowRight,
    Sparkles,
    Shield,
    MessageSquare
} from 'lucide-react';

export function CheckoutSuccess() {
    const [searchParams] = useSearchParams();
    const sessionId = searchParams.get('session_id');

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 max-w-md w-full text-center"
            >
                {/* Success Icon */}
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                    className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6"
                >
                    <CheckCircle className="w-8 h-8 text-green-600" />
                </motion.div>

                <motion.h1
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="text-2xl font-bold text-slate-900 mb-2"
                >
                    Payment Successful!
                </motion.h1>

                <motion.p
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="text-slate-600 mb-8"
                >
                    Your subscription is now active. You're all set to use enhanced AI features.
                </motion.p>

                {/* Benefits */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="bg-slate-50 rounded-lg p-4 mb-8"
                >
                    <div className="space-y-3">
                        <div className="flex items-center gap-3 text-left">
                            <div className="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                <Sparkles className="w-4 h-4 text-primary-600" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-slate-900">AI Tier Upgraded</p>
                                <p className="text-xs text-slate-500">Access to advanced AI models</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 text-left">
                            <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                <MessageSquare className="w-4 h-4 text-green-600" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-slate-900">Higher Limits</p>
                                <p className="text-xs text-slate-500">More AI responses per day</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 text-left">
                            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                <Shield className="w-4 h-4 text-blue-600" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-slate-900">Priority Support</p>
                                <p className="text-xs text-slate-500">Faster response times</p>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* CTA */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                    className="space-y-3"
                >
                    <Link to="/dashboard" className="block">
                        <Button className="w-full">
                            Go to Dashboard
                            <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                    </Link>
                    <Link to="/billing" className="block">
                        <Button variant="ghost" className="w-full">
                            View Billing Details
                        </Button>
                    </Link>
                </motion.div>

                {/* Session ID for debugging */}
                {sessionId && (
                    <p className="text-xs text-slate-400 mt-8">
                        Session: {sessionId.substring(0, 20)}...
                    </p>
                )}
            </motion.div>
        </div>
    );
}
