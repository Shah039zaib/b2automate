# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

B2Automate is a multi-tenant WhatsApp automation SaaS platform with AI-powered responses, subscription billing, and admin controls. Built as an npm workspace monorepo with separate frontend (React/Vite) and backend (Fastify) applications, plus shared packages.

**Critical Architecture Principles:**
- **Multi-Tenancy First**: Every database query MUST include `tenantId` filter. Tenant isolation is enforced at middleware level (`apps/api/src/middleware/tenant-context.ts`).
- **Queue-Based Architecture**: WhatsApp operations run via BullMQ queues (`OUTBOUND_MESSAGES`, `INBOUND_EVENTS`, `WORKER_COMMANDS`). The API never directly interacts with Baileys - all WhatsApp operations go through Redis queues to the worker.
- **Separation of Concerns**: API server produces jobs, WhatsApp worker consumes jobs. This allows horizontal scaling and crash isolation.

## Common Commands

### Installation & Setup
```bash
# Install all workspace dependencies
npm install

# Generate Prisma client (REQUIRED before building)
npm run db:generate --workspace=packages/database

# Run database migrations
npm run db:migrate --workspace=packages/database
```

### Building Packages
**CRITICAL**: Packages must be built in dependency order before running apps:

```bash
# 1. Build independent packages first
npm run build --workspace=packages/logger
npm run build --workspace=packages/shared-types

# 2. Build packages with dependencies
npm run build --workspace=packages/ai-core

# Note: @b2automate/database uses source files directly via tsconfig paths, no build needed
```

### Development Workflow
```bash
# Start Redis (required for all operations)
docker run -d --name redis -p 6379:6379 redis:7-alpine

# Terminal 1: API Server (port 3000)
npm run dev --workspace=apps/api

# Terminal 2: Tenant Web App (port 5173)
npm run dev --workspace=apps/web

# Terminal 3: Admin Dashboard (port 5174)
npm run dev --workspace=apps/admin

# Terminal 4: WhatsApp Worker (background, no port)
npm run dev --workspace=apps/whatsapp-worker
```

### Testing
```bash
# Run tests for API (limited test coverage currently)
npm run test --workspace=apps/api

# Watch mode
npm run test:watch --workspace=apps/api
```

### Database Operations
```bash
# Create new migration (after schema.prisma changes)
npm run db:migrate --workspace=packages/database

# Deploy migrations to production
npx prisma migrate deploy --schema=./packages/database/prisma/schema.prisma

# Reset database (DEV ONLY - destroys all data)
npx prisma migrate reset --schema=./packages/database/prisma/schema.prisma

# Open Prisma Studio (GUI for database)
npx prisma studio --schema=./packages/database/prisma/schema.prisma
```

## High-Level Architecture

### Monorepo Structure
```
apps/
├── api/                 # Fastify REST API (port 3000)
├── web/                 # Tenant dashboard (React/Vite, port 5173)
├── admin/               # Super Admin dashboard (React/Vite, port 5174)
└── whatsapp-worker/     # BullMQ worker for WhatsApp operations (Baileys)

packages/
├── database/            # Prisma schema & client (source imports, no build)
├── logger/              # Pino logger wrapper (must build first)
├── shared-types/        # TypeScript types & queue definitions (must build first)
└── ai-core/             # AI provider implementations (depends on logger)
```

### Critical Data Flow Patterns

#### WhatsApp Message Flow (Outbound)
1. **API receives request** → validates tenant + auth → creates job payload
2. **API adds job to `OUTBOUND_MESSAGES` queue** via BullMQ
3. **WhatsApp worker picks up job** → retrieves Baileys session → sends message with anti-ban delays
4. **Worker logs to database** via inbound events queue

**NEVER call Baileys directly from API. Always use queues.**

#### WhatsApp Session Management
- Sessions stored in Redis with keys: `whatsapp:session:{tenantId}`
- QR codes stored temporarily: `whatsapp:qr:{tenantId}`
- Session state managed by `SessionManager` in worker (`apps/whatsapp-worker/src/session-manager.ts`)
- Commands sent via `WORKER_COMMANDS` queue: `START_SESSION`, `STOP_SESSION`, `REQUEST_PAIRING_CODE`

#### Multi-Tenant Request Flow
1. **Request arrives** → `tenantContextMiddleware` runs (sets `req.tenantId`)
2. **Authentication** → JWT decoded → `req.tenantId` set from token
3. **RBAC check** → `requireRole()` middleware validates user permissions
4. **Service layer** → MUST filter all queries by `req.tenantId`

