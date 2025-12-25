import { useState, useEffect } from 'react';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { MessageSquare, Bot, User, Phone, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import api from '../lib/api';

interface Conversation {
    id: string;
    type: string;
    input: string;
    output: string;
    customerJid: string;
    timestamp: string;
}

export function Inbox() {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadConversations();
    }, []);

    const loadConversations = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get<Conversation[]>('/tenant/conversations?limit=100');
            setConversations(res.data);
        } catch (err) {
            setError('Failed to load conversations');
        } finally {
            setLoading(false);
        }
    };

    const formatJid = (jid: string) => {
        // Format phone number from JID (e.g., "1234567890@s.whatsapp.net" -> "+1234567890")
        if (jid.includes('@')) {
            return '+' + jid.split('@')[0];
        }
        return jid;
    };

    const getEventTypeBadge = (type: string) => {
        switch (type) {
            case 'AI_RESPONSE_GENERATED':
                return <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">AI Response</span>;
            case 'CUSTOMER_DETAILS_COLLECTED':
                return <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">Details Collected</span>;
            case 'AI_MANUAL_TAKEOVER_REQUESTED':
                return <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded-full">Escalation</span>;
            default:
                return <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-full">{type}</span>;
        }
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
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-slate-900">Conversations</h2>
                <button
                    onClick={loadConversations}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                >
                    <RefreshCw className="w-4 h-4" />
                    Refresh
                </button>
            </div>

            {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    <span>{error}</span>
                </div>
            )}

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-700">
                    <strong>Note:</strong> This view shows AI conversation logs. Full messaging will be available in a future update.
                </p>
            </div>

            {conversations.length > 0 ? (
                <div className="space-y-3">
                    {conversations.map((conv) => (
                        <Card key={conv.id} className="p-4">
                            <div className="flex items-start gap-3">
                                <div className="p-2 bg-slate-100 rounded-lg">
                                    <MessageSquare className="w-5 h-5 text-slate-500" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="flex items-center gap-1 text-sm text-slate-600">
                                            <Phone className="w-3 h-3" />
                                            <span className="font-medium">{formatJid(conv.customerJid)}</span>
                                        </div>
                                        {getEventTypeBadge(conv.type)}
                                        <span className="text-xs text-slate-400 ml-auto">
                                            {new Date(conv.timestamp).toLocaleString()}
                                        </span>
                                    </div>

                                    {conv.input && (
                                        <div className="flex items-start gap-2 mb-2">
                                            <User className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                                            <p className="text-sm text-slate-700 bg-slate-50 px-3 py-2 rounded-lg">
                                                {conv.input}
                                            </p>
                                        </div>
                                    )}

                                    {conv.output && (
                                        <div className="flex items-start gap-2">
                                            <Bot className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />
                                            <p className="text-sm text-slate-700 bg-primary-50 px-3 py-2 rounded-lg">
                                                {conv.output}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            ) : (
                <Card>
                    <EmptyState
                        icon={MessageSquare}
                        title="No conversations yet"
                        description="AI conversation logs will appear here once customers start messaging."
                    />
                </Card>
            )}
        </div>
    );
}
