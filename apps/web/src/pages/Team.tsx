import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { Users, Plus, Trash2, X, Check, AlertCircle, Loader2, Shield, User } from 'lucide-react';
import api from '../lib/api';

interface TeamMember {
    id: string;
    email: string;
    role: 'TENANT_ADMIN' | 'STAFF';
    createdAt: string;
}

export function Team() {
    const [members, setMembers] = useState<TeamMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Form state
    const [formEmail, setFormEmail] = useState('');
    const [formPassword, setFormPassword] = useState('');
    const [formRole, setFormRole] = useState<'TENANT_ADMIN' | 'STAFF'>('STAFF');
    const [formLoading, setFormLoading] = useState(false);

    useEffect(() => {
        loadMembers();
    }, []);

    const loadMembers = async () => {
        try {
            const res = await api.get<TeamMember[]>('/tenant/users');
            setMembers(res.data);
        } catch (err) {
            setError('Failed to load team members');
        } finally {
            setLoading(false);
        }
    };

    const showSuccess = (msg: string) => {
        setSuccess(msg);
        setTimeout(() => setSuccess(null), 3000);
    };

    const openModal = () => {
        setFormEmail('');
        setFormPassword('');
        setFormRole('STAFF');
        setError(null);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setError(null);
    };

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormLoading(true);
        setError(null);

        if (!formEmail || !formPassword) {
            setError('Email and password are required');
            setFormLoading(false);
            return;
        }

        try {
            await api.post('/tenant/users', {
                email: formEmail,
                password: formPassword,
                role: formRole
            });
            showSuccess('Team member added successfully');
            closeModal();
            loadMembers();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to add team member');
        } finally {
            setFormLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to remove this team member?')) return;

        setDeleting(id);
        try {
            await api.delete(`/tenant/users/${id}`);
            showSuccess('Team member removed');
            setMembers(prev => prev.filter(m => m.id !== id));
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to remove team member');
        } finally {
            setDeleting(null);
        }
    };

    const getRoleBadge = (role: string) => {
        if (role === 'TENANT_ADMIN') {
            return (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-primary-100 text-primary-700">
                    <Shield className="w-3 h-3" />
                    Admin
                </span>
            );
        }
        return (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                <User className="w-3 h-3" />
                Staff
            </span>
        );
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Success Toast */}
            {success && (
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg"
                >
                    <Check className="w-5 h-5" />
                    <span>{success}</span>
                </motion.div>
            )}

            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-slate-900">Team Management</h2>
                <Button onClick={openModal}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Member
                </Button>
            </div>

            {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    <span>{error}</span>
                </div>
            )}

            {members.length > 0 ? (
                <Card className="p-0 overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-4 font-semibold text-slate-700">Email</th>
                                <th className="px-6 py-4 font-semibold text-slate-700">Role</th>
                                <th className="px-6 py-4 font-semibold text-slate-700">Joined</th>
                                <th className="px-6 py-4 font-semibold text-slate-700 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {members.map((member) => (
                                <tr key={member.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4 font-medium text-slate-900">{member.email}</td>
                                    <td className="px-6 py-4">{getRoleBadge(member.role)}</td>
                                    <td className="px-6 py-4 text-slate-500">
                                        {new Date(member.createdAt).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button
                                            onClick={() => handleDelete(member.id)}
                                            disabled={deleting === member.id}
                                            className="text-slate-400 hover:text-red-600 disabled:opacity-50"
                                        >
                                            {deleting === member.id ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <Trash2 className="w-4 h-4" />
                                            )}
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
                        icon={Users}
                        title="No team members yet"
                        description="Add team members to help manage your business."
                        action={{ label: 'Add Member', onClick: openModal }}
                    />
                </Card>
            )}

            {/* Add Member Modal */}
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
                                <h3 className="text-lg font-bold text-slate-900">Add Team Member</h3>
                                <button onClick={closeModal} className="text-slate-400 hover:text-slate-600">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <form onSubmit={handleInvite} className="space-y-4">
                                <Input
                                    label="Email"
                                    type="email"
                                    value={formEmail}
                                    onChange={(e) => setFormEmail(e.target.value)}
                                    placeholder="team@example.com"
                                    required
                                />
                                <Input
                                    label="Password"
                                    type="password"
                                    value={formPassword}
                                    onChange={(e) => setFormPassword(e.target.value)}
                                    placeholder="Create a password"
                                    required
                                />
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                                    <select
                                        value={formRole}
                                        onChange={(e) => setFormRole(e.target.value as any)}
                                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                    >
                                        <option value="STAFF">Staff</option>
                                        <option value="TENANT_ADMIN">Admin</option>
                                    </select>
                                </div>

                                <div className="flex justify-end gap-3 pt-4">
                                    <Button type="button" variant="outline" onClick={closeModal}>
                                        Cancel
                                    </Button>
                                    <Button type="submit" isLoading={formLoading}>
                                        Add Member
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
