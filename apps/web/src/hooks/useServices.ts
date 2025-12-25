import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { servicesApi, Service, CreateServiceRequest } from '../lib/api';

export function useServices() {
    return useQuery({
        queryKey: ['services'],
        queryFn: async () => {
            const response = await servicesApi.list();
            return response.data;
        },
    });
}

export function useCreateService() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: CreateServiceRequest) => {
            const response = await servicesApi.create(data);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['services'] });
        },
    });
}

export function useUpdateService() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, data }: { id: string; data: Partial<CreateServiceRequest & { isActive: boolean }> }) => {
            const response = await servicesApi.update(id, data);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['services'] });
        },
    });
}

export function useDeleteService() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const response = await servicesApi.delete(id);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['services'] });
        },
    });
}

export type { Service };

