export const QUEUE_NAMES = {
    OUTBOUND_MESSAGES: 'whatsapp-outbound',
    INBOUND_EVENTS: 'whatsapp-inbound-events',
    WORKER_COMMANDS: 'whatsapp-worker-commands'
} as const;

export interface OutboundMessagePayload {
    tenantId: string;
    sessionId: string; // usually tenantId in this 1:1 model, but good to be explicit
    to: string; // phone number
    type: 'text' | 'image' | 'audio';
    content: string | { url: string; caption?: string };
    metadata?: Record<string, any>;
}

export interface InboundEventPayload {
    tenantId: string;
    event: 'message' | 'connection.update';
    data: any;
}

export interface WorkerCommandPayload {
    type: 'START_SESSION' | 'STOP_SESSION';
    tenantId: string;
}
