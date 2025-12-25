import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { SkeletonTable } from '../components/ui/Skeleton';
import { Upload, Plus, Edit2, Trash2, X, Box, Check, AlertCircle } from 'lucide-react';
import { useServices, useCreateService, useUpdateService, useDeleteService, Service } from '../hooks/useServices';

export function Services() {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingService, setEditingService] = useState<Service | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Form state
    const [formName, setFormName] = useState('');
    const [formDescription, setFormDescription] = useState('');
    const [formPrice, setFormPrice] = useState('');

    const { data: services, isLoading, isError } = useServices();
    const createService = useCreateService();
    const updateService = useUpdateService();
    const deleteService = useDeleteService();

    const openCreateModal = () => {
        setEditingService(null);
        setFormName('');
        setFormDescription('');
        setFormPrice('');
        setError(null);
        setIsModalOpen(true);
    };

    const openEditModal = (service: Service) => {
        setEditingService(service);
        setFormName(service.name);
        setFormDescription(service.description);
        setFormPrice(parseFloat(service.price).toString());
        setError(null);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingService(null);
        setError(null);
    };

    const showSuccess = (message: string) => {
        setSuccessMessage(message);
        setTimeout(() => setSuccessMessage(null), 3000);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!formName.trim() || !formDescription.trim() || !formPrice.trim()) {
            setError('All fields are required');
            return;
        }

        const price = parseFloat(formPrice);
        if (isNaN(price) || price <= 0) {
            setError('Please enter a valid price');
            return;
        }

        try {
            if (editingService) {
                await updateService.mutateAsync({
                    id: editingService.id,
                    data: { name: formName, description: formDescription, price }
                });
                showSuccess('Service updated successfully');
            } else {
                await createService.mutateAsync({
                    name: formName,
                    description: formDescription,
                    price
                });
                showSuccess('Service created successfully');
            }
            closeModal();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to save service');
        }
    };

    const handleToggleActive = async (service: Service) => {
        try {
            await updateService.mutateAsync({
                id: service.id,
                data: { isActive: !service.isActive }
            });
            showSuccess(`Service ${service.isActive ? 'deactivated' : 'activated'}`);
        } catch (err) {
            setError('Failed to update service status');
        }
    };

    const handleDelete = async (service: Service) => {
        if (!confirm(`Are you sure you want to delete "${service.name}"?`)) return;

        try {
            const result = await deleteService.mutateAsync(service.id);
            if (result.softDeleted) {
                showSuccess('Service deactivated (has existing orders)');
            } else {
                showSuccess('Service deleted successfully');
            }
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to delete service');
        }
    };

    const isSaving = createService.isPending || updateService.isPending || deleteService.isPending;

    return (
        <div className="space-y-6">
            {/* Success Toast */}
            <AnimatePresence>
                {successMessage && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg"
                    >
                        <Check className="w-5 h-5" />
                        <span>{successMessage}</span>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-slate-900">Services Catalog</h2>
                <div className="flex gap-3">
                    <Button variant="outline">
                        <Upload className="w-4 h-4 mr-2" /> Import CSV
                    </Button>
                    <Button onClick={openCreateModal}>
                        <Plus className="w-4 h-4 mr-2" /> Add Service
                    </Button>
                </div>
            </div>

            {isLoading ? (
                <SkeletonTable rows={3} />
            ) : isError ? (
                <Card className="p-8 text-center">
                    <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-400" />
                    <p className="text-slate-600">Failed to load services. Please try again.</p>
                </Card>
            ) : services && services.length > 0 ? (
                <Card className="p-0 overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-4 font-semibold text-slate-700">Name</th>
                                <th className="px-6 py-4 font-semibold text-slate-700">Description</th>
                                <th className="px-6 py-4 font-semibold text-slate-700">Price</th>
                                <th className="px-6 py-4 font-semibold text-slate-700">Status</th>
                                <th className="px-6 py-4 font-semibold text-slate-700 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {services.map((service) => (
                                <tr key={service.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4 font-medium text-slate-900">{service.name}</td>
                                    <td className="px-6 py-4 text-slate-500 max-w-xs truncate">{service.description}</td>
                                    <td className="px-6 py-4 font-medium text-slate-700">
                                        ${parseFloat(service.price).toFixed(2)}
                                    </td>
                                    <td className="px-6 py-4">
                                        <button
                                            onClick={() => handleToggleActive(service)}
                                            className={`px-2 py-1 rounded-full text-xs font-bold cursor-pointer transition-colors ${service.isActive
                                                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                                }`}
                                        >
                                            {service.isActive ? 'Active' : 'Inactive'}
                                        </button>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button
                                            onClick={() => openEditModal(service)}
                                            className="text-slate-400 hover:text-primary-600 mr-3"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(service)}
                                            className="text-slate-400 hover:text-red-600"
                                            title="Delete service"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Card>
            ) : (
                <Card>
                    <EmptyState
                        icon={Box}
                        title="No services yet"
                        description="Create your first service to start selling via WhatsApp."
                        action={{ label: 'Add Service', onClick: openCreateModal }}
                    />
                </Card>
            )}

            {/* Create/Edit Modal */}
            <AnimatePresence>
                {isModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
                        onClick={closeModal}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white rounded-xl shadow-xl max-w-md w-full p-6"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-slate-900">
                                    {editingService ? 'Edit Service' : 'Add New Service'}
                                </h3>
                                <button onClick={closeModal} className="text-slate-400 hover:text-slate-600">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-4">
                                {error && (
                                    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                        <span>{error}</span>
                                    </div>
                                )}

                                <Input
                                    label="Service Name"
                                    placeholder="e.g. Premium Consultation"
                                    value={formName}
                                    onChange={(e) => setFormName(e.target.value)}
                                    required
                                />
                                <div className="w-full">
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                                    <textarea
                                        className="flex w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all shadow-sm resize-none"
                                        placeholder="Describe your service..."
                                        rows={3}
                                        value={formDescription}
                                        onChange={(e) => setFormDescription(e.target.value)}
                                        required
                                    />
                                </div>
                                <Input
                                    label="Price (USD)"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    placeholder="99.99"
                                    value={formPrice}
                                    onChange={(e) => setFormPrice(e.target.value)}
                                    required
                                />

                                <div className="flex justify-end gap-3 pt-4">
                                    <Button type="button" variant="outline" onClick={closeModal}>
                                        Cancel
                                    </Button>
                                    <Button type="submit" isLoading={isSaving}>
                                        {editingService ? 'Save Changes' : 'Create Service'}
                                    </Button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
