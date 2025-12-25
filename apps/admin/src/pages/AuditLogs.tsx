import { useState, useEffect } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Loader2, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { adminApi, AuditLogResponse } from '../lib/api';

export function AuditLogs() {
    const [data, setData] = useState<AuditLogResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [eventType, setEventType] = useState('');
    const [tenantId, setTenantId] = useState('');
    const [page, setPage] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const LIMIT = 25;

    useEffect(() => {
        loadLogs();
    }, [page, eventType, tenantId]);

    const loadLogs = async () => {
        setLoading(true);
        try {
            const res = await adminApi.getAuditLogs({
                eventType: eventType || undefined,
                tenantId: tenantId || undefined,
                limit: LIMIT,
                offset: page * LIMIT
            });
            setData(res.data);
        } catch (err) {
            setError('Failed to load audit logs');
        } finally {
            setLoading(false);
        }
    };

    const getEventBadge = (type: string) => {
        if (type.includes('CREATED')) {
            return <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">{type}</span>;
        }
        if (type.includes('SUSPENDED') || type.includes('DELETED') || type.includes('ARCHIVED')) {
            return <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium">{type}</span>;
        }
        if (type.includes('ACTIVATED') || type.includes('APPROVED')) {
            return <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">{type}</span>;
        }
        if (type.includes('AI_')) {
            return <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium">{type}</span>;
        }
        return <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs font-medium">{type}</span>;
    };

    const formatDate = (date: string) => {
        return new Date(date).toLocaleString();
    };

    const totalPages = data ? Math.ceil(data.total / LIMIT) : 0;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-slate-900">System Audit Logs</h2>
            </div>

            {/* Filters */}
            <Card className="p-4">
                <div className="flex flex-wrap gap-4">
                    <div className="flex-1 min-w-[200px]">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Tenant ID</label>
                        <input
                            type="text"
                            value={tenantId}
                            onChange={(e) => { setTenantId(e.target.value); setPage(0); }}
                            placeholder="Filter by tenant ID..."
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                        />
                    </div>
                    <div className="w-[200px]">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Event Type</label>
                        <select
                            value={eventType}
                            onChange={(e) => { setEventType(e.target.value); setPage(0); }}
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                        >
                            <option value="">All Events</option>
                            <option value="TENANT_CREATED">Tenant Created</option>
                            <option value="TENANT_ACTIVATED">Tenant Activated</option>
                            <option value="TENANT_SUSPENDED">Tenant Suspended</option>
                            <option value="ORDER_APPROVED">Order Approved</option>
                            <option value="ORDER_REJECTED">Order Rejected</option>
                            <option value="AI_RESPONSE_GENERATED">AI Response</option>
                            <option value="AI_MANUAL_TAKEOVER_REQUESTED">AI Escalation</option>
                        </select>
                    </div>
                    <div className="flex items-end">
                        <Button
                            variant="outline"
                            onClick={() => { setEventType(''); setTenantId(''); setPage(0); }}
                        >
                            Clear Filters
                        </Button>
                    </div>
                </div>
            </Card>

            {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
                    <AlertCircle className="w-4 h-4" />
                    <span>{error}</span>
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
                                <th className="px-4 py-3 font-semibold text-slate-700">Timestamp</th>
                                <th className="px-4 py-3 font-semibold text-slate-700">Event</th>
                                <th className="px-4 py-3 font-semibold text-slate-700">Tenant</th>
                                <th className="px-4 py-3 font-semibold text-slate-700">Actor</th>
                                <th className="px-4 py-3 font-semibold text-slate-700">IP</th>
                                <th className="px-4 py-3 font-semibold text-slate-700">Details</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {data?.logs.map((log) => (
                                <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                                        {formatDate(log.timestamp)}
                                    </td>
                                    <td className="px-4 py-3">{getEventBadge(log.eventType)}</td>
                                    <td className="px-4 py-3 text-slate-600">
                                        {log.tenant?.name || log.tenantId.slice(0, 8) + '...'}
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">
                                        {log.actor?.email || '-'}
                                    </td>
                                    <td className="px-4 py-3 text-slate-400 text-xs font-mono">
                                        {log.ipAddress || '-'}
                                    </td>
                                    <td className="px-4 py-3">
                                        {log.metadata && (
                                            <details className="cursor-pointer">
                                                <summary className="text-primary-600 text-xs">View</summary>
                                                <pre className="mt-2 p-2 bg-slate-100 rounded text-xs overflow-auto max-w-xs">
                                                    {JSON.stringify(log.metadata, null, 2)}
                                                </pre>
                                            </details>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {data?.logs.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                                        No audit logs found
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
        </div>
    );
}
