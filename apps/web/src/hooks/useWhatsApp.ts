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
            // Poll every 3 seconds if waiting for QR or connecting
            const status = query.state.data?.status;
            if (status === 'QR_READY' || status === 'CONNECTING') {
                return 3000;
            }
            // Poll every 30 seconds when connected
            if (status === 'CONNECTED') {
                return 30000;
            }
            // Poll every 5 seconds otherwise
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
