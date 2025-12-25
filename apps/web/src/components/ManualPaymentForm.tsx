/**
 * Manual Payment Form
 * 
 * Form for EasyPaisa, JazzCash, and Bank Transfer payments
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { manualPaymentApi, ManualPaymentSubmission, SubscriptionPlan } from '../lib/api';
import { useGrowth } from '../contexts/GrowthContext';
import {
    Upload,
    Phone,
    Building2,
    AlertCircle,
    CheckCircle,
    ArrowLeft
} from 'lucide-react';

interface ManualPaymentFormProps {
    plan: SubscriptionPlan;
    onBack: () => void;
    onSuccess: () => void;
}

type PaymentMethod = 'EASYPAISA' | 'JAZZCASH' | 'BANK_TRANSFER';

const PAYMENT_INFO: Record<PaymentMethod, {
    name: string;
    icon: typeof Phone;
    color: string;
    accountName: string;
    accountNumber: string;
    instructions: string;
}> = {
    EASYPAISA: {
        name: 'EasyPaisa',
        icon: Phone,
        color: 'bg-green-500',
        accountName: 'B2Automate Pvt Ltd',
        accountNumber: '0300-1234567',
        instructions: 'Send payment to this EasyPaisa number and upload screenshot'
    },
    JAZZCASH: {
        name: 'JazzCash',
        icon: Phone,
        color: 'bg-red-500',
        accountName: 'B2Automate Pvt Ltd',
        accountNumber: '0301-1234567',
        instructions: 'Send payment to this JazzCash number and upload screenshot'
    },
    BANK_TRANSFER: {
        name: 'Bank Transfer',
        icon: Building2,
        color: 'bg-blue-500',
        accountName: 'B2Automate Pvt Ltd',
        accountNumber: 'PK12 ABCD 0000 1234 5678',
        instructions: 'Transfer to HBL Bank account and upload receipt'
    }
};

export function ManualPaymentForm({ plan, onBack, onSuccess }: ManualPaymentFormProps) {
    const { coupon } = useGrowth();

    const [method, setMethod] = useState<PaymentMethod>('EASYPAISA');
    const [senderName, setSenderName] = useState('');
    const [senderNumber, setSenderNumber] = useState('');
    const [reference, setReference] = useState('');
    const [screenshotUrl, setScreenshotUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    // Calculate price with coupon
    const originalPrice = plan.priceAmount;
    let finalPrice = originalPrice;
    let appliedCoupon: string | null = null;

    if (coupon?.enabled && coupon.code) {
        appliedCoupon = coupon.code;
        if (coupon.discountType === 'percentage' && coupon.discountValue) {
            finalPrice = Math.round(originalPrice * (1 - coupon.discountValue / 100));
        } else if (coupon.discountType === 'fixed' && coupon.discountValue) {
            finalPrice = Math.max(0, originalPrice - coupon.discountValue);
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!senderName.trim()) {
            setError('Please enter sender name');
            return;
        }

        if (!screenshotUrl.trim()) {
            setError('Please upload payment screenshot');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const payload: ManualPaymentSubmission = {
                planId: plan.id,
                method,
                senderName: senderName.trim(),
                senderNumber: senderNumber.trim() || undefined,
                reference: reference.trim() || undefined,
                screenshotUrl: screenshotUrl.trim(),
                couponCode: appliedCoupon || undefined
            };

            await manualPaymentApi.submit(payload);
            setSuccess(true);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to submit payment');
        } finally {
            setIsLoading(false);
        }
    };

    // Success state
    if (success) {
        return (
            <Card className="max-w-lg mx-auto text-center py-8">
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200 }}
                    className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4"
                >
                    <CheckCircle className="w-8 h-8 text-green-600" />
                </motion.div>
                <h3 className="text-xl font-semibold text-slate-900 mb-2">Payment Submitted!</h3>
                <p className="text-slate-600 mb-6">
                    Your payment is being reviewed. You'll be notified once approved.
                </p>
                <Button onClick={onSuccess}>Go to Dashboard</Button>
            </Card>
        );
    }

    const info = PAYMENT_INFO[method];

    return (
        <div className="max-w-2xl mx-auto">
            <button
                onClick={onBack}
                className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6"
            >
                <ArrowLeft className="w-4 h-4" />
                Back to payment options
            </button>

            <Card>
                <h2 className="text-xl font-semibold text-slate-900 mb-6">
                    Complete Manual Payment
                </h2>

                {/* Plan Summary */}
                <div className="bg-slate-50 rounded-lg p-4 mb-6">
                    <div className="flex justify-between items-center">
                        <div>
                            <p className="font-medium text-slate-900">{plan.name} Plan</p>
                            <p className="text-sm text-slate-500">Monthly subscription</p>
                        </div>
                        <div className="text-right">
                            {appliedCoupon && (
                                <p className="text-sm text-slate-500 line-through">
                                    ${(originalPrice / 100).toFixed(2)}
                                </p>
                            )}
                            <p className="text-xl font-bold text-slate-900">
                                ${(finalPrice / 100).toFixed(2)}
                            </p>
                            {appliedCoupon && (
                                <p className="text-xs text-green-600">
                                    Coupon: {appliedCoupon}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Payment Method Selector */}
                <div className="mb-6">
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                        Select Payment Method
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                        {(Object.keys(PAYMENT_INFO) as PaymentMethod[]).map((m) => {
                            const payment = PAYMENT_INFO[m];
                            const Icon = payment.icon;
                            return (
                                <button
                                    key={m}
                                    type="button"
                                    onClick={() => setMethod(m)}
                                    className={`p-3 rounded-lg border-2 transition-all ${method === m
                                        ? 'border-primary-600 bg-primary-50'
                                        : 'border-slate-200 hover:border-slate-300'
                                        }`}
                                >
                                    <div className={`w-8 h-8 ${payment.color} rounded-full flex items-center justify-center mx-auto mb-2`}>
                                        <Icon className="w-4 h-4 text-white" />
                                    </div>
                                    <p className="text-xs font-medium text-slate-700">{payment.name}</p>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Payment Instructions */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                    <h4 className="font-medium text-blue-900 mb-2">Payment Details</h4>
                    <div className="space-y-1 text-sm text-blue-800">
                        <p><span className="font-medium">Account Name:</span> {info.accountName}</p>
                        <p><span className="font-medium">Account Number:</span> {info.accountNumber}</p>
                        <p><span className="font-medium">Amount:</span> PKR {Math.round(finalPrice * 2.8)}</p>
                    </div>
                    <p className="text-xs text-blue-600 mt-2">{info.instructions}</p>
                </div>

                {error && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 mb-4">
                        <AlertCircle className="w-4 h-4" />
                        <span className="text-sm">{error}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            Sender Name *
                        </label>
                        <input
                            type="text"
                            value={senderName}
                            onChange={(e) => setSenderName(e.target.value)}
                            placeholder="Name on payment account"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            Sender Phone / Account
                        </label>
                        <input
                            type="text"
                            value={senderNumber}
                            onChange={(e) => setSenderNumber(e.target.value)}
                            placeholder="03XX-XXXXXXX"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            Transaction Reference
                        </label>
                        <input
                            type="text"
                            value={reference}
                            onChange={(e) => setReference(e.target.value)}
                            placeholder="TRX-XXXXXX"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            Screenshot URL *
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="url"
                                value={screenshotUrl}
                                onChange={(e) => setScreenshotUrl(e.target.value)}
                                placeholder="https://... (upload to Imgur or similar)"
                                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                required
                            />
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                            Upload your payment screenshot to Imgur and paste the link here
                        </p>
                    </div>

                    <Button type="submit" isLoading={isLoading} className="w-full">
                        <Upload className="w-4 h-4 mr-2" />
                        Submit Payment for Review
                    </Button>
                </form>
            </Card>
        </div>
    );
}
