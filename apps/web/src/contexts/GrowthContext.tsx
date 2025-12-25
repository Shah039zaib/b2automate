/**
 * Growth Context Provider
 * 
 * Loads and provides growth settings (analytics, coupon) to the app
 */

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { growthApi, PublicGrowthSettings } from '../lib/api';
import { useAnalytics } from '../lib/analytics';
import { CouponConfig } from '../components/CouponBanner';

interface GrowthContextType {
    settings: PublicGrowthSettings | null;
    coupon: CouponConfig | null;
    isLoading: boolean;
    error: string | null;
    isVisible: boolean;
    hideBanner: () => void;
}

const GrowthContext = createContext<GrowthContextType | null>(null);

export function GrowthProvider({ children }: { children: ReactNode }) {
    const [settings, setSettings] = useState<PublicGrowthSettings | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            setIsLoading(true);
            const res = await growthApi.getSettings();
            setSettings(res.data);

            // Store coupon in localStorage for Stripe checkout
            if (res.data.couponEnabled && res.data.couponStripeCouponId) {
                localStorage.setItem('b2_active_coupon', JSON.stringify({
                    enabled: res.data.couponEnabled,
                    code: res.data.couponCode,
                    discountType: res.data.couponDiscountType,
                    discountValue: res.data.couponDiscountValue,
                    message: res.data.couponMessage,
                    expiry: res.data.couponExpiry,
                    stripeCouponId: res.data.couponStripeCouponId
                }));
            } else {
                localStorage.removeItem('b2_active_coupon');
            }

            setError(null);
        } catch (err: any) {
            console.warn('[Growth] Failed to load settings, using defaults:', err.message);
            // Use defaults - all features disabled
            setSettings({
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
                couponStripeCouponId: ''
            });
        } finally {
            setIsLoading(false);
        }
    };

    // Load analytics based on settings
    useAnalytics(settings ? {
        gaEnabled: settings.gaEnabled,
        gaMeasurementId: settings.gaMeasurementId,
        fbPixelEnabled: settings.fbPixelEnabled,
        fbPixelId: settings.fbPixelId
    } : null);

    // Build coupon config
    const coupon: CouponConfig | null = settings?.couponEnabled ? {
        enabled: settings.couponEnabled,
        code: settings.couponCode,
        discountType: settings.couponDiscountType,
        discountValue: settings.couponDiscountValue,
        message: settings.couponMessage,
        expiry: settings.couponExpiry,
        stripeCouponId: settings.couponStripeCouponId
    } : null;

    const hideBanner = () => setIsVisible(false);

    return (
        <GrowthContext.Provider value={{ settings, coupon, isLoading, error, isVisible, hideBanner }}>
            {children}
        </GrowthContext.Provider>
    );
}

export function useGrowth() {
    const context = useContext(GrowthContext);
    if (!context) {
        throw new Error('useGrowth must be used within GrowthProvider');
    }
    return context;
}