### Authentication & Authorization

**JWT Structure:**
```typescript
{
  id: string;        // User ID
  role: UserRole;    // SUPER_ADMIN | TENANT_ADMIN | STAFF
  tenantId: string;  // Tenant isolation key
}
```

**RBAC Middleware** (`apps/api/src/middleware/rbac.ts`):
- `requireSuperAdmin` - Super Admin only
- `requireTenantAdmin` - Tenant Admin or Super Admin
- `requireAnyRole` - Any authenticated user
- `requireRole(['ROLE1', 'ROLE2'])` - Custom role requirements

**Token Blacklist**: Logout immediately revokes tokens via Redis blacklist (`auth:{token}` keys with TTL).

### AI Governance Architecture

**Per-Tenant AI Controls** (managed by Super Admin):
- `aiPlan`: FREE | PAID_BASIC | PAID_PRO | ENTERPRISE
- `aiTier`: FREE | LOW | MEDIUM | HIGH (controls which models are available)
- `aiDailyLimit` / `aiMonthlyLimit`: Usage quotas
- `isAiEnabled`: Kill switch (immediate AI disable for tenant)

**AI Request Flow:**
1. Check `SystemSettings.globalAiEnabled` (global kill switch)
2. Check `Tenant.isAiEnabled` (tenant kill switch)
3. Check usage against limits via `AiGovernanceService`
4. Route to provider via `AiOrchestrator` (OpenAI, OpenRouter, or Mock)
5. Log usage to `AiUsageLog` table

**AI Providers** (`packages/ai-core/src/`):
- `MockProvider`: Development/testing (always returns canned responses)
- `OpenAIProvider`: Direct OpenAI integration
- `OpenRouterProvider`: Access to 400+ models via OpenRouter

### BullMQ Queue Definitions

**Queue Names** (`packages/shared-types/src/queues.ts`):
- `OUTBOUND_MESSAGES`: Messages to send via WhatsApp
- `INBOUND_EVENTS`: Incoming WhatsApp events (messages, connection updates)
- `WORKER_COMMANDS`: Control commands (start/stop sessions, QR requests)

**Retry Strategy**: 3 attempts with exponential backoff (1s, 2s, 4s). Failed jobs remain in Redis `failed` set for admin review.

### Database Schema Highlights

**Tenant Isolation**: Every model (except `User`, `SystemSettings`) has `tenantId` foreign key.

**Key Models:**
- `Tenant`: Multi-tenant root entity with AI governance fields
- `User`: Belongs to tenant, has role (SUPER_ADMIN spans all tenants)
- `Conversation`: WhatsApp conversation thread (unique per tenantId + customerJid)
- `Message`: Individual messages with media support
- `Service`: Billable services offered by tenant
- `Order`: Customer orders with approval workflow
- `Subscription`: Stripe subscription (1:1 with tenant)
- `SubscriptionPlan`: Super Admin managed plans with AI tier mapping
- `AiUsageLog`: Detailed AI usage tracking for billing
- `SystemSettings`: Singleton row (id="system") for global settings

**Enums to Know:**
- `UserRole`: SUPER_ADMIN, TENANT_ADMIN, STAFF
- `TenantStatus`: ACTIVE, SUSPENDED, ARCHIVED
- `OrderStatus`: DRAFT, PENDING_APPROVAL, APPROVED, REJECTED, CANCELLED, COMPLETED
- `ConversationStatus`: OPEN, ASSIGNED, RESOLVED, CLOSED
- `MessageDirection`: INBOUND, OUTBOUND
- `AiPlan`: FREE, PAID_BASIC, PAID_PRO, ENTERPRISE
- `AiTier`: FREE, LOW, MEDIUM, HIGH

### Environment Variables

**Required for API:**
- `DATABASE_URL`: PostgreSQL connection (pooled)
- `DIRECT_URL`: PostgreSQL direct connection (for migrations)
- `REDIS_URL`: Redis connection URL
- `JWT_SECRET`: MUST be ≥32 characters (enforced at startup, app will crash if missing)

