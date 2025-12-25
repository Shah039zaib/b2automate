import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import {
    Building2, Plus, Search, Check, X, Pause, Trash2,
    Play, Archive, AlertCircle, Loader2, ChevronLeft, ChevronRight
} from 'lucide-react';
import { adminApi, TenantListResponse } from '../lib/api';

export function Tenants() {
    const [data, setData] = useState<TenantListResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [page, setPage] = useState(0);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Create form
    const [newName, setNewName] = useState('');
    const [creating, setCreating] = useState(false);

    const LIMIT = 10;

    useEffect(() => {
        loadTenants();
    }, [page, statusFilter]);

    const loadTenants = async () => {
        setLoading(true);
        try {
            const res = await adminApi.listTenants({
                status: statusFilter || undefined,
                search: search || undefined,
                limit: LIMIT,
                offset: page * LIMIT
            });
            setData(res.data);
        } catch (err) {
            setError('Failed to load tenants');
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(0);
        loadTenants();
    };

    const showSuccess = (msg: string) => {
        setSuccess(msg);
        setTimeout(() => setSuccess(null), 3000);
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName.trim()) return;

        setCreating(true);
        try {
            await adminApi.createTenant({ name: newName });
            showSuccess('Tenant created successfully');
            setNewName('');
            setIsModalOpen(false);
            loadTenants();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to create tenant');
        } finally {
            setCreating(false);
        }
    };

    const handleAction = async (tenantId: string, action: 'activate' | 'suspend' | 'archive' | 'delete') => {
        if (action === 'delete') {
            if (!confirm('PERMANENTLY delete this tenant and ALL its data? This cannot be undone!')) return;
        }

        setActionLoading(`${tenantId}-${action}`);
        try {
            switch (action) {
                case 'activate':
                    await adminApi.activateTenant(tenantId);
                    showSuccess('Tenant activated');
                    break;
                case 'suspend':
                    await adminApi.suspendTenant(tenantId);
                    showSuccess('Tenant suspended');
                    break;
                case 'archive':
                    await adminApi.archiveTenant(tenantId);
                    showSuccess('Tenant archived');
                    break;
                case 'delete':
                    await adminApi.deleteTenant(tenantId);
                    showSuccess('Tenant permanently deleted');
                    break;
            }
            loadTenants();
        } catch (err: any) {
            setError(err.response?.data?.error || `Failed to ${action} tenant`);
        } finally {
            setActionLoading(null);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'ACTIVE':
                return <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">Active</span>;
            case 'SUSPENDED':
                return <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">Suspended</span>;
            case 'ARCHIVED':
                return <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">Archived</span>;
            default:
                return <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">{status}</span>;
        }
    };

    const totalPages = data ? Math.ceil(data.total / LIMIT) : 0;

    return (
        <div className="space-y-6">
            {/* Success Toast */}
            <AnimatePresence>
                {success && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg"
                    >
                        <Check className="w-5 h-5" />
                        <span>{success}</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Header */}
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-slate-900">Tenant Management</h2>
                <Button onClick={() => setIsModalOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Tenant
                </Button>
            </div>

            {/* Filters */}
            <Card className="p-4">
                <form onSubmit={handleSearch} className="flex flex-wrap gap-4">
                    <div className="flex-1 min-w-[200px]">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search tenants..."
                                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            />
                        </div>
                    </div>
                    <select
                        value={statusFilter}
                        onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
                        className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    >
                        <option value="">All Status</option>
                        <option value="ACTIVE">Active</option>
                        <option value="SUSPENDED">Suspended</option>
                        <option value="ARCHIVED">Archived</option>
                    </select>
                    <Button type="submit">Search</Button>
                </form>
            </Card>

            {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
                    <AlertCircle className="w-4 h-4" />
                    <span>{error}</span>
                    <button onClick={() => setError(null)} className="ml-auto">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Table */}
            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
                </div>
            ) : (
                <Card className="p-0 overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-4 font-semibold text-slate-700">Tenant</th>
                                <th className="px-6 py-4 font-semibold text-slate-700">Status</th>
                                <th className="px-6 py-4 font-semibold text-slate-700">Users</th>
                                <th className="px-6 py-4 font-semibold text-slate-700">Services</th>
                                <th className="px-6 py-4 font-semibold text-slate-700">Orders</th>
                                <th className="px-6 py-4 font-semibold text-slate-700">AI</th>
                                <th className="px-6 py-4 font-semibold text-slate-700 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {data?.tenants.map((tenant) => (
                                <tr key={tenant.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                                                <Building2 className="w-5 h-5 text-primary-600" />
                                            </div>
                                            <div>
                                                <p className="font-medium text-slate-900">{tenant.name}</p>
                                                <p className="text-xs text-slate-400">ID: {tenant.id.slice(0, 8)}...</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">{getStatusBadge(tenant.status)}</td>
                                    <td className="px-6 py-4 text-slate-600">{tenant._count?.users || 0}</td>
                                    <td className="px-6 py-4 text-slate-600">{tenant._count?.services || 0}</td>
                                    <td className="px-6 py-4 text-slate-600">{tenant._count?.orders || 0}</td>
                                    <td className="px-6 py-4">
                                        {tenant.isAiEnabled ? (
                                            <span className="text-green-600 text-xs font-medium">ON</span>
                                        ) : (
                                            <span className="text-red-600 text-xs font-medium">OFF</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            {tenant.status === 'ACTIVE' && (
                                                <button
                                                    onClick={() => handleAction(tenant.id, 'suspend')}
                                                    disabled={!!actionLoading}
                                                    className="p-1.5 text-amber-600 hover:bg-amber-50 rounded"
                                                    title="Suspend"
                                                >
                                                    <Pause className="w-4 h-4" />
                                                </button>
                                            )}
                                            {tenant.status === 'SUSPENDED' && (
                                                <button
                                                    onClick={() => handleAction(tenant.id, 'activate')}
                                                    disabled={!!actionLoading}
                                                    className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                                                    title="Activate"
                                                >
                                                    <Play className="w-4 h-4" />
                                                </button>
                                            )}
                                            {tenant.status !== 'ARCHIVED' && (
                                                <button
                                                    onClick={() => handleAction(tenant.id, 'archive')}
                                                    disabled={!!actionLoading}
                                                    className="p-1.5 text-slate-600 hover:bg-slate-100 rounded"
                                                    title="Archive"
                                                >
                                                    <Archive className="w-4 h-4" />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleAction(tenant.id, 'delete')}
                                                disabled={!!actionLoading}
                                                className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                                                title="Permanently Delete"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {data?.tenants.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                                        No tenants found
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </Card>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-500">
                        Showing {page * LIMIT + 1} - {Math.min((page + 1) * LIMIT, data?.total || 0)} of {data?.total || 0}
                    </p>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => Math.max(0, p - 1))}
                            disabled={page === 0}
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => p + 1)}
                            disabled={page >= totalPages - 1}
                        >
                            <ChevronRight className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            )}

            {/* Create Modal */}
            <AnimatePresence>
                {isModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
                        onClick={() => setIsModalOpen(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white rounded-xl shadow-xl max-w-md w-full p-6"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-slate-900">Create New Tenant</h3>
                                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <form onSubmit={handleCreate} className="space-y-4">
                                <Input
                                    label="Tenant Name"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    placeholder="Acme Corp"
                                    required
                                />
                                <div className="flex justify-end gap-3 pt-4">
                                    <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                                        Cancel
                                    </Button>
                                    <Button type="submit" isLoading={creating}>
                                        Create Tenant
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
