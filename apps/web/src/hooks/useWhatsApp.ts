import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { whatsappApi, WhatsAppStatus } from '../lib/api';
import { useState, useEffect, useRef } from 'react';

export function useWhatsAppStatus(enabled: boolean = true) {
    return useQuery({
        queryKey: ['whatsapp-status'],
        queryFn: async () => {
            const response = await whatsappApi.getStatus();
            return response.data;
        },
        enabled,
        refetchInterval: (query) => {
            const status = query.state.data?.status;
            // Fast polling during connection to catch QR/pairing code quickly
            if (!status || status === 'CONNECTING' || status === 'DISCONNECTED' || status === 'REQUESTING_PAIRING_CODE') {
                return 1000; // Poll every 1s until QR/pairing code appears
            }
            // Faster polling while showing QR or pairing code (expires in 60-120s)
            if (status === 'QR_READY' || status === 'PAIRING_CODE_READY') {
                return 2000; // Poll every 2s while showing QR/pairing code
            }
            // Connected - slow polling for status updates
            if (status === 'CONNECTED') {
                return 30000;
            }
            // Default fallback
            return 5000;
        },
    });
}

/**
 * Hook to track QR code expiration with countdown timer
 * QR codes expire after 60 seconds from generation
 */
export function useQRExpiration(qrCode: string | null | undefined) {
    const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
    const [isExpired, setIsExpired] = useState(false);
    const qrTimestampRef = useRef<number | null>(null);

    useEffect(() => {
        // Reset when QR code changes
        if (qrCode) {
            // New QR code received - record timestamp
            qrTimestampRef.current = Date.now();
            setTimeRemaining(60);
            setIsExpired(false);
        } else {
            // No QR code - reset state
            qrTimestampRef.current = null;
            setTimeRemaining(null);
            setIsExpired(false);
            return;
        }

        // Update countdown every second
        const interval = setInterval(() => {
            if (!qrTimestampRef.current) return;

            const elapsed = Math.floor((Date.now() - qrTimestampRef.current) / 1000);
            const remaining = 60 - elapsed;

            if (remaining <= 0) {
                setTimeRemaining(0);
                setIsExpired(true);
                clearInterval(interval);
            } else {
                setTimeRemaining(remaining);
                setIsExpired(false);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [qrCode]);

    return {
        timeRemaining,
        isExpired,
        shouldRefresh: timeRemaining !== null && timeRemaining < 10, // Suggest refresh when <10s
    };
}

/**
 * Hook to track pairing code expiration
 * Pairing codes expire after 120 seconds from generation
 */
export function usePairingCodeExpiration(pairingCode: string | null | undefined) {
    const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
    const [isExpired, setIsExpired] = useState(false);
    const codeTimestampRef = useRef<number | null>(null);

    useEffect(() => {
        if (pairingCode) {
            codeTimestampRef.current = Date.now();
            setTimeRemaining(120);
            setIsExpired(false);
        } else {
            codeTimestampRef.current = null;
            setTimeRemaining(null);
            setIsExpired(false);
            return;
        }

        const interval = setInterval(() => {
            if (!codeTimestampRef.current) return;

            const elapsed = Math.floor((Date.now() - codeTimestampRef.current) / 1000);
            const remaining = 120 - elapsed;

            if (remaining <= 0) {
                setTimeRemaining(0);
                setIsExpired(true);
                clearInterval(interval);
            } else {
                setTimeRemaining(remaining);
                setIsExpired(false);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [pairingCode]);

    return {
        timeRemaining,
        isExpired,
        shouldRefresh: timeRemaining !== null && timeRemaining < 20, // Suggest refresh when <20s
    };
}

export function useStartSession() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async () => {
            const response = await whatsappApi.startSession();
            return response.data;
        },
        onSuccess: () => {
            // Force immediate status check
            queryClient.invalidateQueries({ queryKey: ['whatsapp-status'] });
        },
    });
}

export function useRequestPairingCode() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (phoneNumber: string) => {
            const response = await whatsappApi.requestPairingCode(phoneNumber);
            return response.data;
        },
        onSuccess: () => {
            // Force immediate status check to get the pairing code
            queryClient.invalidateQueries({ queryKey: ['whatsapp-status'] });
        },
    });
}

export function useStopSession() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async () => {
            const response = await whatsappApi.stopSession();
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['whatsapp-status'] });
        },
    });
}

export type { WhatsAppStatus };

