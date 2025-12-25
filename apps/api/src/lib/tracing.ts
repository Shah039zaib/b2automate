/**
 * Distributed Tracing Hooks
 * 
 * Provides lightweight tracing infrastructure for observability.
 * Supports pluggable backends:
 * - Console (default, for local dev)
 * - OpenTelemetry (production)
 * - Jaeger, Zipkin, Datadog (via OTEL)
 * 
 * CONFIGURATION:
 * - TRACING_ENABLED: "true" | "false" (default: false)
 * - TRACING_PROVIDER: "console" | "otel" (default: console)
 * - OTEL_EXPORTER_OTLP_ENDPOINT: OTLP endpoint URL
 * - OTEL_SERVICE_NAME: Service name for traces
 * 
 * USAGE:
 *   const span = tracer.startSpan('operation-name');
 *   try {
 *     // ... do work
 *     span.setTag('custom.tag', 'value');
 *   } finally {
 *     span.finish();
 *   }
 * 
 * NOTE: This is a skeleton implementation. For production OTEL,
 * install @opentelemetry/api and @opentelemetry/sdk-trace-node
 */

import { logger } from '@b2automate/logger';

export interface SpanContext {
    traceId: string;
    spanId: string;
    parentId?: string;
}

export interface Span {
    context: SpanContext;
    name: string;
    startTime: number;
    endTime?: number;
    tags: Record<string, string | number | boolean>;
    logs: Array<{ timestamp: number; message: string }>;

    setTag(key: string, value: string | number | boolean): void;
    log(message: string): void;
    finish(): void;
}

export interface Tracer {
    startSpan(name: string, parentContext?: SpanContext): Span;
    extract(headers: Record<string, string>): SpanContext | null;
    inject(context: SpanContext, headers: Record<string, string>): void;
}

// ============================================
// Console Tracer (Default - Local Development)
// ============================================

function generateId(): string {
    return Math.random().toString(16).substring(2, 18);
}

class ConsoleSpan implements Span {
    context: SpanContext;
    name: string;
    startTime: number;
    endTime?: number;
    tags: Record<string, string | number | boolean> = {};
    logs: Array<{ timestamp: number; message: string }> = [];

    constructor(name: string, parentContext?: SpanContext) {
        this.name = name;
        this.startTime = Date.now();
        this.context = {
            traceId: parentContext?.traceId || generateId(),
            spanId: generateId(),
            parentId: parentContext?.spanId
        };
    }

    setTag(key: string, value: string | number | boolean): void {
        this.tags[key] = value;
    }

    log(message: string): void {
        this.logs.push({ timestamp: Date.now(), message });
    }

    finish(): void {
        this.endTime = Date.now();
        const duration = this.endTime - this.startTime;

        if (process.env.TRACING_ENABLED === 'true') {
            logger.debug({
                trace: {
                    traceId: this.context.traceId,
                    spanId: this.context.spanId,
                    parentId: this.context.parentId,
                    name: this.name,
                    durationMs: duration,
                    tags: this.tags
                }
            }, `TRACE: ${this.name} (${duration}ms)`);
        }
    }
}

class ConsoleTracer implements Tracer {
    startSpan(name: string, parentContext?: SpanContext): Span {
        return new ConsoleSpan(name, parentContext);
    }

    extract(headers: Record<string, string>): SpanContext | null {
        const traceParent = headers['traceparent'];
        if (!traceParent) return null;

        // Parse W3C traceparent format: version-traceId-spanId-flags
        const parts = traceParent.split('-');
        if (parts.length >= 3) {
            return {
                traceId: parts[1],
                spanId: parts[2]
            };
        }
        return null;
    }

    inject(context: SpanContext, headers: Record<string, string>): void {
        // W3C traceparent format
        headers['traceparent'] = `00-${context.traceId}-${context.spanId}-01`;
    }
}

// ============================================
// OpenTelemetry Tracer Stub (Production)
// ============================================

class OtelTracerStub implements Tracer {
    constructor() {
        logger.info('OTEL_STUB: OpenTelemetry tracer stub initialized. Install @opentelemetry/* packages for real tracing.');
    }

    startSpan(name: string, parentContext?: SpanContext): Span {
        // STUB: Would create actual OTEL span
        return new ConsoleSpan(name, parentContext);
    }

    extract(headers: Record<string, string>): SpanContext | null {
        // STUB: Would use OTEL propagation
        return new ConsoleTracer().extract(headers);
    }

    inject(context: SpanContext, headers: Record<string, string>): void {
        // STUB: Would use OTEL propagation
        new ConsoleTracer().inject(context, headers);
    }
}

// ============================================
// Factory
// ============================================

let _tracer: Tracer | null = null;

export function getTracer(): Tracer {
    if (_tracer) return _tracer;

    const provider = process.env.TRACING_PROVIDER || 'console';

    switch (provider) {
        case 'otel':
            _tracer = new OtelTracerStub();
            break;
        case 'console':
        default:
            _tracer = new ConsoleTracer();
            break;
    }

    return _tracer;
}

// ============================================
// Convenience Wrappers
// ============================================

/**
 * Wrap an async function with tracing
 */
export async function withSpan<T>(
    name: string,
    fn: (span: Span) => Promise<T>,
    parentContext?: SpanContext
): Promise<T> {
    const span = getTracer().startSpan(name, parentContext);
    try {
        const result = await fn(span);
        span.setTag('status', 'success');
        return result;
    } catch (err) {
        span.setTag('status', 'error');
        span.setTag('error.message', err instanceof Error ? err.message : 'Unknown error');
        throw err;
    } finally {
        span.finish();
    }
}

/**
 * Fastify hook for request tracing
 * Add to your Fastify instance with: app.addHook('onRequest', createRequestTraceHook())
 */
export function createRequestTraceHook() {
    return async (request: any, reply: any) => {
        const tracer = getTracer();
        const parentContext = tracer.extract(request.headers);
        const span = tracer.startSpan(`HTTP ${request.method} ${request.routerPath || request.url}`, parentContext || undefined);

        span.setTag('http.method', request.method);
        span.setTag('http.url', request.url);

        // Store span on request for later use
        request.traceSpan = span;

        // Finish span on response
        reply.raw.on('finish', () => {
            span.setTag('http.status_code', reply.statusCode);
            span.finish();
        });
    };
}
