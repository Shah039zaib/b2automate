import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { whatsappApi, WhatsAppStatus } from '../lib/api';

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
            // Fast polling during connection to catch QR quickly
            if (!status || status === 'CONNECTING' || status === 'DISCONNECTED') {
                return 1000; // Poll every 1s until QR appears
            }
            // Faster polling while showing QR (expires in 60s)
            if (status === 'QR_READY') {
                return 2000; // Poll every 2s while showing QR
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
