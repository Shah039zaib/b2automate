/**
 * Analytics Loader
 * 
 * Lazy loads Google Analytics and Facebook Pixel based on settings
 */

import { useEffect, useRef } from 'react';

interface AnalyticsConfig {
    gaEnabled: boolean;
    gaMeasurementId: string;
    fbPixelEnabled: boolean;
    fbPixelId: string;
}

let gaLoaded = false;
let fbLoaded = false;

/**
 * Load Google Analytics GA4 script
 */
function loadGoogleAnalytics(measurementId: string) {
    if (gaLoaded || !measurementId) return;

    // Don't load in development
    if (import.meta.env.DEV) {
        console.log('[Analytics] GA4 disabled in development');
        return;
    }

    gaLoaded = true;

    // Create gtag script
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.appendChild(script);

    // Initialize gtag
    window.dataLayer = window.dataLayer || [];
    function gtag(...args: any[]) {
        window.dataLayer.push(args);
    }
    gtag('js', new Date());
    gtag('config', measurementId);

    // Expose gtag globally
    (window as any).gtag = gtag;

    console.log('[Analytics] GA4 loaded:', measurementId);
}

/**
 * Load Facebook/Meta Pixel script
 */
function loadFacebookPixel(pixelId: string) {
    if (fbLoaded || !pixelId) return;

    // Don't load in development
    if (import.meta.env.DEV) {
        console.log('[Analytics] FB Pixel disabled in development');
        return;
    }

    fbLoaded = true;

    // Facebook Pixel base code
    (function (f: any, b: any, e: any, v: any, n?: any, t?: any, s?: any) {
        if (f.fbq) return;
        n = f.fbq = function () {
            n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
        };
        if (!f._fbq) f._fbq = n;
        n.push = n;
        n.loaded = !0;
        n.version = '2.0';
        n.queue = [];
        t = b.createElement(e);
        t.async = !0;
        t.src = v;
        s = b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t, s);
    })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

    (window as any).fbq('init', pixelId);
    (window as any).fbq('track', 'PageView');

    console.log('[Analytics] FB Pixel loaded:', pixelId);
}

/**
 * Remove analytics scripts
 */
function unloadGoogleAnalytics() {
    if (!gaLoaded) return;

    const scripts = document.querySelectorAll('script[src*="googletagmanager.com"]');
    scripts.forEach(script => script.remove());

    delete (window as any).gtag;
    delete (window as any).dataLayer;

    gaLoaded = false;
    console.log('[Analytics] GA4 unloaded');
}

function unloadFacebookPixel() {
    if (!fbLoaded) return;

    const scripts = document.querySelectorAll('script[src*="facebook.net"]');
    scripts.forEach(script => script.remove());

    delete (window as any).fbq;
    delete (window as any)._fbq;

    fbLoaded = false;
    console.log('[Analytics] FB Pixel unloaded');
}

/**
 * Hook to manage analytics loading
 */
export function useAnalytics(config: AnalyticsConfig | null) {
    const prevConfig = useRef<AnalyticsConfig | null>(null);

    useEffect(() => {
        if (!config) return;

        // Handle GA changes
        if (config.gaEnabled && config.gaMeasurementId) {
            loadGoogleAnalytics(config.gaMeasurementId);
        } else if (!config.gaEnabled && prevConfig.current?.gaEnabled) {
            unloadGoogleAnalytics();
        }

        // Handle FB Pixel changes
        if (config.fbPixelEnabled && config.fbPixelId) {
            loadFacebookPixel(config.fbPixelId);
        } else if (!config.fbPixelEnabled && prevConfig.current?.fbPixelEnabled) {
            unloadFacebookPixel();
        }

        prevConfig.current = config;
    }, [config]);
}

/**
 * Track custom event in GA4
 */
export function trackEvent(eventName: string, params?: Record<string, any>) {
    if ((window as any).gtag) {
        (window as any).gtag('event', eventName, params);
    }
}

/**
 * Track Facebook Pixel event
 */
export function trackFBEvent(eventName: string, params?: Record<string, any>) {
    if ((window as any).fbq) {
        (window as any).fbq('track', eventName, params);
    }
}

// TypeScript declarations
declare global {
    interface Window {
        dataLayer: any[];
        gtag: (...args: any[]) => void;
        fbq: (...args: any[]) => void;
    }
}
