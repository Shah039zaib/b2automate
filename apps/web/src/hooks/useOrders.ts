import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ordersApi, Order, OrderStatus } from '../lib/api';

export function useOrders(status?: OrderStatus) {
    return useQuery({
        queryKey: ['orders', status],
        queryFn: async () => {
            const response = await ordersApi.list(status);
            return response.data;
        },
    });
}

export function useApproveOrder() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (orderId: string) => {
            const response = await ordersApi.approve(orderId);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['orders'] });
        },
    });
}

export function useRejectOrder() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (orderId: string) => {
            const response = await ordersApi.reject(orderId);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['orders'] });
        },
    });
}

export type { Order, OrderStatus };
