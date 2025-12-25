# B2Automate - Product Requirements Document

> **Document Version:** 1.0  
> **Last Updated:** 2025-12-25  
> **Status:** VERIFIED AGAINST CODEBASE

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [System Architecture](#2-system-architecture)
3. [Authentication and Authorization](#3-authentication-and-authorization)
4. [Multi-Tenancy Model](#4-multi-tenancy-model)
5. [AI System and Governance](#5-ai-system-and-governance)
6. [WhatsApp Automation System](#6-whatsapp-automation-system)
7. [Billing and Subscriptions](#7-billing-and-subscriptions)
8. [Growth and Marketing System](#8-growth-and-marketing-system)
9. [Frontend System](#9-frontend-system)
10. [Database Design](#10-database-design)
11. [Operations and Safety](#11-operations-and-safety)
12. [Security Considerations](#12-security-considerations)
13. [Current Limitations and Risks](#13-current-limitations-and-risks)
14. [What Is Intentionally Disabled](#14-what-is-intentionally-disabled)
15. [System Readiness](#15-system-readiness)
16. [Glossary](#16-glossary)

---

## 1. Product Overview

### Product Name

B2Automate (WhatsApp AI SaaS)

### Summary

B2Automate is a multi-tenant SaaS platform that enables businesses to automate customer service and order management through WhatsApp. The system integrates AI-powered chat responses with human handoff capabilities, allowing businesses to handle customer inquiries at scale while maintaining personal touch when needed.

### Core Problem

Small and medium businesses spend significant time manually responding to repetitive WhatsApp inquiries. This platform automates routine responses using AI while preserving human oversight for complex cases, reducing response time from hours to seconds.

### Target Users

| User Type | Role | Responsibilities |
|-----------|------|------------------|
| SaaS Owner | SUPER_ADMIN | Platform-wide configuration, tenant management, billing plans, AI governance, system health |
| Business Owner | TENANT_ADMIN | Business configuration, team management, billing, AI settings toggle, service catalog |
| Sales Staff | STAFF | Order processing, conversation handling, limited access (no billing/settings) |
| End Customers | External | WhatsApp users who interact with tenant businesses |

---

## 2. System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND LAYER                                 │
├─────────────────────────┬───────────────────────────────────────────────┤
│   apps/web (Tenant UI)  │            apps/admin (Super Admin UI)        │
│   - React 18 + Vite     │            - React 18 + Vite                  │
│   - TanStack Query      │            - Separate deployment              │
│   - Tailwind CSS        │            - Platform-wide controls           │
└───────────┬─────────────┴───────────────────┬───────────────────────────┘
            │                                 │
            ▼                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                             apps/api                                     │
│                         (FastifyJS REST API)                            │
│  - JWT Authentication    - RBAC Middleware    - Multi-tenant isolation  │
│  - Stripe Integration    - AI Orchestration   - BullMQ queues          │
└───────────┬─────────────────────────┬───────────────────────────────────┘
            │                         │
            ▼                         ▼
┌───────────────────────┐   ┌─────────────────────────────────────────────┐
│   PostgreSQL (Supabase)│   │         apps/whatsapp-worker               │
│   - Prisma ORM        │   │   - Baileys (Unofficial WhatsApp API)      │
│   - 25+ Models        │   │   - Redis Auth State                       │
│   - Multi-tenant RLS  │   │   - BullMQ Consumer                        │
└───────────────────────┘   │   - Session Management                      │
                            └─────────────────────────────────────────────┘
                                          │
                                          ▼
                            ┌─────────────────────────────────────────────┐
                            │                 Redis                        │
                            │   - Session State    - Token Blacklist      │
                            │   - Rate Limiting    - QR Code Storage      │
                            │   - BullMQ Queues                           │
                            └─────────────────────────────────────────────┘
```

### Monorepo Structure

```
b2automate/
├── apps/
│   ├── api/              # FastifyJS REST API
│   ├── web/              # Tenant React app
│   ├── admin/            # Super Admin React app
│   └── whatsapp-worker/  # WhatsApp session manager
├── packages/
│   ├── ai-core/          # AI providers and guardrails
│   ├── database/         # Prisma schema and client
│   ├── logger/           # Pino-based structured logging
│   └── shared-types/     # TypeScript type definitions
└── docs/                 # Technical documentation
```

### Component Responsibilities

| Component | Technology | Primary Responsibility |
|-----------|------------|----------------------|
| apps/api | Fastify + TypeScript | REST API, authentication, business logic, queue management |
| apps/web | React + Vite | Tenant-facing dashboard, order management, settings |
| apps/admin | React + Vite | Super Admin controls, tenant management, AI governance |
| apps/whatsapp-worker | Node.js + Baileys | WhatsApp session lifecycle, message processing |
| packages/ai-core | TypeScript | AI provider abstraction, guardrails, model validation |
| packages/database | Prisma + PostgreSQL | Schema definition, migrations, type-safe client |
| packages/logger | Pino | Structured JSON logging across all apps |
| packages/shared-types | TypeScript | Queue payloads, shared interfaces |

---

## 3. Authentication and Authorization

### JWT Strategy

| Token Type | Expiry | Purpose |
|------------|--------|---------|
| Access Token | 15 minutes | Short-lived API access |
| Refresh Token | 7 days | Token renewal without re-login |

### Implementation Details

- **JWT Secret**: Required environment variable. Application fails to start if missing or under 32 characters.
- **Token Blacklist**: Redis-based blacklist checked on every authenticated request. Tokens added on logout.
- **Auto-Refresh**: Frontend automatically refreshes tokens on 401 responses with request queuing to prevent race conditions.

### Account Lockout

| Parameter | Value |
|-----------|-------|
| Max Failed Attempts | 5 |
| Lockout Duration | 15 minutes |
| Storage | Redis with TTL |
| Increment | Per failed login attempt |

### RBAC Roles

| Role | Scope | Capabilities |
|------|-------|--------------|
| SUPER_ADMIN | Platform | All operations across all tenants, billing plans, AI governance |
| TENANT_ADMIN | Tenant | Team management, settings, billing, AI toggle, full tenant access |
| STAFF | Tenant | Orders, conversations, services. No access to settings/billing/team |

### Route-Level Enforcement

```typescript
// API middleware chain
authenticate (JWT verify) -> extractTenant (tenantId) -> rbac (role check)
```

- `apps/api/src/middleware/rbac.ts`: Validates user role against required permission
- All tenant routes require `authenticate` hook
- Admin-only routes use `requireTenantAdmin` middleware

### Frontend Route Guards

| Guard | Behavior |
|-------|----------|
| PrivateRoute | Requires authentication, redirects to /login |
| PublicRoute | Authenticated users redirect to /dashboard |
| AdminRoute | Requires TENANT_ADMIN role, STAFF redirects to /dashboard |

### Email Verification

- **Status**: Implemented but disabled by default
- **Toggle**: `SystemSettings.emailVerificationRequired`
- **Endpoints**: POST /auth/verify-email, POST /auth/resend-verification
- **Behavior when disabled**: Endpoints return 501, users can login immediately

### Password Reset

- **Status**: Implemented with toggle control
- **Toggle**: `SystemSettings.passwordResetEnabled`
- **Flow**: Email with single-use token (24hr expiry) -> POST /auth/reset-password
- **Security**: No email enumeration, generic success responses

---

## 4. Multi-Tenancy Model

### Tenant Isolation Strategy

All data access is strictly isolated by `tenantId`. This is enforced at multiple layers:

1. **Middleware Layer**: `extractTenant` middleware extracts tenantId from JWT payload
2. **Query Layer**: All Prisma queries include `tenantId` filter
3. **Route Layer**: tenantId is NEVER accepted from request body (prevents spoofing)

### Implementation Pattern

```typescript
// Every tenant query follows this pattern
const orders = await prisma.order.findMany({
    where: { tenantId: req.user.tenantId }  // Always from JWT, never from request
});
```

### Prevention of Tenant Spoofing

| Attack Vector | Mitigation |
|---------------|------------|
| tenantId in request body | Ignored, always extracted from JWT |
| Cross-tenant API calls | Middleware validates tenantId before any operation |
| Direct database queries | Prisma client configured with tenant isolation |

### Tenant Lifecycle

| Status | Description |
|--------|-------------|
| ACTIVE | Normal operation |
| SUSPENDED | API access blocked, login allowed |
| ARCHIVED | Soft deleted, no access |

---

## 5. AI System and Governance

### AI Providers

| Provider | Status | Configuration |
|----------|--------|---------------|
| Mock | Available | Default provider, returns canned responses |
| OpenAI | Available | Requires `OPENAI_API_KEY` environment variable |
| OpenRouter | Available | Requires `OPENROUTER_API_KEY`, supports model routing |

### Provider Selection

- **Default**: `mock` (safe for development)
- **Configuration**: `SystemSettings.defaultAiProvider`
- **Per-tenant override**: Not currently supported

### AI Plan and Tier System

| AI Plan | Tier | Daily Limit | Monthly Limit | Model Access |
|---------|------|-------------|---------------|--------------|
| FREE | FREE | 50 | 1000 | gemini-2.0-flash-exp:free |
| PAID_BASIC | LOW | 200 | 5000 | FREE models + gpt-3.5-turbo |
| PAID_PRO | MEDIUM | 500 | 15000 | LOW models + gpt-4o-mini |
| ENTERPRISE | HIGH | 2000 | 50000 | All models including gpt-4-turbo |

### Usage Limits

- **Daily Counter**: `Tenant.aiDailyUsage` - reset at midnight UTC
- **Monthly Counter**: `Tenant.aiMonthlyUsage` - reset on billing cycle
- **Enforcement**: Pre-checked before every AI call

### Kill Switches

| Switch | Scope | Location | Effect |
|--------|-------|----------|--------|
| Global AI | Platform | `SystemSettings.globalAiEnabled` | Disables AI for ALL tenants |
| Tenant AI | Tenant | `Tenant.isAiEnabled` | Disables AI for specific tenant |
| Global WhatsApp | Platform | `SystemSettings.globalWhatsappEnabled` | Stops all WhatsApp sessions |
| Tenant WhatsApp | Tenant | `Tenant.isWhatsappEnabled` | Stops specific tenant's sessions |

### AI Guardrails

Implemented in `packages/ai-core/src/guardrails.ts`:

| Guardrail | Purpose |
|-----------|---------|
| Price Detection | Regex pattern to detect price mentions in responses |
| Prohibited Phrases | Configurable blocklist (e.g., competitor names, profanity) |
| Leetspeak Normalization | Converts l33t speak to detect bypass attempts |
| Confidence Threshold | 85% minimum, below triggers human escalation |

### Fallback Logic

When AI fails or is blocked:

1. Log block reason to `AiUsageLog` with `wasBlocked=true`
2. Return fallback message: "Thank you for your message. A team member will assist you shortly."
3. Escalate conversation to human agent

### AI Usage Logging

Every AI request is logged to `AiUsageLog`:

- `model`: Model used
- `tier`: Tenant's tier at request time
- `inputTokens`, `outputTokens`: Token usage
- `cost`: Estimated cost in USD
- `wasBlocked`: Whether request was blocked
- `blockReason`: LIMIT_EXCEEDED, MODEL_NOT_ALLOWED, GLOBAL_AI_DISABLED, etc.

---

## 6. WhatsApp Automation System

### Baileys Integration

- **Library**: @whiskeysockets/baileys (unofficial WhatsApp Web API)
- **Authentication**: Multi-device protocol with Redis state persistence
- **Risk**: Legal gray area, WhatsApp could ban numbers

### Session Lifecycle

```
┌─────────────┐    ┌─────────────────┐    ┌──────────────────┐
│ START_SESSION├───►│ QR Generated    ├───►│ User Scans QR    │
└─────────────┘    │ (Redis, 60s TTL)│    └────────┬─────────┘
                   └─────────────────┘             │
                                                   ▼
┌─────────────┐    ┌─────────────────┐    ┌──────────────────┐
│ AUTO_RECONNECT◄──│ Connection Lost  │◄───│ CONNECTED        │
│ (5s delay)   │   └─────────────────┘    │ Session Active   │
└─────────────┘                           └──────────────────┘
```

### Redis Auth State

- **Storage Key**: `whatsapp:auth:${tenantId}`
- **Data**: Serialized Baileys auth credentials
- **Benefit**: Horizontal scaling - any worker can resume session

### Session Claim Mechanism

To prevent multiple workers from managing the same session:

- Atomic claim with Redis `SETNX`
- TTL-based heartbeat (30 seconds)
- Automatic cleanup on worker shutdown

### Rate Limiting

| Limit Type | Value | Storage |
|------------|-------|---------|
| Per-Customer | 10 messages per 60 seconds | Redis sliding window |
| Global Worker | 5 messages per second | In-memory token bucket |

### Human-Like Behavior

| Behavior | Implementation |
|----------|----------------|
| Typing Indicator | `sendPresenceUpdate('composing')` before response |
| Random Read Delay | 1-3 seconds before marking messages as read |
| Response Jitter | Variable delay based on message length |

### BullMQ Queues

| Queue | Purpose |
|-------|---------|
| `worker-commands` | Control plane: START_SESSION, STOP_SESSION |
| `outbound-messages` | Messages to be sent to WhatsApp |
| `inbound-events` | Messages received from WhatsApp |

### Retry and DLQ Configuration

```typescript
{
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: 100,  // Keep last 100 completed
    removeOnFail: 500       // Keep last 500 failed (DLQ visibility)
}
```

### Media Handling

- **Status**: Implemented with skeleton storage provider
- **Download**: `downloadMediaMessage()` from Baileys
- **Storage**: Placeholder URLs until real provider configured
- **Schema Fields**: `mediaUrl`, `mimeType`, `fileSize`, `mediaKey`

---

## 7. Billing and Subscriptions

### Stripe Integration

#### Checkout Flow

1. Tenant selects plan on pricing page
2. API creates Stripe Checkout Session with tenant metadata
3. User redirected to Stripe-hosted checkout
4. On success, Stripe fires `checkout.session.completed` webhook
5. API creates Subscription record and applies AI tier to tenant

#### Webhook Events Processed

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Create subscription, apply AI tier |
| `customer.subscription.updated` | Update status, period dates |
| `customer.subscription.deleted` | Mark canceled, downgrade to FREE |
| `invoice.payment_failed` | Update status to PAST_DUE |

#### Webhook Security

- Signature verification using `stripe.webhooks.constructEvent()`
- Idempotency via `StripeWebhookEvent` table (event ID deduplication)

### Subscription Plans

Managed by Super Admin via database. Each plan includes:

- `stripeProductId`: Stripe product reference
- `stripePriceId`: Stripe price reference (unique)
- `aiPlan`, `aiTier`: Governance settings applied on subscription
- `aiDailyLimit`, `aiMonthlyLimit`: Usage caps

### Subscription Status Lifecycle

```
INCOMPLETE → ACTIVE → PAST_DUE → CANCELED
     │          │
     └──────────┴── Can also → TRIALING (if trial enabled)
```

### Auto AI Tier Enforcement

On subscription creation or update:

1. Fetch plan's AI settings
2. Update tenant: `aiPlan`, `aiTier`, `aiDailyLimit`, `aiMonthlyLimit`
3. Reset usage counters

### Manual Payments

For markets without Stripe access:

| Method | Status |
|--------|--------|
| EasyPaisa | Supported |
| JazzCash | Supported |
| Bank Transfer | Supported |

#### Flow

1. Tenant submits payment via `/manual-payments/submit` with screenshot
2. Payment enters PENDING status
3. Super Admin reviews in admin panel
4. On APPROVE: AI tier applied to tenant
5. On REJECT: Rejection reason provided

### Payment Status Visibility

- Tenants can view their payment history in Billing page
- Status badges: PENDING (amber), APPROVED (green), REJECTED (red)

---

## 8. Growth and Marketing System

### Google Analytics Integration

| Setting | Location | Default |
|---------|----------|---------|
| `gaEnabled` | GrowthSettings | false |
| `gaMeasurementId` | GrowthSettings | null |

When enabled, GA4 script injected into frontend pages.

### Facebook Pixel Integration

| Setting | Location | Default |
|---------|----------|---------|
| `fbPixelEnabled` | GrowthSettings | false |
| `fbPixelId` | GrowthSettings | null |

When enabled, Meta Pixel script injected for conversion tracking.

### Coupon System

| Field | Purpose |
|-------|---------|
| `couponEnabled` | Master toggle |
| `couponCode` | Display code |
| `couponType` | PERCENTAGE or FIXED |
| `couponValue` | Percentage (0-100) or cents |
| `couponExpiresAt` | Expiration timestamp |
| `couponStripeCouponId` | Must match Stripe coupon for checkout |

### Coupon Banner Logic

- Component: `apps/web/src/components/CouponBanner.tsx`
- Displayed only when `couponEnabled = true` and not expired
- Auto-apply: Coupon code prefilled in checkout link

---

## 9. Frontend System

### Web Application (Tenant)

| Page | Access | Purpose |
|------|--------|---------|
| Landing | Public | Marketing page |
| Pricing | Public | Plan comparison |
| Login | Public | Authentication |
| Onboarding | Public | Tenant registration |
| Dashboard | Private | Overview metrics |
| Services | Private | Service catalog management |
| Orders | Private | Order management |
| Inbox | Private | WhatsApp conversations |
| Analytics | Private | Usage statistics |
| Settings | Admin | Tenant configuration |
| Team | Admin | User management |
| Billing | Admin | Subscription and payments |

### Admin Application (Super Admin)

| Page | Purpose |
|------|---------|
| Dashboard | Platform metrics, tenant overview |
| Tenants | Tenant CRUD, status management |
| AI Governance | Global AI settings, tier management |
| Billing Plans | Plan CRUD, Stripe sync |
| Growth Controls | GA, FB Pixel, Coupon configuration |
| Manual Payments | Review and approve payments |
| Audit Logs | Platform-wide activity logs |
| System Settings | Kill switches, email configuration |

### Code Splitting

Implemented via React.lazy for performance:

| Lazy-Loaded Page | Bundle Size |
|------------------|-------------|
| Billing | 10.14 kB |
| Analytics | 9.23 kB |
| Settings | 8.41 kB |
| Team | 5.66 kB |
| Inbox | 4.33 kB |

### Design System

| Element | Implementation |
|---------|----------------|
| Colors | Primary-600 (blue), semantic colors for status |
| Typography | Inter font via Google Fonts |
| Components | Custom Button, Card, Input with consistent styling |
| Motion | Framer Motion for transitions |
| Icons | Lucide React icon set |

---

## 10. Database Design

### Core Models Overview

| Model | Purpose | Key Fields |
|-------|---------|------------|
| Tenant | Business entity | status, aiTier, stripeCustomerId |
| User | Application user | email, role, tenantId |
| Service | Product catalog | name, price, isActive |
| Order | Purchase record | status, totalAmount, customerJid |
| Conversation | WhatsApp thread | customerJid, status, assignedTo |
| Message | Individual message | direction, type, content, mediaUrl |

### Singleton Tables

| Table | Purpose | ID Strategy |
|-------|---------|------------|
| SystemSettings | Platform configuration | Fixed ID: "system" |
| GrowthSettings | Marketing configuration | Single UUID row |

### Bootstrap Strategy

Implemented in `apps/api/src/services/bootstrap.service.ts`:

1. On application startup, `BootstrapService.ensureSingletons()` called
2. Creates SystemSettings row if missing (safe defaults)
3. Creates GrowthSettings row if missing (all features OFF)
4. Transaction-wrapped for crash safety
5. Handles concurrent startup gracefully

### Audit Logging

Every significant action creates an AuditLog entry:

- `tenantId`: Tenant scope
- `actorUserId`: Who performed the action
- `eventType`: Structured event name
- `metadata`: JSON payload with details
- `ipAddress`: Request IP for security

### AI Usage Logs

Dedicated `AiUsageLog` table tracks:

- Per-request AI usage
- Token counts
- Cost estimates
- Block reasons
- Indexed by tenant and timestamp for analytics

---

## 11. Operations and Safety

### Kill Switches

All switches default to ENABLED and can be toggled by Super Admin:

| Switch | Effect | Recovery |
|--------|--------|----------|
| Global AI | Immediate halt of all AI responses | Toggle back to enabled |
| Tenant AI | Specific tenant loses AI | Toggle in tenant settings |
| Global WhatsApp | All sessions disconnect | Toggle + sessions auto-reconnect |
| Tenant WhatsApp | Specific tenant disconnected | Toggle + manual reconnect |

### Monitoring

- **Structured Logging**: JSON logs via Pino
- **Error Tracking**: Error handler with UUID redaction
- **Health Checks**: `/health` endpoint for load balancer

### Bootstrap Service

- **Crash Safety**: Transactions rollback on failure
- **Concurrent Safety**: Row-level locking prevents duplicates
- **Default Values**: All features disabled until explicitly enabled

### Change Control

- All schema changes require Prisma migrations
- Migrations are NOT auto-run in production
- Manual `prisma migrate deploy` required

---

## 12. Security Considerations

### JWT Handling

| Measure | Implementation |
|---------|----------------|
| Secret validation | 32+ character requirement, hard fail on missing |
| Short expiry | 15 minutes for access tokens |
| Blacklist | Redis-based, checked on every request |
| Secure storage | HttpOnly cookies option available |

### Rate Limiting

| Scope | Limit | Implementation |
|-------|-------|----------------|
| Login attempts | 5 per 15 minutes | Redis counter with TTL |
| Per-customer WhatsApp | 10 per 60 seconds | Redis sliding window |
| Global message rate | 5 per second | Token bucket |

### Brute Force Protection

- Account lockout after failed attempts
- Exponential backoff on retries
- No user enumeration in responses

### Webhook Security

- Stripe signature verification on every webhook
- Idempotency checks via event ID table
- Replay attack prevention

### Data Isolation

- tenantId in all queries
- Never trusted from request body
- Foreign key constraints enforce relations

### Error Sanitization

- UUID redaction in error responses
- Generic messages for internal errors
- Stack traces never sent to clients

---

## 13. Current Limitations and Risks

### WhatsApp Unofficial API

| Risk | Severity | Mitigation |
|------|----------|------------|
| Account bans | HIGH | Human-like behavior, rate limiting |
| API changes | MEDIUM | Baileys maintainer community |
| Legal liability | HIGH | Documentation states risk in ToS |

**Migration path documented in**: `docs/WHATSAPP_OFFICIAL_API_MIGRATION.md`

### GDPR Gaps

| Missing | Impact |
|---------|--------|
| Data deletion endpoint | Right to erasure not implemented |
| Data export endpoint | Right to portability not implemented |

### Media Storage

- **Current state**: Skeleton implementation
- **Limitation**: No actual cloud storage provider configured
- **Effect**: Media URLs are placeholders

### Email System

- **Current state**: Fully disabled
- **Limitation**: No email provider configured
- **Effect**: Password reset, verification, notifications all silent

### Single Redis Instance

- **Current state**: Single Redis connection
- **Limitation**: Single point of failure
- **Mitigation**: Redis HA configuration ready but not deployed

---

## 14. What Is Intentionally Disabled

### Email Sending

**Toggle**: `SystemSettings.emailEnabled = false`

**Reason**: No email provider is configured. Enabling without configuration would cause silent failures. Super Admin must configure SMTP/Resend/SES before enabling.

### Email Verification

**Toggle**: `SystemSettings.emailVerificationRequired = false`

**Reason**: Email sending is disabled, so verification would create phantom requirements. Users can register and login immediately.

### Password Reset Emails

**Toggle**: `SystemSettings.passwordResetEnabled = false`

**Reason**: Depends on email sending. Endpoint exists but returns gracefully when disabled.

### Media Upload to Cloud

**Toggle**: No toggle, skeleton implementation

**Reason**: Requires cloud storage provider (S3, GCS, or similar). Placeholder implementation allows development without cloud costs.

### Advanced Analytics

**Toggle**: No toggle, minimal implementation

**Reason**: AI usage trends chart added, but detailed analytics (cohort analysis, revenue charts) not prioritized for MVP.

---

## 15. System Readiness

### Readiness Assessment

| Milestone | Status | Notes |
|-----------|--------|-------|
| Demo Ready | READY | All core features functional |
| Beta Ready | READY | Multi-tenant isolation verified |
| Production Ready | READY | With documented caveats |
| Security Hardened | READY | JWT, RBAC, rate limiting implemented |

### What Is Safe Today

- Multi-tenant data isolation
- Stripe billing integration
- Manual payment processing
- AI with governance and guardrails
- WhatsApp automation (with known risks)
- User authentication and authorization

### What Requires Caution

| Area | Caution |
|------|---------|
| WhatsApp | Unofficial API, ban risk |
| Email | Not configured, all disabled |
| Media Storage | Placeholder implementation |
| Redis HA | Single instance in development |

---

## 16. Glossary

| Term | Definition |
|------|------------|
| AI Tier | Governs which AI models a tenant can access (FREE, LOW, MEDIUM, HIGH) |
| AI Plan | Commercial plan level that maps to AI Tier |
| Baileys | Unofficial WhatsApp Web API library |
| BullMQ | Redis-based queue library for Node.js |
| DLQ | Dead Letter Queue - storage for failed jobs after max retries |
| JID | Jabber ID - WhatsApp identifier format (number@s.whatsapp.net) |
| Kill Switch | Emergency toggle to disable features immediately |
| Manual Payment | Non-Stripe payment submitted with screenshot proof |
| RBAC | Role-Based Access Control |
| Tenant | A business entity using the platform |
| Tenant Admin | Business owner with full tenant access |
| Staff | Limited-access user within a tenant |
| Super Admin | Platform operator with global access |
| Guardrails | AI safety checks preventing inappropriate responses |
| Webhook | HTTP callback from external service (e.g., Stripe) |

---

*This document reflects the actual codebase state as of 2025-12-25. Any discrepancies should be verified against source code.*