**Required for Worker:**
- `REDIS_URL`: Same Redis as API
- `WHATSAPP_MESSAGE_RATE_LIMIT`: Global rate limit per tenant (default: 5)
- `WHATSAPP_CUSTOMER_RATE_LIMIT`: Messages per customer (default: 10)
- `WHATSAPP_CUSTOMER_RATE_WINDOW`: Rate window in seconds (default: 60)

**Optional AI Providers:**
- `AI_PROVIDER`: mock | openai | openrouter (default: mock)
- `OPENAI_API_KEY`: Required if AI_PROVIDER=openai
- `OPENROUTER_API_KEY`: Required if AI_PROVIDER=openrouter
- `OPENROUTER_MODEL`: Model selection for OpenRouter (default: google/gemini-2.0-flash-exp:free)

**Stripe Billing (optional):**
- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`

## Critical Development Rules

### Multi-Tenancy Enforcement
**NEVER** write a database query without filtering by `tenantId` (except for Super Admin accessing cross-tenant data):

```typescript
// ❌ WRONG - No tenant isolation
const orders = await prisma.order.findMany();

// ✅ CORRECT - Tenant filtered
const orders = await prisma.order.findMany({
  where: { tenantId: req.tenantId }
});
```

### WhatsApp Operations
**NEVER** import or use Baileys in the API server. All WhatsApp operations MUST go through BullMQ queues:

```typescript
// ❌ WRONG - Direct Baileys usage in API
import makeWASocket from '@whiskeysockets/baileys';
const sock = makeWASocket(...);

// ✅ CORRECT - Queue-based
import { Queue } from 'bullmq';
import { QUEUE_NAMES, OutboundMessagePayload } from '@b2automate/shared-types';

await outboundQueue.add('send-message', {
  tenantId: req.tenantId,
  to: phoneNumber,
  type: 'text',
  content: messageText
});
```

### Anti-Ban WhatsApp Behavior
The worker implements human-like delays to avoid WhatsApp bans (`apps/whatsapp-worker/src/index.ts:207-243`):
1. Send "online" presence
2. Random read delay (0.5-1.5s)
3. Send "composing" (typing) indicator
4. Typing delay based on message length (~40 chars/sec + jitter)
5. Send "paused" indicator
6. Small pause (100-400ms)
7. Send message
8. Mark "unavailable" after 2s

**Never bypass these delays** - they're critical for anti-ban protection.

### AI Provider Usage
AI calls must go through `AiOrchestrator` (`apps/api/src/services/ai-orchestrator.ts`), which:
1. Checks governance limits
2. Logs usage to `AiUsageLog`
3. Routes to correct provider
4. Applies guardrails

**Never call AI providers directly** - always use the orchestrator.

### RBAC Pattern
Protected routes use `preHandler` with RBAC middleware:

```typescript
// Super Admin only
app.get('/admin/tenants', {
  preHandler: [app.authenticate, requireSuperAdmin]
}, handler);

// Tenant Admin or Super Admin
app.post('/services', {
  preHandler: [app.authenticate, requireTenantAdmin]
}, handler);

// Any authenticated user
app.get('/orders', {
  preHandler: [app.authenticate, requireAnyRole]
}, handler);
```

### Error Handling
The API uses a global error handler (`apps/api/src/middleware/error-handler.ts`) that:
- Sanitizes errors for client (never leaks stack traces in production)
- Logs errors with structured logging (Pino)
- Returns consistent error format

### Logging Standards
Use structured logging via `@b2automate/logger`:

```typescript
import { logger } from '@b2automate/logger';

