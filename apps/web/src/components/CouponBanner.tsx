/**
 * Coupon Banner Component
 * 
 * Global promotional banner controlled by Super Admin
 * Shows on Landing and Pricing pages
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Tag, Copy, Check } from 'lucide-react';
import { useGrowth } from '../contexts/GrowthContext';

export interface CouponConfig {
    enabled: boolean;
    code: string;
    discountType: 'percentage' | 'fixed';
    discountValue: number;
    message: string;
    expiry: string | null;
    stripeCouponId: string;
}

/**
 * Get current coupon for Stripe checkout
 */
export function getStripeCouponId(): string | null {
    // Read from localStorage
    const stored = localStorage.getItem('b2_active_coupon');
    if (stored) {
        try {
            const coupon = JSON.parse(stored) as CouponConfig;
            if (coupon.enabled && coupon.stripeCouponId) {
                // Check expiry
                if (coupon.expiry && new Date(coupon.expiry) < new Date()) {
                    localStorage.removeItem('b2_active_coupon');
                    return null;
                }
                return coupon.stripeCouponId;
            }
        } catch (e) {
            return null;
        }
    }
    return null;
}

/**
 * Coupon Banner Component
 */
export function CouponBanner() {
    const { coupon, isVisible, hideBanner } = useGrowth();
    const [copied, setCopied] = useState(false);

    // Don't render if no coupon or hidden
    if (!coupon || !coupon.enabled || !isVisible) {
        return null;
    }

    // Check expiry
    if (coupon.expiry && new Date(coupon.expiry) < new Date()) {
        return null;
    }

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(coupon.code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (e) {
            console.error('Failed to copy coupon:', e);
        }
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="bg-gradient-to-r from-primary-600 to-primary-700 text-white relative z-50"
            >
                <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-center gap-3 text-sm">
                    <Tag className="w-4 h-4 flex-shrink-0" />
                    <span className="font-medium">
                        {coupon.message || `Get ${coupon.discountType === 'percentage' ? `${coupon.discountValue}%` : `$${coupon.discountValue}`} off!`}
                    </span>

                    {/* Coupon Code Badge */}
                    <button
                        onClick={handleCopy}
                        className="inline-flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-md font-mono text-xs transition-colors"
                    >
                        {coupon.code}
                        {copied ? (
                            <Check className="w-3 h-3" />
                        ) : (
                            <Copy className="w-3 h-3" />
                        )}
                    </button>

                    {/* Expiry */}
                    {coupon.expiry && (
                        <span className="text-primary-200 text-xs hidden sm:inline">
                            Expires {new Date(coupon.expiry).toLocaleDateString()}
                        </span>
                    )}

                    {/* Close button */}
                    <button
                        onClick={hideBanner}
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-white/10 rounded transition-colors"
                        aria-label="Close banner"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