logger.info({ tenantId, userId }, 'User logged in');
logger.error({ err, tenantId }, 'Failed to process order');
```

**Never use `console.log`** - it breaks structured logging in production.

## Package Dependencies

**Build Order Critical Path:**
```
logger (no deps) → build first
shared-types (no deps) → build first
ai-core (depends on logger) → build after logger
database (no build, source imports only)
```

**TypeScript Path Mapping** (`tsconfig.base.json`):
- All packages use `NodeNext` module resolution
- Composite projects enabled for incremental builds
- Apps import packages via workspace references

## Testing Notes

- Test infrastructure exists via Vitest (`apps/api/vitest.config.ts`)
- Current test coverage is minimal (acknowledged technical debt)
- Tests run with: `npm run test --workspace=apps/api`

## Production Deployment

The project includes Docker Compose with memory optimizations for 1GB RAM environments (Oracle Cloud Always Free tier):

**Memory Allocation:**
- API: 300 MB
- Worker: 300 MB
- Redis: 100 MB
- Nginx: 50 MB
- OS: 250 MB reserved

**Deployment Flow:**
1. Build frontend apps (`apps/web` and `apps/admin`)
2. Build Docker images via `Dockerfile.api` and `Dockerfile.worker`
3. Start via `docker-compose.yml`
4. Nginx serves static files and proxies API requests

**Health Checks:**
- API: `/health` endpoint checks database connectivity
- Worker: Monitored via BullMQ job processing

## Security Notes

**JWT Secret Enforcement**: The API crashes at startup if `JWT_SECRET` is missing or <32 characters (`apps/api/src/index.ts:14-32`). This is intentional - never bypass this check.

**Token Revocation**: Logout immediately blacklists tokens in Redis. The `authenticate` decorator checks blacklist on every request (`apps/api/src/index.ts:144-150`).

**Rate Limiting**: Two-tier approach:
1. Nginx: 10 req/sec per IP (burst 20)
2. Fastify: 100 req/min per tenant (configured in `apps/api/src/config/rate-limit.ts`)

**Input Validation**: All API routes use Zod schemas via `fastify-type-provider-zod` for runtime validation.

## Common Pitfalls

1. **Forgetting to build packages**: Apps will fail to import if packages aren't built. Always build `logger` and `shared-types` first.

2. **Missing tenantId in queries**: This breaks multi-tenancy. Always filter by `req.tenantId`.

3. **Using Baileys in API**: API should never import Baileys. Use BullMQ queues.

4. **Skipping anti-ban delays**: WhatsApp will ban accounts that send messages too fast. Never remove the delays in the worker.

5. **Not checking Redis connection**: Both API and worker require Redis. If Redis is down, operations will fail silently or timeout.

6. **Forgetting Prisma generate**: After schema changes, run `npm run db:generate --workspace=packages/database` before building.

7. **Environment variable typos**: Missing `JWT_SECRET` will crash the API. Missing `DATABASE_URL` will cause Prisma to fail.

## Module Organization (API)

**Route Modules** (`apps/api/src/modules/`):
- `auth/` - Login, logout, token refresh
- `admin/` - Super Admin tenant management, AI usage dashboard, plan management
- `whatsapp/` - Session management, send message, fetch QR
- `services/` - CRUD for billable services
- `orders/` - Order management with approval workflow
- `conversations/` - Search and manage WhatsApp conversations
- `scheduled-messages/` - Message scheduling
- `templates/` - Message template CRUD
- `tenant/` - Tenant settings and team management
- `checkout/` - Stripe checkout flow
- `webhooks/` - Stripe webhook handlers
- `manual-payments/` - Manual payment submission and review (EasyPaisa, JazzCash, Bank)
- `growth/` - Growth settings (GA, FB Pixel, coupons)
- `system/` - Global system settings

**Services** (`apps/api/src/services/`):
- `ai-orchestrator.ts` - Routes AI requests to providers
- `ai-governance.service.ts` - Enforces AI limits and tier restrictions
- `ai-usage.service.ts` - Tracks AI usage for billing
- `subscription.service.ts` - Stripe subscription management
- `stripe.service.ts` - Stripe API wrapper
- `manual-payment.service.ts` - Manual payment processing
- `audit-logger.ts` - Audit log service
- `bootstrap.service.ts` - Startup initialization (creates singleton rows)

**Workers** (`apps/api/src/workers/`):
- `event-processor.ts` - Processes inbound WhatsApp events (messages, connection updates)
- `scheduled-message-processor.ts` - Sends scheduled messages at specified times

## Frontend Architecture

Both `apps/web` (tenant UI) and `apps/admin` (Super Admin UI) use:
- **React 18.3** with TypeScript
- **Vite** for dev server and build
- **TailwindCSS** for styling
- **TanStack Query** for server state management
- **Framer Motion** for animations
- **React Router DOM 7** for routing
- **Axios** for HTTP requests

**API Base URL**: Configured via `VITE_API_URL` environment variable (defaults to `http://localhost:3000`).

**Authentication**: JWT tokens stored in localStorage, included in Axios headers via interceptors.

## Additional Documentation

For more detailed information, see:
- `README.md` - Full setup guide with troubleshooting
- `prd.md` - Product Requirements Document
- `ORACLE_DEPLOYMENT.md` - Oracle Cloud deployment guide
- `OPERATOR_RUNBOOK.md` - Operations and maintenance procedures